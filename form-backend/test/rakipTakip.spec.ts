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
} as typeof env;

// Rakip Takip birden fazla sekmeyi (RakipTakip, RakipAnalizi, Sayfa1, KullanimKaydi) aynı anda
// kullandığı için stub, satır numarasını TEK global sayaçla değil sekme adına göre ayrı ayrı
// tutuyor (bkz. rakipTakipSheets.spec.ts'deki daha basit tek-sekmelik versiyon).
function stubApis(existingTabs: string[] = []) {
	const tabRows = new Map<string, Map<number, string[]>>();
	function rowsFor(tab: string) {
		if (!tabRows.has(tab)) tabRows.set(tab, new Map());
		return tabRows.get(tab)!;
	}
	function tabFromUrl(url: string): string {
		const m = decodeURIComponent(url).match(/\/values\/([^!]+)!/);
		return m ? m[1] : '';
	}
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({
					sheets: existingTabs.map((t) => ({ properties: { sheetId: 1, title: t, gridProperties: { columnCount: 20 } } })),
				}),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const rows = rowsFor(tabFromUrl(url));
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			let nextRow = Math.max(1, ...rows.keys()) + 1;
			for (const rowValues of body.values) {
				rows.set(nextRow, rowValues);
				nextRow++;
			}
			return new Response(JSON.stringify({ updates: { updatedRange: `X!A${nextRow - 1}` } }), { status: 200 });
		}
		if (method === 'PUT' && url.includes('/values/')) {
			const rows = rowsFor(tabFromUrl(url));
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const rowNumber = rowMatch ? Number(rowMatch[1]) : 1;
			rows.set(rowNumber, body.values[0]);
			return new Response('{}', { status: 200 });
		}
		if (method === 'GET' && url.includes('/values/')) {
			const rows = rowsFor(tabFromUrl(url));
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const startRow = rowMatch ? Number(rowMatch[1]) : 2;
			const maxRow = Math.max(startRow - 1, ...rows.keys());
			const values: string[][] = [];
			for (let r = startRow; r <= maxRow; r++) values.push(rows.get(r) ?? []);
			return new Response(JSON.stringify({ values }), { status: 200 });
		}
		if (url.includes('api.anthropic.com')) {
			return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { tabRows, fetchMock };
}

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('GET /panel/rakip-analizi/rakip-takip', () => {
	it('returns all 6 fixed periyot rows, seeding the tab on first call', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { periyotlar: { periyotTuru: string }[] };
		expect(data.periyotlar).toHaveLength(6);
	});

	it('requires panel auth', async () => {
		stubApis([]);
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-takip');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/rakip-takip/uret', () => {
	it('rejects an invalid periyotTuru', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'gunluk' }),
		});
		expect(response.status).toBe(400);
	});

	it('starts a brand-new period on the first call (yeniDonem)', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			asama: string;
			durum: { projeksiyon: string; hedef: string; realizasyon: string };
		};
		expect(data.asama).toBe('yeniDonem');
		expect(data.durum.projeksiyon).toBe('Üretilen rapor metni.');
		expect(data.durum.realizasyon).toBe('');
	});

	it('walks through all three loop states without ever growing the RakipTakip tab beyond 6 rows', async () => {
		const { tabRows } = stubApis([]);
		const call = () =>
			authedRequest('/panel/rakip-analizi/rakip-takip/uret', { method: 'POST', body: JSON.stringify({ periyotTuru: 'aylik' }) });

		const first = (await (await call()).json()) as { asama: string };
		expect(first.asama).toBe('yeniDonem');
		const second = (await (await call()).json()) as { asama: string };
		expect(second.asama).toBe('kapatildi');
		const third = (await (await call()).json()) as { asama: string };
		expect(third.asama).toBe('ilerletildi');

		// header (1) + 6 sabit periyot satırı = 7 — döngü kaç kez ilerlerse ilerlesin büyümemeli.
		expect(tabRows.get('RakipTakip')?.size).toBe(7);
	});

	it('requires panel auth', async () => {
		stubApis([]);
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});
