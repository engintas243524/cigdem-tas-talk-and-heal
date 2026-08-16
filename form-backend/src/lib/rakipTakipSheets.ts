import { RAKIP_TAKIP_TAB_NAME, RAKIP_TAKIP_COLUMNS, RAKIP_TAKIP_COLUMN_LABELS, RAKIP_TAKIP_PERIYOT_TURLERI } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

export type RakipTakipRow = Record<(typeof RAKIP_TAKIP_COLUMNS)[number], string>;

function emptyRakipTakipRow(): RakipTakipRow {
	const row = {} as RakipTakipRow;
	for (const key of RAKIP_TAKIP_COLUMNS) row[key] = '';
	return row;
}

// RakipTakip sekmesini oluşturur/tamamlar ve SABİT 6 satırı (bir periyot türü = bir satır) tohumlar
// — bkz. config.ts'deki tasarım notu. rakipSheets.ts'deki ensureRakipAnaliziTab ile aynı
// oluşturma/genişletme mantığı, tek fark satır tohumlaması. Satır yüksekliği sabitleme
// (projeksiyon/hedef/realizasyon/fark uzun rapor metni tutuyor, ama artık tüm sütunlar için
// uygulanıyor) paylaşılan lib/sheets.ts#sabitSatirYuksekligiUygula içinde — bkz. o fonksiyonun
// yorumu (2026-08-16'da RakipAnalizi/RakipTakipGecmis/KullanimKaydi sekmelerine de genelleştirildi).
export async function ensureRakipTakipTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAKIP_TAKIP_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: { title: RAKIP_TAKIP_TAB_NAME, gridProperties: { columnCount: RAKIP_TAKIP_COLUMNS.length } },
						},
					},
				],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
		await seedEksikPeriyotRows(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < RAKIP_TAKIP_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: RAKIP_TAKIP_COLUMNS.length } },
								fields: 'gridProperties.columnCount',
							},
						},
					],
				}),
			});
		}
		await writeHeaderRow(env);
		await seedEksikPeriyotRows(env);
	}

	if (sheetId !== undefined) {
		await sabitSatirYuksekligiUygula(env, sheetId, RAKIP_TAKIP_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${RAKIP_TAKIP_TAB_NAME}!A1:${columnLetter(RAKIP_TAKIP_COLUMNS.length - 1)}1`;
	const values = [RAKIP_TAKIP_COLUMNS.map((key) => RAKIP_TAKIP_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// 6 sabit periyot satırından eksik olanları (ilk kurulum, ya da biri elle silinmişse) tek seferlik
// append ile tamamlar. Sonrasında bu satırlar bir daha ASLA append edilmiyor, sadece updateRakipTakipRow
// ile yerinde güncelleniyor.
async function seedEksikPeriyotRows(env: Env): Promise<void> {
	const mevcut = await getAllRakipTakipRows(env);
	const mevcutTurler = new Set(mevcut.map(({ row }) => row.periyotTuru));
	const eksikTurler = RAKIP_TAKIP_PERIYOT_TURLERI.filter((t) => !mevcutTurler.has(t));
	if (!eksikTurler.length) return;
	const values = eksikTurler.map((periyotTuru) => {
		const row = emptyRakipTakipRow();
		row.periyotTuru = periyotTuru;
		return RAKIP_TAKIP_COLUMNS.map((key) => row[key]);
	});
	const range = `${RAKIP_TAKIP_TAB_NAME}!A:${columnLetter(RAKIP_TAKIP_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}

export async function getAllRakipTakipRows(env: Env): Promise<{ rowNumber: number; row: RakipTakipRow }[]> {
	const range = `${RAKIP_TAKIP_TAB_NAME}!A2:${columnLetter(RAKIP_TAKIP_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as RakipTakipRow;
			RAKIP_TAKIP_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.periyotTuru);
}

export async function getRakipTakipDurumu(env: Env, periyotTuru: string): Promise<{ rowNumber: number; row: RakipTakipRow } | null> {
	const rows = await getAllRakipTakipRows(env);
	return rows.find(({ row }) => row.periyotTuru === periyotTuru) ?? null;
}

// Var olan bir periyot satırını YERİNDE günceller (append DEĞİL) — döngü bir sonraki adıma
// geçtiğinde aynı satırın üstüne yazılır, sekme satır sayısı asla artmaz.
export async function updateRakipTakipRow(
	env: Env,
	rowNumber: number,
	mevcutRow: RakipTakipRow,
	patch: Partial<RakipTakipRow>,
): Promise<void> {
	const yeniRow: RakipTakipRow = { ...mevcutRow, ...patch };
	const range = `${RAKIP_TAKIP_TAB_NAME}!A${rowNumber}:${columnLetter(RAKIP_TAKIP_COLUMNS.length - 1)}${rowNumber}`;
	const values = [RAKIP_TAKIP_COLUMNS.map((key) => String(yeniRow[key] ?? ''))];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}
