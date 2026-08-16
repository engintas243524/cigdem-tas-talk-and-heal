import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureGiderTakipTab, appendHarcamaKaydi, upsertAylikKullanimKaydi, getAllGiderTakipRows } from '../src/lib/giderTakipSheets';

afterEach(() => vi.unstubAllGlobals());

// rakipTakipGecmisSheets.spec.ts'deki satır-numarasına-duyarlı stub ile aynı desen.
function stubSheetsApi(existingTabs: string[] = []) {
	let rows = new Map<number, string[]>();
	const knownTabs = new Set(existingTabs);
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({
					sheets: [...knownTabs].map((t) => ({ properties: { sheetId: 3, title: t, gridProperties: { columnCount: 20 } } })),
				}),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) {
			const body = init?.body ? (JSON.parse(init.body as string) as { requests?: { addSheet?: unknown }[] }) : {};
			for (const req of body.requests ?? []) {
				if (req.addSheet) knownTabs.add('GiderTakibi');
			}
			return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 3 } } }] }), { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			let nextRow = Math.max(1, ...rows.keys()) + 1;
			for (const rowValues of body.values) {
				rows.set(nextRow, rowValues);
				nextRow++;
			}
			return new Response(JSON.stringify({ updates: { updatedRange: `GiderTakibi!A${nextRow - 1}` } }), { status: 200 });
		}
		if (method === 'PUT' && url.includes('/values/')) {
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const rowNumber = rowMatch ? Number(rowMatch[1]) : 1;
			rows.set(rowNumber, body.values[0]);
			return new Response('{}', { status: 200 });
		}
		if (method === 'GET' && url.includes('/values/')) {
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
	return { fetchMock, rows: () => rows };
}

describe('giderTakipSheets', () => {
	it('creates the GiderTakibi tab', async () => {
		stubSheetsApi([]);
		await expect(ensureGiderTakipTab(env)).resolves.not.toThrow();
	});

	it('appends a harcama (real spend) row on every call — never updates in place', async () => {
		stubSheetsApi([]);
		await ensureGiderTakipTab(env);
		await appendHarcamaKaydi(env, { kategori: 'icerikStrateji', tutar: 1000, paraBirimi: 'try', yaklasikUsd: 30 });
		await appendHarcamaKaydi(env, { kategori: 'icerikStrateji', tutar: 500, paraBirimi: 'try', yaklasikUsd: 15 });
		const rows = await getAllGiderTakipRows(env);
		const harcamalar = rows.filter(({ row }) => row.tur === 'harcama');
		expect(harcamalar).toHaveLength(2);
		expect(harcamalar[0].row.paraBirimi).toBe('TRY');
		expect(harcamalar[0].row.yaklasikUsd).toBe('30');
		expect(harcamalar[1].row.yaklasikUsd).toBe('15');
	});

	it('upserts one row per (yılAy, kategori) — same month/category updates in place, does not append again', async () => {
		stubSheetsApi([]);
		await ensureGiderTakipTab(env);
		const yilAy = '2026-08-01T00:00:00.000Z';
		await upsertAylikKullanimKaydi(env, { yilAyBaslangicUtc: yilAy, kategori: 'icerikStrateji', kullanilanSayisi: 3, aylikLimit: 12 });
		await upsertAylikKullanimKaydi(env, { yilAyBaslangicUtc: yilAy, kategori: 'icerikStrateji', kullanilanSayisi: 5, aylikLimit: 12 });

		const rows = await getAllGiderTakipRows(env);
		const aylik = rows.filter(({ row }) => row.tur === 'aylikKullanim' && row.kategori === 'icerikStrateji');
		expect(aylik).toHaveLength(1);
		expect(aylik[0].row.kullanilanSayisi).toBe('5');
	});

	it('a new month for the same category opens a new row, leaving the old month frozen', async () => {
		stubSheetsApi([]);
		await ensureGiderTakipTab(env);
		await upsertAylikKullanimKaydi(env, {
			yilAyBaslangicUtc: '2026-07-01T00:00:00.000Z',
			kategori: 'aksiyonAnaliz',
			kullanilanSayisi: 10,
			aylikLimit: 13,
		});
		await upsertAylikKullanimKaydi(env, {
			yilAyBaslangicUtc: '2026-08-01T00:00:00.000Z',
			kategori: 'aksiyonAnaliz',
			kullanilanSayisi: 2,
			aylikLimit: 13,
		});
		const rows = await getAllGiderTakipRows(env);
		const aylik = rows.filter(({ row }) => row.tur === 'aylikKullanim' && row.kategori === 'aksiyonAnaliz');
		expect(aylik).toHaveLength(2);
		const temmuz = aylik.find(({ row }) => row.tarihUtc === '2026-07-01T00:00:00.000Z')!;
		expect(temmuz.row.kullanilanSayisi).toBe('10'); // dokunulmadı, dondu
	});

	it('pins the whole row (CLIP + fixed row height) so long content never grows the tab', async () => {
		const { fetchMock } = stubSheetsApi([]);
		await ensureGiderTakipTab(env);
		const dimensionCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { updateDimensionProperties?: unknown }[] };
			return body.requests?.some((r) => r.updateDimensionProperties);
		});
		expect(dimensionCall).toBeDefined();
	});
});
