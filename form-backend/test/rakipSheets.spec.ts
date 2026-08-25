import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	ensureRakipAnaliziTab,
	appendRakipAnalizRow,
	getAllRakipAnalizRows,
	emptyRakipAnalizRow,
	setAktifPlatformlarNotu,
	setAktifPlatformlarNotlariToplu,
} from '../src/lib/rakipSheets';

afterEach(() => vi.unstubAllGlobals());

function stubSheetsApi(existingTabs: string[] = []) {
	const appended: string[][] = [];
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
			return new Response('{}', { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			appended.push(body.values[0]);
			return new Response(JSON.stringify({ updates: { updatedRange: `RakipAnalizi!A${appended.length + 1}:I${appended.length + 1}` } }), {
				status: 200,
			});
		}
		if (url.includes('/values/') && method === 'PUT') {
			return new Response('{}', { status: 200 });
		}
		if (url.includes('/values/') && method === 'GET') {
			return new Response(JSON.stringify({ values: appended }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { appended, fetchMock };
}

describe('rakipSheets', () => {
	it('creates the RakipAnalizi tab when it does not exist yet', async () => {
		stubSheetsApi([]);
		await expect(ensureRakipAnaliziTab(env)).resolves.not.toThrow();
	});

	it('appends a row and returns its row number', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		row.kaynak = 'manuel';
		const rowNumber = await appendRakipAnalizRow(env, row);
		expect(rowNumber).toBe(2);
	});

	it('round-trips the platform envanteri fields (aktifPlatformlar, google gözlem alanları, gozlemTarihiUtc)', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		row.kaynak = 'manuel';
		row.aktifPlatformlar = 'Instagram,LinkedIn';
		row.googlePuaniGozlemi = '4.7';
		row.googleYorumSayisiGozlemi = '128';
		row.gozlemTarihiUtc = '2026-08-24T10:00:00.000Z';
		await appendRakipAnalizRow(env, row);
		const rows = await getAllRakipAnalizRows(env);
		expect(rows[0].row).toMatchObject({
			aktifPlatformlar: 'Instagram,LinkedIn',
			googlePuaniGozlemi: '4.7',
			googleYorumSayisiGozlemi: '128',
			gozlemTarihiUtc: '2026-08-24T10:00:00.000Z',
		});
	});

	it('reads back appended rows', async () => {
		const { appended } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		appended.push(Object.values(row));
		const rows = await getAllRakipAnalizRows(env);
		expect(rows).toHaveLength(1);
		expect(rows[0].row.isim).toBe('Örnek Klinik');
	});

	it('pins the whole row (CLIP + fixed row height) so long Not/Rapor Metni text never grows the tab', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		await ensureRakipAnaliziTab(env);
		const dimensionCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { updateDimensionProperties?: unknown }[] };
			return body.requests?.some((r) => r.updateDimensionProperties);
		});
		expect(dimensionCall).toBeDefined();
		const body = JSON.parse((dimensionCall![1] as RequestInit).body as string) as {
			requests: {
				updateDimensionProperties?: { properties: { pixelSize: number } };
				repeatCell?: { cell: { userEnteredFormat: { wrapStrategy: string } } };
			}[];
		};
		expect(body.requests.find((r) => r.updateDimensionProperties)!.updateDimensionProperties!.properties.pixelSize).toBe(21);
		expect(body.requests.find((r) => r.repeatCell)!.repeatCell!.cell.userEnteredFormat.wrapStrategy).toBe('CLIP');
	});

	it('writes a note to the aktifPlatformlar cell, touching ONLY the note field', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		await setAktifPlatformlarNotu(env, 3, 'LLM tespiti, 2026-08-25: Instagram, TikTok');

		const batchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes(':batchUpdate'))!;
		const body = JSON.parse((batchCall[1] as RequestInit).body as string);
		const req = body.requests[0].updateCells;
		expect(req.fields).toBe('note');
		expect(req.rows).toEqual([{ values: [{ note: 'LLM tespiti, 2026-08-25: Instagram, TikTok' }] }]);
	});

	it('targets the correct row/column from RAKIP_ANALIZI_COLUMNS', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		await setAktifPlatformlarNotu(env, 5, 'not');

		const batchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes(':batchUpdate'))!;
		const body = JSON.parse((batchCall[1] as RequestInit).body as string);
		const range = body.requests[0].updateCells.range;
		// rowNumber 5 -> Sheets'te satır 5 -> 0-indexli startRowIndex 4.
		expect(range.startRowIndex).toBe(4);
		expect(range.endRowIndex).toBe(5);
		expect(range.endColumnIndex).toBe(range.startColumnIndex + 1);
	});

	it('throws a clear error when the RakipAnalizi tab cannot be found', async () => {
		stubSheetsApi(['Sayfa1']); // RakipAnalizi tab'ı YOK
		await expect(setAktifPlatformlarNotu(env, 3, 'not')).rejects.toThrow(/bulunamadı/);
	});

	describe('setAktifPlatformlarNotlariToplu', () => {
		it('writes N notes in ONE batchUpdate call with ONE sheetId lookup, not N of each', async () => {
			const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
			await setAktifPlatformlarNotlariToplu(env, [
				{ rowNumber: 3, notMetni: 'LLM tespiti, 2026-08-25: Instagram' },
				{ rowNumber: 5, notMetni: 'LLM tespiti, 2026-08-25: Facebook, TikTok' },
				{ rowNumber: 7, notMetni: 'LLM tespiti, 2026-08-25: X' },
			]);
			const fieldsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('?fields=sheets.properties'));
			const batchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes(':batchUpdate'));
			expect(fieldsCalls).toHaveLength(1);
			expect(batchCalls).toHaveLength(1);
			const body = JSON.parse((batchCalls[0][1] as RequestInit).body as string);
			expect(body.requests).toHaveLength(3);
			expect(body.requests[0].updateCells.fields).toBe('note');
			expect(body.requests[0].updateCells.rows[0].values[0].note).toBe('LLM tespiti, 2026-08-25: Instagram');
			expect(body.requests[1].updateCells.range.startRowIndex).toBe(4); // rowNumber 5 -> 0-indexli 4
			expect(body.requests[2].updateCells.rows[0].values[0].note).toBe('LLM tespiti, 2026-08-25: X');
		});

		it('does nothing (no fetch at all) when given an empty list', async () => {
			const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
			await setAktifPlatformlarNotlariToplu(env, []);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it('throws a clear error when the RakipAnalizi tab cannot be found', async () => {
			stubSheetsApi(['Sayfa1']); // RakipAnalizi tab'ı YOK
			await expect(setAktifPlatformlarNotlariToplu(env, [{ rowNumber: 3, notMetni: 'not' }])).rejects.toThrow(/bulunamadı/);
		});
	});
});
