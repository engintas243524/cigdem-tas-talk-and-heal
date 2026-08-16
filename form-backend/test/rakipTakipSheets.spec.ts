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
		if (url.includes(':batchUpdate')) {
			const body = init?.body ? (JSON.parse(init.body as string) as { requests?: { addSheet?: unknown }[] }) : {};
			if (body.requests?.some((r) => r.addSheet)) {
				return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 42 } } }] }), { status: 200 });
			}
			return new Response('{}', { status: 200 });
		}
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

	it('applies CLIP wrapStrategy to the long-text columns so cell wrap never grows row height', async () => {
		const { fetchMock } = stubSheetsApi([]);
		await ensureRakipTakipTab(env);
		const repeatCellCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { repeatCell?: unknown }[] };
			return body.requests?.some((r) => r.repeatCell);
		});
		expect(repeatCellCall).toBeDefined();
		const body = JSON.parse((repeatCellCall![1] as RequestInit).body as string) as {
			requests: { repeatCell: { cell: { userEnteredFormat: { wrapStrategy: string } } } }[];
		};
		expect(body.requests[0].repeatCell.cell.userEnteredFormat.wrapStrategy).toBe('CLIP');
	});

	it('pins rows (a generous ceiling covering header+6 and future rows) to the standard row height, so a previously-wrapped-tall row shrinks back (CLIP alone does not do this retroactively)', async () => {
		const { fetchMock } = stubSheetsApi([]);
		await ensureRakipTakipTab(env);
		const dimensionCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { updateDimensionProperties?: unknown }[] };
			return body.requests?.some((r) => r.updateDimensionProperties);
		});
		expect(dimensionCall).toBeDefined();
		const body = JSON.parse((dimensionCall![1] as RequestInit).body as string) as {
			requests: { updateDimensionProperties: { range: { startIndex: number; endIndex: number }; properties: { pixelSize: number } } }[];
		};
		const req = body.requests.find((r) => r.updateDimensionProperties)!.updateDimensionProperties;
		expect(req.range.startIndex).toBe(0);
		expect(req.range.endIndex).toBeGreaterThan(7); // header + 6 sabit periyot satırının çok üstünde bir tavan
		expect(req.properties.pixelSize).toBe(21);
	});
});
