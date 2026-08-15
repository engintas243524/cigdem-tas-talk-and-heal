import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
	ANTHROPIC_API_KEY: 'test-key',
	GOOGLE_PLACES_API_KEY: 'test-key',
} as typeof env;

function stubApis() {
	const sheetsAppended: string[][] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'RakipAnalizi', gridProperties: { columnCount: 20 } } }] }),
				{
					status: 200,
				},
			);
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			sheetsAppended.push(body.values[0]);
			return new Response(
				JSON.stringify({ updates: { updatedRange: `RakipAnalizi!A${sheetsAppended.length + 1}:I${sheetsAppended.length + 1}` } }),
				{
					status: 200,
				},
			);
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: sheetsAppended }), { status: 200 });
		if (url.includes('places.googleapis.com')) {
			return new Response(
				JSON.stringify({
					places: [{ displayName: { text: 'Test Klinik' }, formattedAddress: 'Test Adres', location: { latitude: 1, longitude: 2 } }],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('maps.googleapis.com/maps/api/geocode')) {
			return new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] }), {
				status: 200,
			});
		}
		if (url.includes('api.anthropic.com')) {
			return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { sheetsAppended };
}

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('POST /panel/rakip-analizi/rakip', () => {
	it('saves a manual competitor entry', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Rakip Klinik', kaynak: 'manuel', not: "Instagram'da haftada 3 paylaşım yapıyor" }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { id: string };
		expect(data.id).toBeTruthy();
	});

	it('rejects a request with no name', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ kaynak: 'manuel' }) });
		expect(response.status).toBe(400);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('GET /panel/rakip-analizi/rakip-ara', () => {
	it('geocodes the address and returns nearby places', async () => {
		stubApis();
		const response = await authedRequest(
			'/panel/rakip-analizi/rakip-ara?adres=' +
				encodeURIComponent('Notting Hill, London') +
				'&sorgu=' +
				encodeURIComponent('psikolog') +
				'&radiusMeters=2000',
		);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { places: { name: string }[] };
		expect(data.places).toEqual([{ name: 'Test Klinik', address: 'Test Adres', lat: 1, lng: 2 }]);
	});

	it('rejects a missing address', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=&sorgu=psikolog&radiusMeters=2000');
		expect(response.status).toBe(400);
	});

	it('rejects a missing search query', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=London&sorgu=&radiusMeters=2000');
		expect(response.status).toBe(400);
	});

	it('rejects an invalid radius', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=London&sorgu=psikolog&radiusMeters=0');
		expect(response.status).toBe(400);
	});
});

describe('GET /panel/rakip-analizi/rakip-liste', () => {
	it('lists manual and map-sourced competitors, newest first, excluding report rows', async () => {
		stubApis();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'İlk Eklenen', kaynak: 'manuel', not: 'Eski not' }),
		});
		vi.setSystemTime(new Date('2026-08-15T10:05:00.000Z'));
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'İkinci Eklenen', adres: 'Kadıköy', kaynak: 'harita' }),
		});
		await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum' }),
		});

		const response = await authedRequest('/panel/rakip-analizi/rakip-liste');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { rakipler: { isim: string; kaynak: string; adres: string }[] };
		expect(data.rakipler).toHaveLength(2);
		expect(data.rakipler.map((r) => r.isim)).toEqual(['İkinci Eklenen', 'İlk Eklenen']);
		expect(data.rakipler.every((r) => r.kaynak === 'manuel' || r.kaynak === 'harita')).toBe(true);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-liste');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/icerik-strateji', () => {
	it('generates and saves a content strategy report', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Bu ay için Instagram içerik önerisi istiyorum' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { rapor: string };
		expect(data.rapor).toBe('Üretilen rapor metni.');
	});
});

describe('POST /panel/rakip-analizi/aksiyon-analiz', () => {
	it('generates and saves a goal/realization report', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/aksiyon-analiz', {
			method: 'POST',
			body: JSON.stringify({ yorum: 'Bu ay randevular biraz azaldı' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { rapor: string };
		expect(data.rapor).toBe('Üretilen rapor metni.');
	});
});
