import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	ensureRakipTakipGecmisTab,
	addRakipTakipGecmisKaydi,
	getAllRakipTakipGecmisRows,
	getRakipTakipGecmisi,
} from '../src/lib/rakipTakipGecmisSheets';
import { RAKIP_TAKIP_GECMIS_MAX_KAYIT } from '../src/config';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

// rakipTakipSheets.spec.ts'deki satır-numarasına-duyarlı stub ile aynı desen — burada AYRICA
// deleteDimension (rotasyon silmesi) destekleniyor, rakipSheets.spec.ts'deki deleteRakipAnalizRows
// testlerindeki mantıkla aynı.
function stubSheetsApi(existingTabs: string[] = []) {
	let rows = new Map<number, string[]>();
	// addSheet çağrıldığında (ensureRakipTakipGecmisTab ilk kurulumda) bu sekmeyi "artık var"
	// olarak işaretliyor — aksi halde sonraki deleteDimension çağrıları sheetId'yi
	// ?fields=sheets.properties listesinde bulamayıp sessizce hiçbir şey yapmaz.
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
					sheets: [...knownTabs].map((t) => ({ properties: { sheetId: 7, title: t, gridProperties: { columnCount: 20 } } })),
				}),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) {
			const body = init?.body
				? (JSON.parse(init.body as string) as { requests?: { deleteDimension?: { range: { startIndex: number } }; addSheet?: unknown }[] })
				: {};
			for (const req of body.requests ?? []) {
				if (req.addSheet) knownTabs.add('RakipTakipGecmis');
				if (req.deleteDimension) {
					const rowNumber = req.deleteDimension.range.startIndex + 1;
					const yeni = new Map<number, string[]>();
					// Silinen satırdan sonrakileri bir yukarı kaydır (gerçek Sheets deleteDimension davranışı).
					[...rows.entries()]
						.sort((a, b) => a[0] - b[0])
						.forEach(([rn, values]) => {
							if (rn === rowNumber) return;
							yeni.set(rn > rowNumber ? rn - 1 : rn, values);
						});
					rows = yeni;
				}
			}
			return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 7 } } }] }), { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			let nextRow = Math.max(1, ...rows.keys()) + 1;
			for (const rowValues of body.values) {
				rows.set(nextRow, rowValues);
				nextRow++;
			}
			return new Response(JSON.stringify({ updates: { updatedRange: `RakipTakipGecmis!A${nextRow - 1}` } }), { status: 200 });
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
	return { fetchMock, rows: () => rows };
}

describe('rakipTakipGecmisSheets', () => {
	it('creates the RakipTakipGecmis tab', async () => {
		stubSheetsApi([]);
		await expect(ensureRakipTakipGecmisTab(env)).resolves.not.toThrow();
	});

	it('pins the whole row (CLIP + fixed row height) so long raporMetni never grows the tab', async () => {
		const { fetchMock } = stubSheetsApi([]);
		await ensureRakipTakipGecmisTab(env);
		const dimensionCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { updateDimensionProperties?: unknown }[] };
			return body.requests?.some((r) => r.updateDimensionProperties);
		});
		expect(dimensionCall).toBeDefined();
	});

	it('adds a snapshot and stores parametreSkorlari as JSON', async () => {
		stubSheetsApi([]);
		await ensureRakipTakipGecmisTab(env);
		await addRakipTakipGecmisKaydi(env, {
			varlikId: 'talkAndHeal',
			varlikAdi: 'Talk and Heal',
			periyotTuru: 'haftalik',
			donemBaslangicUtc: '2026-08-01T00:00:00.000Z',
			donemBitisUtc: '2026-08-08T00:00:00.000Z',
			parametreSkorlari: { fiyat: 7, konum: null },
			raporMetni: 'Bu hafta 5 yeni danışan.',
		});
		const all = await getAllRakipTakipGecmisRows(env);
		expect(all).toHaveLength(1);
		expect(JSON.parse(all[0].row.parametreSkorlariJson)).toEqual({ fiyat: 7, konum: null });
	});

	it('getRakipTakipGecmisi returns only the matching (varlikId, periyotTuru) pair, oldest first', async () => {
		stubSheetsApi([]);
		await ensureRakipTakipGecmisTab(env);
		const kayit = (over: Partial<Parameters<typeof addRakipTakipGecmisKaydi>[1]>) =>
			addRakipTakipGecmisKaydi(env, {
				varlikId: 'talkAndHeal',
				varlikAdi: 'Talk and Heal',
				periyotTuru: 'haftalik',
				donemBaslangicUtc: '2026-08-01T00:00:00.000Z',
				donemBitisUtc: '2026-08-08T00:00:00.000Z',
				parametreSkorlari: {},
				raporMetni: '',
				...over,
			});
		await kayit({ donemBaslangicUtc: '2026-08-08T00:00:00.000Z' });
		await kayit({ donemBaslangicUtc: '2026-08-01T00:00:00.000Z' });
		await kayit({ varlikId: 'rakip-x', donemBaslangicUtc: '2026-08-01T00:00:00.000Z' }); // farklı varlık, dahil olmamalı
		await kayit({ periyotTuru: 'aylik', donemBaslangicUtc: '2026-08-01T00:00:00.000Z' }); // farklı periyot, dahil olmamalı

		const gecmis = await getRakipTakipGecmisi(env, 'talkAndHeal', 'haftalik');
		expect(gecmis).toHaveLength(2);
		expect(gecmis[0].donemBaslangicUtc).toBe('2026-08-01T00:00:00.000Z');
		expect(gecmis[1].donemBaslangicUtc).toBe('2026-08-08T00:00:00.000Z');
	});

	it(`keeps at most ${RAKIP_TAKIP_GECMIS_MAX_KAYIT} snapshots per (varlikId, periyotTuru), rotating out the oldest`, async () => {
		stubSheetsApi([]);
		await ensureRakipTakipGecmisTab(env);
		for (let i = 0; i < RAKIP_TAKIP_GECMIS_MAX_KAYIT + 3; i++) {
			await addRakipTakipGecmisKaydi(env, {
				varlikId: 'rakip-x',
				varlikAdi: 'Rakip X',
				periyotTuru: 'aylik',
				donemBaslangicUtc: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
				donemBitisUtc: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
				parametreSkorlari: { sira: i },
				raporMetni: `dönem ${i}`,
			});
		}
		const gecmis = await getRakipTakipGecmisi(env, 'rakip-x', 'aylik');
		expect(gecmis).toHaveLength(RAKIP_TAKIP_GECMIS_MAX_KAYIT);
		// en eski 3 tanesi (sira 0,1,2) rotasyonla silinmiş olmalı, kalan en yeni 12'si (sira 3..14) durmalı
		const siralar = gecmis.map((r) => JSON.parse(r.parametreSkorlariJson).sira);
		expect(siralar).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
	});
});
