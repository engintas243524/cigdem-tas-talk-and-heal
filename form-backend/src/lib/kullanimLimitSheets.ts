import {
	KULLANIM_LIMIT_TAB_NAME,
	KULLANIM_LIMIT_COLUMNS,
	KULLANIM_LIMIT_COLUMN_LABELS,
	KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER,
	KULLANIM_KATEGORILERI,
	type KullanimKategori,
} from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

export type KullanimLimitRow = Record<(typeof KULLANIM_LIMIT_COLUMNS)[number], string>;

function bosSatir(): KullanimLimitRow {
	const row = {} as KullanimLimitRow;
	for (const key of KULLANIM_LIMIT_COLUMNS) row[key] = '';
	return row;
}

// RakipTakip'teki SABİT satır deseniyle aynı (bkz. o dosyanın yorumu): iki arttırılabilir kategori
// için bir satır, hiç append edilmiyor — sadece updateKullanimLimit ile yerinde güncelleniyor.
export async function ensureKullanimLimitTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === KULLANIM_LIMIT_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{ addSheet: { properties: { title: KULLANIM_LIMIT_TAB_NAME, gridProperties: { columnCount: KULLANIM_LIMIT_COLUMNS.length } } } },
				],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
		await seedEksikSatirlar(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < KULLANIM_LIMIT_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: KULLANIM_LIMIT_COLUMNS.length } },
								fields: 'gridProperties.columnCount',
							},
						},
					],
				}),
			});
		}
		await writeHeaderRow(env);
		await seedEksikSatirlar(env);
	}

	if (sheetId !== undefined) {
		await sabitSatirYuksekligiUygula(env, sheetId, KULLANIM_LIMIT_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${KULLANIM_LIMIT_TAB_NAME}!A1:${columnLetter(KULLANIM_LIMIT_COLUMNS.length - 1)}1`;
	const values = [KULLANIM_LIMIT_COLUMNS.map((key) => KULLANIM_LIMIT_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Eksik kategori satırlarını (ilk kurulum) config.ts'deki statik varsayılan limitle tohumlar —
// böylece limit her zaman bu sekmede okunabilir tek bir yerde olur (statik/override ayrımı yok).
async function seedEksikSatirlar(env: Env): Promise<void> {
	const mevcut = await getAllKullanimLimitRows(env);
	const mevcutKategoriler = new Set(mevcut.map(({ row }) => row.kategori));
	const eksikler = KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER.filter((k) => !mevcutKategoriler.has(k));
	if (!eksikler.length) return;
	const values = eksikler.map((kategori) => {
		const row = bosSatir();
		row.kategori = kategori;
		row.limit = String(KULLANIM_KATEGORILERI[kategori].aylikLimit ?? 0);
		row.guncellenmeUtc = new Date().toISOString();
		return KULLANIM_LIMIT_COLUMNS.map((key) => row[key]);
	});
	const range = `${KULLANIM_LIMIT_TAB_NAME}!A:${columnLetter(KULLANIM_LIMIT_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}

export async function getAllKullanimLimitRows(env: Env): Promise<{ rowNumber: number; row: KullanimLimitRow }[]> {
	const range = `${KULLANIM_LIMIT_TAB_NAME}!A2:${columnLetter(KULLANIM_LIMIT_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as KullanimLimitRow;
			KULLANIM_LIMIT_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.kategori);
}

// Her arttırılabilir kategori için o anki (güncel) limiti döner — satır hiç yoksa (ensure henüz
// çalışmadıysa) config.ts'deki statik varsayılana düşer.
export async function getGuncelLimit(env: Env, kategori: KullanimKategori): Promise<number | null> {
	const rows = await getAllKullanimLimitRows(env);
	const satir = rows.find(({ row }) => row.kategori === kategori);
	if (satir) {
		const n = Number(satir.row.limit);
		if (Number.isFinite(n)) return n;
	}
	return KULLANIM_KATEGORILERI[kategori].aylikLimit;
}

export async function updateKullanimLimit(
	env: Env,
	kategori: KullanimKategori,
	yeniLimit: number,
	eklenenTutar: number,
	eklenenParaBirimi: string,
): Promise<void> {
	const rows = await getAllKullanimLimitRows(env);
	const satir = rows.find(({ row }) => row.kategori === kategori);
	const row: KullanimLimitRow = {
		kategori,
		limit: String(yeniLimit),
		sonEklenenTutar: String(eklenenTutar),
		sonEklenenParaBirimi: eklenenParaBirimi.toUpperCase(),
		guncellenmeUtc: new Date().toISOString(),
	};
	const values = [KULLANIM_LIMIT_COLUMNS.map((key) => row[key])];
	if (satir) {
		const range = `${KULLANIM_LIMIT_TAB_NAME}!A${satir.rowNumber}:${columnLetter(KULLANIM_LIMIT_COLUMNS.length - 1)}${satir.rowNumber}`;
		await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
			method: 'PUT',
			body: JSON.stringify({ values }),
		});
	} else {
		const range = `${KULLANIM_LIMIT_TAB_NAME}!A:${columnLetter(KULLANIM_LIMIT_COLUMNS.length - 1)}`;
		await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
			method: 'POST',
			body: JSON.stringify({ values }),
		});
	}
}
