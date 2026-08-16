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

// rakipTakip.spec.ts'deki sekme-adına-duyarlı stub ile aynı desen (bkz. o dosyanın yorumu) —
// KullanimLimitleri sekmesi RakipAnalizi'den ayrı tutulmalı, karışmamalı.
function stubApis(fxRateUsd: number = 0.03) {
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
			return new Response(JSON.stringify({ sheets: [] }), { status: 200 });
		}
		if (url.includes(':batchUpdate'))
			return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 9 } } }] }), { status: 200 });
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
		if (url.includes('api.frankfurter.app')) {
			const amount = Number(new URL(url).searchParams.get('amount'));
			return new Response(JSON.stringify({ rates: { USD: amount * fxRateUsd } }), { status: 200 });
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

describe('POST /panel/rakip-analizi/kullanim-limit-arttir', () => {
	it('rejects a category that is not self-service increasable (Google categories)', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'adresBulma', tutar: 100, paraBirimi: 'TRY' }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects an invalid currency code', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 100, paraBirimi: 'lira' }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects a non-positive amount', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 0, paraBirimi: 'USD' }),
		});
		expect(response.status).toBe(400);
	});

	it('converts to USD, computes extra reports at $0.20/report, and adds to the existing limit (12 + N)', async () => {
		// 1000 TRY * 0.03 = $30 → floor(30 / 0.2) = 150 ek rapor hakkı
		stubApis(0.03);
		const response = await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 1000, paraBirimi: 'try' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { yeniLimit: number; eklenenRaporSayisi: number };
		expect(data.eklenenRaporSayisi).toBe(150);
		expect(data.yeniLimit).toBe(12 + 150); // config.ts'deki başlangıç limiti (12) + ek

		const kullanimOzet = await authedRequest('/panel/rakip-analizi/kullanim-ozet');
		const ozetData = (await kullanimOzet.json()) as { ozet: Record<string, { aylikLimit: number | null; arttirilabilir: boolean }> };
		expect(ozetData.ozet.icerikStrateji.aylikLimit).toBe(162);
		expect(ozetData.ozet.icerikStrateji.arttirilabilir).toBe(true);
		expect(ozetData.ozet.adresBulma.arttirilabilir).toBe(false);
	});

	it('logs the real spend as a "harcama" row in GiderTakibi — for the business expense table', async () => {
		const { tabRows } = stubApis(0.03);
		await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 1000, paraBirimi: 'try' }),
		});
		const giderRows = [...(tabRows.get('GiderTakibi')?.values() ?? [])];
		const harcama = giderRows.find((r) => r[2] === 'harcama');
		expect(harcama).toBeDefined();
		expect(harcama![3]).toBe('icerikStrateji');
		expect(harcama![4]).toBe('1000');
		expect(harcama![5]).toBe('TRY');
		expect(harcama![6]).toBe('30');
	});

	it('rejects an amount too small to buy even one report', async () => {
		stubApis(0.03);
		const response = await authedRequest('/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 1, paraBirimi: 'try' }), // ~$0.03, altında $0.20
		});
		expect(response.status).toBe(400);
	});

	it('requires panel auth', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/kullanim-limit-arttir', {
			method: 'POST',
			body: JSON.stringify({ kategori: 'icerikStrateji', tutar: 100, paraBirimi: 'USD' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});
