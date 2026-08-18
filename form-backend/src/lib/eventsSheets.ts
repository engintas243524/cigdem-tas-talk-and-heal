import { EVENTS_TAB_NAME, EVENTS_COLUMNS, EVENTS_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

export type EventRow = Record<(typeof EVENTS_COLUMNS)[number], string>;

export function emptyEventRow(): EventRow {
	const row = {} as EventRow;
	for (const key of EVENTS_COLUMNS) row[key] = '';
	return row;
}

// rakipSheets.ts#ensureRakipAnaliziTab ile aynı oluşturma/genişletme deseni.
export async function ensureEventsTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === EVENTS_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [{ addSheet: { properties: { title: EVENTS_TAB_NAME, gridProperties: { columnCount: EVENTS_COLUMNS.length } } } }],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < EVENTS_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: EVENTS_COLUMNS.length } },
								fields: 'gridProperties.columnCount',
							},
						},
					],
				}),
			});
		}
		await writeHeaderRow(env);
	}

	if (sheetId !== undefined) {
		await sabitSatirYuksekligiUygula(env, sheetId, EVENTS_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${EVENTS_TAB_NAME}!A1:${columnLetter(EVENTS_COLUMNS.length - 1)}1`;
	const values = [EVENTS_COLUMNS.map((key) => EVENTS_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function appendEventRow(env: Env, row: EventRow): Promise<number> {
	const values = [EVENTS_COLUMNS.map((key) => String(row[key] ?? ''))];
	const range = `${EVENTS_TAB_NAME}!A:${columnLetter(EVENTS_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
	const data = (await response.json()) as { updates?: { updatedRange?: string } };
	const match = data.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
	if (!match) throw new Error(`Could not parse row number from Etkinlikler append response: ${JSON.stringify(data)}`);
	return Number(match[1]);
}

export async function getAllEventRows(env: Env): Promise<{ rowNumber: number; row: EventRow }[]> {
	const range = `${EVENTS_TAB_NAME}!A2:${columnLetter(EVENTS_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as EventRow;
			EVENTS_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.id);
}

// rakipSheets.ts#deleteRakipAnalizRows ile aynı desen (deleteDimension büyükten küçüğe sıralanmalı).
export async function deleteEventRows(env: Env, rowNumbers: number[]): Promise<void> {
	if (!rowNumbers.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === EVENTS_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('Etkinlikler tab bulunamadı, silme yapılamadı.');

	const sortedDesc = [...rowNumbers].sort((a, b) => b - a);
	await sheetsFetch(env, ':batchUpdate', {
		method: 'POST',
		body: JSON.stringify({
			requests: sortedDesc.map((rowNumber) => ({
				deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } },
			})),
		}),
	});
}
