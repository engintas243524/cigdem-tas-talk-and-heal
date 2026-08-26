import { RAKIP_ANALIZI_TAB_NAME, RAKIP_ANALIZI_COLUMNS, RAKIP_ANALIZI_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
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

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
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
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < RAKIP_ANALIZI_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: RAKIP_ANALIZI_COLUMNS.length } },
								fields: 'gridProperties.columnCount',
							},
						},
					],
				}),
			});
		}
		await writeHeaderRow(env);
	}

	// Rapor Metni ve Not sütunları uzun metin tutabiliyor — satır yüksekliğinin şişmesini önler
	// (bkz. lib/sheets.ts#sabitSatirYuksekligiUygula, 2026-08-16'da RakipTakip'ten genelleştirildi).
	if (sheetId !== undefined) {
		await sabitSatirYuksekligiUygula(env, sheetId, RAKIP_ANALIZI_COLUMNS.length);
	}
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

// Var olan bir rakip satırını YERİNDE günceller (append DEĞİL) — Kayıtlı Rakipler tablosunun
// "Düzelt" akışı (2026-08-16, kullanıcı isteği) bunu çağırıyor. rakipTakipSheets.ts#updateRakipTakipRow
// ile aynı desen: mevcut satır okunur, patch üstüne yazılır, tüm satır tek seferde geri yazılır.
export async function updateRakipAnalizRow(
	env: Env,
	rowNumber: number,
	mevcutRow: RakipAnalizRow,
	patch: Partial<RakipAnalizRow>,
): Promise<void> {
	const yeniRow: RakipAnalizRow = { ...mevcutRow, ...patch };
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A${rowNumber}:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}${rowNumber}`;
	const values = [RAKIP_ANALIZI_COLUMNS.map((key) => String(yeniRow[key] ?? ''))];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Verilen (1-indexed) satır numaralarını RakipAnalizi sekmesinden tamamen siler. Sheets API'nin
// deleteDimension'ı her istek uygulandıkça alttaki satırları yukarı kaydırdığı için, aynı
// batchUpdate içindeki istekler BÜYÜKTEN KÜÇÜĞE sıralanmalı — yoksa ikinci silme yanlış satırı
// hedefler (önceki silmenin kaydırdığı satırı).
export async function deleteRakipAnalizRows(env: Env, rowNumbers: number[]): Promise<void> {
	if (!rowNumbers.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('RakipAnalizi tab bulunamadı, silme yapılamadı.');

	const sortedDesc = [...rowNumbers].sort((a, b) => b - a);
	await sheetsFetch(env, ':batchUpdate', {
		method: 'POST',
		body: JSON.stringify({
			requests: sortedDesc.map((rowNumber) => ({
				deleteDimension: {
					range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber },
				},
			})),
		}),
	});
}

// Rakip Platform Tespiti (2026-08-25) — LLM'in web_search ile tespit ettiği platform listesini
// aktifPlatformlar hücresine NATIVE bir Sheets notu (CellData.note) olarak yazar. Sheets'in ayrı/
// karmaşık "comments" (Drive tabanlı, threadli) API'sinden FARKLI — basit bir metin notu, hücreye
// sağ-üstte küçük bir üçgen olarak görünür. `fields: 'note'` mask'ı SADECE bu alanı hedefler —
// checkbox'lardan gelen ASIL değer (userEnteredValue) bu API semantiği gereği HİÇ etkilenmez, ayrı
// bir koruma kodu yazmaya gerek yok (deleteRakipAnalizRows'daki sheetId-bulma deseniyle aynı).
export async function setAktifPlatformlarNotu(env: Env, rowNumber: number, notMetni: string): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('RakipAnalizi tab bulunamadı, not yazılamadı.');
	const colIndex = RAKIP_ANALIZI_COLUMNS.indexOf('aktifPlatformlar');
	await sheetsFetch(env, ':batchUpdate', {
		method: 'POST',
		body: JSON.stringify({
			requests: [
				{
					updateCells: {
						range: {
							sheetId,
							startRowIndex: rowNumber - 1,
							endRowIndex: rowNumber,
							startColumnIndex: colIndex,
							endColumnIndex: colIndex + 1,
						},
						rows: [{ values: [{ note: notMetni }] }],
						fields: 'note',
					},
				},
			],
		}),
	});
}

// N rakip için TEK bir sheetId sorgusu + TEK bir batchUpdate isteğinde toplu not yazımı — BE-115:
// setAktifPlatformlarNotu (tekil) her çağrıda kendi sheetId sorgusunu TEKRARLIYORDU, rakip
// sayısıyla doğrusal büyüyen subrequest maliyeti yaratıyordu (rakip başına 2). setAktifPlatformlarNotu
// (tekil) DEĞİŞMEDİ, mevcut testleri etkilenmiyor — bu SADECE çok-öğeli senaryolar için ek bir
// fonksiyon (bkz. routes/rakipAnalizi.ts#rakipPlatformTespitiBaglamiGetir).
export async function setAktifPlatformlarNotlariToplu(env: Env, notlar: { rowNumber: number; notMetni: string }[]): Promise<void> {
	if (!notlar.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('RakipAnalizi tab bulunamadı, not yazılamadı.');
	const colIndex = RAKIP_ANALIZI_COLUMNS.indexOf('aktifPlatformlar');
	await sheetsFetch(env, ':batchUpdate', {
		method: 'POST',
		body: JSON.stringify({
			requests: notlar.map(({ rowNumber, notMetni }) => ({
				updateCells: {
					range: {
						sheetId,
						startRowIndex: rowNumber - 1,
						endRowIndex: rowNumber,
						startColumnIndex: colIndex,
						endColumnIndex: colIndex + 1,
					},
					rows: [{ values: [{ note: notMetni }] }],
					fields: 'note',
				},
			})),
		}),
	});
}
