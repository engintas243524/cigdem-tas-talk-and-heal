import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

afterEach(() => vi.unstubAllGlobals());

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
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
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'Etkinlikler', gridProperties: { columnCount: 20 } } }] }),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) {
			const body = init?.body ? JSON.parse(init.body as string) : {};
			for (const req of body.requests ?? []) {
				if (req.deleteDimension) {
					const arrIndex = req.deleteDimension.range.startIndex - 1;
					if (arrIndex >= 0 && arrIndex < sheetsAppended.length) sheetsAppended.splice(arrIndex, 1);
				}
			}
			return new Response('{}', { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			sheetsAppended.push(body.values[0]);
			return new Response(
				JSON.stringify({ updates: { updatedRange: `Etkinlikler!A${sheetsAppended.length + 1}:N${sheetsAppended.length + 1}` } }),
				{ status: 200 },
			);
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: sheetsAppended }), { status: 200 });
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { sheetsAppended, fetchMock };
}

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function plainRequest(path: string, init: RequestInit = {}) {
	const request = new Request(`http://localhost${path}`, init);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

const samplePayload = {
	category: 'workshop',
	titleEn: 'Understanding Anxiety',
	titleTr: 'Kaygıyı Anlamak',
	dateTimeEn: '14 Sept 2026, 18:00',
	dateTimeTr: '14 Eylül 2026, 18:00',
	formatEn: 'Online',
	formatTr: 'Çevrimiçi',
	descriptionEn: 'A workshop.',
	descriptionTr: 'Bir atölye.',
	ctaLabelEn: 'Reserve Spot',
	ctaLabelTr: 'Yerinizi Ayırtın',
	ctaHref: 'mailto:test@example.com',
};

describe('POST /panel/events', () => {
	it('saves a new event', async () => {
		stubApis();
		const response = await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		expect(response.status).toBe(200);
		const data = (await response.json()) as { id: string };
		expect(data.id).toBeTruthy();
	});

	it('rejects an invalid category', async () => {
		stubApis();
		const response = await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify({ ...samplePayload, category: 'x' }) });
		expect(response.status).toBe(400);
	});

	it('rejects a missing title', async () => {
		stubApis();
		const response = await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify({ ...samplePayload, titleEn: '' }) });
		expect(response.status).toBe(400);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const response = await plainRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/events - ctaHref/gorsel normalization (2026-08-19)', () => {
	it('prepends https:// to a scheme-less link so the homepage anchor never resolves as a relative path', async () => {
		stubApis();
		const response = await authedRequest('/panel/events', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, ctaHref: 'talkandheal.co.uk/masterclass' }),
		});
		expect(response.status).toBe(200);
		const listResponse = await plainRequest('/events');
		const data = (await listResponse.json()) as { events: { ctaHref: string }[] };
		expect(data.events[0].ctaHref).toBe('https://talkandheal.co.uk/masterclass');
	});

	it('leaves a link with an existing scheme (mailto:) untouched', async () => {
		stubApis();
		await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		const listResponse = await plainRequest('/events');
		const data = (await listResponse.json()) as { events: { ctaHref: string }[] };
		expect(data.events[0].ctaHref).toBe('mailto:test@example.com');
	});

	it('rejects gorunum: gorsel without a gorselUrl (validation runs before the row is ever appended)', async () => {
		stubApis();
		const noImage = await authedRequest('/panel/events', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, gorunum: 'gorsel' }),
		});
		expect(noImage.status).toBe(400);
		const listResponse = await plainRequest('/events');
		const data = (await listResponse.json()) as { events: unknown[] };
		expect(data.events).toHaveLength(0);
	});

	it('defaults gorunum to metin when omitted, and normalizes a scheme-less gorselUrl', async () => {
		stubApis();
		await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		const withImage = await authedRequest('/panel/events', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, gorunum: 'gorsel', gorselUrl: 'cdn.example.com/etkinlik.jpg' }),
		});
		expect(withImage.status).toBe(200);
		const listResponse = await plainRequest('/events');
		const data = (await listResponse.json()) as { events: { gorunum: string; gorselUrl: string }[] };
		expect(data.events.find((e) => e.gorunum === 'metin')).toBeTruthy();
		const gorselEvent = data.events.find((e) => e.gorunum === 'gorsel');
		expect(gorselEvent?.gorselUrl).toBe('https://cdn.example.com/etkinlik.jpg');
	});
});

describe('POST /panel/events-guncelle', () => {
	it('updates an existing event by id', async () => {
		stubApis();
		const created = await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		const id = ((await created.json()) as { id: string }).id;

		const response = await authedRequest('/panel/events-guncelle', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, id, titleEn: 'Updated Title' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { id: string };
		expect(data.id).toBe(id);
	});

	it('404s for an unknown id', async () => {
		stubApis();
		const response = await authedRequest('/panel/events-guncelle', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, id: 'does-not-exist' }),
		});
		expect(response.status).toBe(404);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const response = await plainRequest('/panel/events-guncelle', { method: 'POST', body: JSON.stringify({ ...samplePayload, id: 'x' }) });
		expect(response.status).toBe(401);
	});
});

describe('GET /events (public)', () => {
	it('lists events without requiring auth, omitting internal fields', async () => {
		stubApis();
		await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		const response = await plainRequest('/events');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { events: Record<string, unknown>[] };
		expect(data.events).toHaveLength(1);
		expect(data.events[0].titleEn).toBe('Understanding Anxiety');
		expect(data.events[0].id).toBeUndefined();
	});

	it('returns an empty list when no events exist', async () => {
		stubApis();
		const response = await plainRequest('/events');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { events: unknown[] };
		expect(data.events).toEqual([]);
	});
});

describe('POST /panel/events-sil', () => {
	it('deletes the selected event, leaving others intact', async () => {
		stubApis();
		await authedRequest('/panel/events', { method: 'POST', body: JSON.stringify(samplePayload) });
		const second = await authedRequest('/panel/events', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, titleEn: 'Second Event' }),
		});
		const secondId = ((await second.json()) as { id: string }).id;

		const del = await authedRequest('/panel/events-sil', { method: 'POST', body: JSON.stringify({ id: secondId }) });
		expect(del.status).toBe(200);

		const listResponse = await plainRequest('/events');
		const data = (await listResponse.json()) as { events: Record<string, unknown>[] };
		expect(data.events).toHaveLength(1);
		expect(data.events[0].titleEn).toBe('Understanding Anxiety');
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const response = await plainRequest('/panel/events-sil', { method: 'POST', body: JSON.stringify({ id: 'x' }) });
		expect(response.status).toBe(401);
	});
});
