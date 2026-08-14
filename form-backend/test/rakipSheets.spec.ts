import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureRakipAnaliziTab, appendRakipAnalizRow, getAllRakipAnalizRows, emptyRakipAnalizRow } from '../src/lib/rakipSheets';

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
				JSON.stringify({ sheets: existingTabs.map((t) => ({ properties: { sheetId: 1, title: t, gridProperties: { columnCount: 20 } } })) }),
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
	return { appended };
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

	it('reads back appended rows', async () => {
		const { appended } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		appended.push(Object.values(row));
		const rows = await getAllRakipAnalizRows(env);
		expect(rows).toHaveLength(1);
		expect(rows[0].row.isim).toBe('Örnek Klinik');
	});
});
