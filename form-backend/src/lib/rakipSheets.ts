import { RAKIP_ANALIZI_TAB_NAME, RAKIP_ANALIZI_COLUMNS, RAKIP_ANALIZI_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch } from './sheets';
import type { Env } from '../types';

export type RakipAnalizRow = Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>;

export function emptyRakipAnalizRow(): RakipAnalizRow {
	const row = {} as RakipAnalizRow;
	for (const key of RAKIP_ANALIZI_COLUMNS) row[key] = '';
	return row;
}

// RakipAnalizi tab'ı yoksa oluştur, varsa gridi kolon sayısına göre genişlet — Sayfa1'deki
// ensureSheetTab ile aynı mantık, ama sadece bu tek sekme için (mirror-tab çoğullaması yok).
export async function ensureRakipAnaliziTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: { title: RAKIP_ANALIZI_TAB_NAME, gridProperties: { columnCount: RAKIP_ANALIZI_COLUMNS.length } },
						},
					},
				],
			}),
		});
		await writeHeaderRow(env);
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < RAKIP_ANALIZI_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: {
								sheetId: existing.properties.sheetId,
								gridProperties: { columnCount: RAKIP_ANALIZI_COLUMNS.length },
							},
							fields: 'gridProperties.columnCount',
						},
					},
				],
			}),
		});
	}
	await writeHeaderRow(env);
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A1:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}1`;
	const values = [RAKIP_ANALIZI_COLUMNS.map((key) => RAKIP_ANALIZI_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Tek satır ekler, 1-indexed satır numarasını döner (header row 1). Sayfa1'in aksine header her
// zaman RAKIP_ANALIZI_COLUMNS sırasında yazıldığı için (yukarıdaki writeHeaderRow), pozisyon
// çözümlemesine gerek yok — doğrudan sıraya göre append.
export async function appendRakipAnalizRow(env: Env, row: RakipAnalizRow): Promise<number> {
	const values = [RAKIP_ANALIZI_COLUMNS.map((key) => String(row[key] ?? ''))];
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
	const data = (await response.json()) as { updates?: { updatedRange?: string } };
	const match = data.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
	if (!match) throw new Error(`Could not parse row number from RakipAnalizi append response: ${JSON.stringify(data)}`);
	return Number(match[1]);
}

export async function getAllRakipAnalizRows(env: Env): Promise<{ rowNumber: number; row: RakipAnalizRow }[]> {
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A2:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? []).map((values, i) => {
		const row = {} as RakipAnalizRow;
		RAKIP_ANALIZI_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
		return { rowNumber: i + 2, row };
	});
}
