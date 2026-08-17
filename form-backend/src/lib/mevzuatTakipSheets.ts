import { MEVZUAT_TAKIP_TAB_NAME, MEVZUAT_TAKIP_COLUMNS, MEVZUAT_TAKIP_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

export type MevzuatTakipRow = Record<(typeof MEVZUAT_TAKIP_COLUMNS)[number], string>;

// Raporlar/KullanimKaydi'yle AYNI desen — tab yoksa oluştur, varsa kolon sayısını genişlet, header'ı
// her seferinde yeniden yaz (kendini onaran). Bkz. lib/raporlarSheets.ts#ensureRaporlarTab.
export async function ensureMevzuatTakipTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === MEVZUAT_TAKIP_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{ addSheet: { properties: { title: MEVZUAT_TAKIP_TAB_NAME, gridProperties: { columnCount: MEVZUAT_TAKIP_COLUMNS.length } } } },
				],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < MEVZUAT_TAKIP_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: MEVZUAT_TAKIP_COLUMNS.length } },
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
		await sabitSatirYuksekligiUygula(env, sheetId, MEVZUAT_TAKIP_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${MEVZUAT_TAKIP_TAB_NAME}!A1:${columnLetter(MEVZUAT_TAKIP_COLUMNS.length - 1)}1`;
	const values = [MEVZUAT_TAKIP_COLUMNS.map((key) => MEVZUAT_TAKIP_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function getAllMevzuatTakipRows(env: Env): Promise<{ rowNumber: number; row: MevzuatTakipRow }[]> {
	const range = `${MEVZUAT_TAKIP_TAB_NAME}!A2:${columnLetter(MEVZUAT_TAKIP_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as MevzuatTakipRow;
			MEVZUAT_TAKIP_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.id);
}

// En son sweep'in ne zaman çalıştığını bulur — MEVZUAT_TAKIP_ARALIK_GUN'un dolup dolmadığını
// kontrol etmek için (bkz. scheduled.ts#runMevzuatTakipSweep). Hiç kayıt yoksa null (ilk çalıştırma).
export async function sonMevzuatTakipTarihiGetir(env: Env): Promise<Date | null> {
	const rows = await getAllMevzuatTakipRows(env);
	if (!rows.length) return null;
	const tarihler = rows.map(({ row }) => new Date(row.tarihUtc).getTime()).filter((t) => !Number.isNaN(t));
	if (!tarihler.length) return null;
	return new Date(Math.max(...tarihler));
}

export async function appendMevzuatTakipKaydi(env: Env, degisiklikVarMi: boolean, ozet: string): Promise<void> {
	await ensureMevzuatTakipTab(env);
	const row: MevzuatTakipRow = {
		id: crypto.randomUUID(),
		tarihUtc: new Date().toISOString(),
		degisiklikVarMi: degisiklikVarMi ? 'evet' : 'hayır',
		ozet,
	};
	const values = [MEVZUAT_TAKIP_COLUMNS.map((key) => row[key])];
	const range = `${MEVZUAT_TAKIP_TAB_NAME}!A:${columnLetter(MEVZUAT_TAKIP_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}
