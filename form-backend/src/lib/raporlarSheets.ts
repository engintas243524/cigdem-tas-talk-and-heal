import { RAPORLAR_TAB_NAME, RAPORLAR_COLUMNS, RAPORLAR_COLUMN_LABELS, type RaporTuru } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

type RaporlarRow = Record<(typeof RAPORLAR_COLUMNS)[number], string>;

// KullanimKaydi'nin ensureKullanimKaydiTab'ıyla aynı desen — tab yoksa oluştur, varsa kolon
// sayısını genişlet, header'ı her seferinde yeniden yaz (kendini onaran).
export async function ensureRaporlarTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAPORLAR_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [{ addSheet: { properties: { title: RAPORLAR_TAB_NAME, gridProperties: { columnCount: RAPORLAR_COLUMNS.length } } } }],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < RAPORLAR_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: RAPORLAR_COLUMNS.length } },
								fields: 'gridProperties.columnCount',
							},
						},
					],
				}),
			});
		}
		await writeHeaderRow(env);
	}

	// metin sütunu tam rapor uzunluğunda (birkaç bin karakter) olabiliyor — satır yüksekliğinin
	// şişmesini önler (bkz. lib/sheets.ts#sabitSatirYuksekligiUygula).
	if (sheetId !== undefined) {
		await sabitSatirYuksekligiUygula(env, sheetId, RAPORLAR_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${RAPORLAR_TAB_NAME}!A1:${columnLetter(RAPORLAR_COLUMNS.length - 1)}1`;
	const values = [RAPORLAR_COLUMNS.map((key) => RAPORLAR_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Üretilen bir raporun ham metnini arşive ekler — çağıran taraf bunu başarısız olsa bile ana akışı
// (rapor zaten kullanıcıya döndü) durdurmamalı, bkz. çağıran routes/*.ts'deki try/catch.
export async function appendRaporKaydi(env: Env, tur: RaporTuru, baglam: string, metin: string): Promise<void> {
	await ensureRaporlarTab(env);
	const row: RaporlarRow = { id: crypto.randomUUID(), tarihUtc: new Date().toISOString(), tur, baglam, metin };
	const values = [RAPORLAR_COLUMNS.map((key) => row[key])];
	const range = `${RAPORLAR_TAB_NAME}!A:${columnLetter(RAPORLAR_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}
