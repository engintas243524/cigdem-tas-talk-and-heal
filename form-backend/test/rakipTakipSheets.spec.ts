import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureRakipTakipTab, getAllRakipTakipRows, getRakipTakipDurumu, updateRakipTakipRow } from '../src/lib/rakipTakipSheets';
import { RAKIP_TAKIP_PERIYOT_TURLERI } from '../src/config';

afterEach(() => {
	vi.unstubAllGlobals();
});

// Sadece "her append yeni bir satırdır" varsayımını değil, targeted-row PUT'un doğru satırın
// üstüne yazdığını da doğrulamak gerektiği için (bu dosyanın asıl amacı budur), diğer test
// dosyalarındaki basit `appended: string[][]` yerine satır numarasına duyarlı bir in-memory model
// kullanılıyor: rowNumber -> cell values.
function stubSheetsApi(existingTabs: string[] = []) {
	const rows = new Map<number, string[]>();
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
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			let nextRow = Math.max(1, ...rows.keys()) + 1;
			for (const rowValues of body.values) {
				rows.set(nextRow, rowValues);
				nextRow++;
			}
			return new Response(JSON.stringify({ updates: { updatedRange: `RakipTakip!A${nextRow - 1}:H${nextRow - 1}` } }), { status: 200 });
		}
		if (method === 'PUT' && url.includes('/values/')) {
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			const rowMatch = url.match(/!A(\d+)/);
			const rowNumber = rowMatch ? Number(rowMatch[1]) : 1;
			rows.set(rowNumber, body.values[0]);
			return new Response('{}', { status: 200 });
		}
		if (method === 'GET' && url.includes('/values/')) {
			const rowMatch = url.match(/!A(\d+)/);
			const startRow = rowMatch ? Number(rowMatch[1]) : 2;
			const maxRow = Math.max(startRow - 1, ...rows.keys());
			const values: string[][] = [];
			for (let r = startRow; r <= maxRow; r++) values.push(rows.get(r) ?? []);
			return new Response(JSON.stringify({ values }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { rows, fetchMock };
}

describe('rakipTakipSheets', () => {
	it('creates the RakipTakip tab and seeds exactly the 6 fixed periyot rows', async () => {
		stubSheetsApi([]);
		await ensureRakipTakipTab(env);
		const all = await getAllRakipTakipRows(env);
		expect(all).toHaveLength(RAKIP_TAKIP_PERIYOT_TURLERI.length);
		expect(new Set(all.map(({ row }) => row.periyotTuru))).toEqual(new Set(RAKIP_TAKIP_PERIYOT_TURLERI));
	});

	it('does not duplicate rows when ensureRakipTakipTab is called again (no growth)', async () => {
		stubSheetsApi(['Sayfa1']);
		await ensureRakipTakipTab(env);
		expect(await getAllRakipTakipRows(env)).toHaveLength(6);
		await ensureRakipTakipTab(env);
		expect(await getAllRakipTakipRows(env)).toHaveLength(6);
	});

	it('updateRakipTakipRow overwrites the existing row in place instead of appending a new one', async () => {
		stubSheetsApi([]);
		await ensureRakipTakipTab(env);
		const once = await getRakipTakipDurumu(env, 'haftalik');
		expect(once).not.toBeNull();
		const rowNumber = once!.rowNumber;

		await updateRakipTakipRow(env, rowNumber, once!.row, { projeksiyon: 'Bu hafta TODO listesi', hedef: '5 yeni danışan' });

		const all = await getAllRakipTakipRows(env);
		expect(all).toHaveLength(6); // hâlâ 6 — büyümedi
		const guncel = await getRakipTakipDurumu(env, 'haftalik');
		expect(guncel!.rowNumber).toBe(rowNumber); // aynı satır
		expect(guncel!.row.projeksiyon).toBe('Bu hafta TODO listesi');
		expect(guncel!.row.hedef).toBe('5 yeni danışan');
	});

	it('getRakipTakipDurumu returns null for an unknown periyotTuru', async () => {
		stubSheetsApi([]);
		await ensureRakipTakipTab(env);
		expect(await getRakipTakipDurumu(env, 'gunluk')).toBeNull();
	});
});
