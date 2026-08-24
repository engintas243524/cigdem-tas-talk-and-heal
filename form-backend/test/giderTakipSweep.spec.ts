import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runGiderTakipAylikOzetSweep } from '../src/scheduled';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

// rakipTakip.spec.ts'deki sekme-adına-duyarlı stub ile aynı desen.
function stubSheetsApi() {
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
		if (url.includes('?fields=sheets.properties')) return new Response(JSON.stringify({ sheets: [] }), { status: 200 });
		if (url.includes(':batchUpdate'))
			return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 5 } } }] }), { status: 200 });
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
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { tabRows };
}

describe('runGiderTakipAylikOzetSweep', () => {
	it('writes one aylikKullanim row per category for the current month (no Anthropic/Google calls — reads existing KullanimKaydi only)', async () => {
		const { tabRows } = stubSheetsApi();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));

		await runGiderTakipAylikOzetSweep(env);

		const giderRows = [...(tabRows.get('GiderTakibi')?.values() ?? [])];
		const aylik = giderRows.filter((r) => r[2] === 'aylikKullanim');
		expect(aylik).toHaveLength(7); // adresBulma, rakipArama, icerikStrateji, aksiyonAnaliz, konuTrendBulma, rakipYorumAnalizi, rakipPlatformTespiti
		aylik.forEach((r) => expect(r[1]).toBe('2026-08-01T00:00:00.000Z'));
	});

	it('re-running within the same month updates the same 7 rows in place, not appending more', async () => {
		const { tabRows } = stubSheetsApi();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));

		await runGiderTakipAylikOzetSweep(env);
		await runGiderTakipAylikOzetSweep(env);

		const giderRows = [...(tabRows.get('GiderTakibi')?.values() ?? [])];
		expect(giderRows.filter((r) => r[2] === 'aylikKullanim')).toHaveLength(7);
	});
});
