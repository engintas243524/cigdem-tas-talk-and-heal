import { RAKIP_TAKIP_AYAR_TAB_NAME, RAKIP_TAKIP_AYAR_COLUMNS, RAKIP_TAKIP_AYAR_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch } from './sheets';
import type { Env } from '../types';

export type RakipTakipAyarRow = Record<(typeof RAKIP_TAKIP_AYAR_COLUMNS)[number], string>;

function emptyRow(): RakipTakipAyarRow {
	const row = {} as RakipTakipAyarRow;
	for (const key of RAKIP_TAKIP_AYAR_COLUMNS) row[key] = '';
	row.otomatikAcik = 'false';
	return row;
}

// Tek satırlık sabit ayar sekmesi — rakipTakipSheets.ts'deki "6 sabit satır" ile aynı desen,
// burada sadece 1 satır. Asla append edilmez, ensureRakipTakipAyarTab ilk kurulumda bir kez
// tohumlar, sonrası setRakipTakipAyar ile hep yerinde güncellenir.
export async function ensureRakipTakipAyarTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAKIP_TAKIP_AYAR_TAB_NAME);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: { title: RAKIP_TAKIP_AYAR_TAB_NAME, gridProperties: { columnCount: RAKIP_TAKIP_AYAR_COLUMNS.length } },
						},
					},
				],
			}),
		});
		await writeHeaderRow(env);
		await seedIfMissing(env);
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < RAKIP_TAKIP_AYAR_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: { sheetId: existing.properties.sheetId, gridProperties: { columnCount: RAKIP_TAKIP_AYAR_COLUMNS.length } },
							fields: 'gridProperties.columnCount',
						},
					},
				],
			}),
		});
	}
	await writeHeaderRow(env);
	await seedIfMissing(env);
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${RAKIP_TAKIP_AYAR_TAB_NAME}!A1:${columnLetter(RAKIP_TAKIP_AYAR_COLUMNS.length - 1)}1`;
	const values = [RAKIP_TAKIP_AYAR_COLUMNS.map((key) => RAKIP_TAKIP_AYAR_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

async function seedIfMissing(env: Env): Promise<void> {
	const range = `${RAKIP_TAKIP_AYAR_TAB_NAME}!A2:${columnLetter(RAKIP_TAKIP_AYAR_COLUMNS.length - 1)}2`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	if (data.values?.length) return;
	const row = emptyRow();
	const appendRange = `${RAKIP_TAKIP_AYAR_TAB_NAME}!A:${columnLetter(RAKIP_TAKIP_AYAR_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(appendRange)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values: [RAKIP_TAKIP_AYAR_COLUMNS.map((key) => row[key])] }),
	});
}

export async function getRakipTakipAyar(env: Env): Promise<RakipTakipAyarRow> {
	const range = `${RAKIP_TAKIP_AYAR_TAB_NAME}!A2:${columnLetter(RAKIP_TAKIP_AYAR_COLUMNS.length - 1)}2`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	const values = data.values?.[0];
	if (!values) return emptyRow();
	const row = {} as RakipTakipAyarRow;
	RAKIP_TAKIP_AYAR_COLUMNS.forEach((key, i) => (row[key] = String(values[i] ?? '')));
	return row;
}

export async function setRakipTakipAyar(env: Env, acik: boolean): Promise<void> {
	const mevcut = await getRakipTakipAyar(env);
	const simdi = new Date().toISOString();
	const yeni: RakipTakipAyarRow = {
		...mevcut,
		otomatikAcik: String(acik),
		acildigiZamanUtc: acik ? simdi : mevcut.acildigiZamanUtc,
		kapandigiZamanUtc: acik ? mevcut.kapandigiZamanUtc : simdi,
	};
	const range = `${RAKIP_TAKIP_AYAR_TAB_NAME}!A2:${columnLetter(RAKIP_TAKIP_AYAR_COLUMNS.length - 1)}2`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values: [RAKIP_TAKIP_AYAR_COLUMNS.map((key) => yeni[key])] }),
	});
}
