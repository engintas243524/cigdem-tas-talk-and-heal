import { BLOG_TAB_NAME, BLOG_COLUMNS, BLOG_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

// eventsSheets.ts ile BİREBİR aynı desen (2026-08-19) — Blog İçerik Paneli, Etkinlikler'in
// kanıtlanmış Sheets-as-DB yapısını aynen tekrar kullanıyor. Bir davranış değişirse ikisinde de
// değişmesi gerekebilir, bilerek ayrı dosyalar (farklı sekme/şema, ortak soyutlama gereksiz).
export type BlogRow = Record<(typeof BLOG_COLUMNS)[number], string>;

export function emptyBlogRow(): BlogRow {
	const row = {} as BlogRow;
	for (const key of BLOG_COLUMNS) row[key] = '';
	return row;
}

export async function ensureBlogTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === BLOG_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [{ addSheet: { properties: { title: BLOG_TAB_NAME, gridProperties: { columnCount: BLOG_COLUMNS.length } } } }],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < BLOG_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: BLOG_COLUMNS.length } },
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
		await sabitSatirYuksekligiUygula(env, sheetId, BLOG_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${BLOG_TAB_NAME}!A1:${columnLetter(BLOG_COLUMNS.length - 1)}1`;
	const values = [BLOG_COLUMNS.map((key) => BLOG_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function appendBlogRow(env: Env, row: BlogRow): Promise<number> {
	const values = [BLOG_COLUMNS.map((key) => String(row[key] ?? ''))];
	const range = `${BLOG_TAB_NAME}!A:${columnLetter(BLOG_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
	const data = (await response.json()) as { updates?: { updatedRange?: string } };
	const match = data.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
	if (!match) throw new Error(`Could not parse row number from BlogYazilari append response: ${JSON.stringify(data)}`);
	return Number(match[1]);
}

export async function updateBlogRow(env: Env, rowNumber: number, mevcutRow: BlogRow, patch: Partial<BlogRow>): Promise<void> {
	const yeniRow: BlogRow = { ...mevcutRow, ...patch };
	const range = `${BLOG_TAB_NAME}!A${rowNumber}:${columnLetter(BLOG_COLUMNS.length - 1)}${rowNumber}`;
	const values = [BLOG_COLUMNS.map((key) => String(yeniRow[key] ?? ''))];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function getAllBlogRows(env: Env): Promise<{ rowNumber: number; row: BlogRow }[]> {
	const range = `${BLOG_TAB_NAME}!A2:${columnLetter(BLOG_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as BlogRow;
			BLOG_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.id);
}

export async function deleteBlogRows(env: Env, rowNumbers: number[]): Promise<void> {
	if (!rowNumbers.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === BLOG_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('BlogYazilari tab bulunamadı, silme yapılamadı.');

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
