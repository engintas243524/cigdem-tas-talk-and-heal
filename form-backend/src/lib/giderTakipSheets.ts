import { GIDER_TAKIP_TAB_NAME, GIDER_TAKIP_COLUMNS, GIDER_TAKIP_COLUMN_LABELS, type KullanimKategori } from '../config';
import { columnLetter, sheetsFetch, sabitSatirYuksekligiUygula } from './sheets';
import type { Env } from '../types';

export type GiderTakipRow = Record<(typeof GIDER_TAKIP_COLUMNS)[number], string>;

function bosSatir(): GiderTakipRow {
	const row = {} as GiderTakipRow;
	for (const key of GIDER_TAKIP_COLUMNS) row[key] = '';
	return row;
}

// rakipSheets.ts'deki ensureRakipAnaliziTab ile aynı oluşturma/genişletme deseni.
export async function ensureGiderTakipTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === GIDER_TAKIP_TAB_NAME);

	let sheetId: number | undefined = existing?.properties?.sheetId;

	if (!existing) {
		const createResponse = await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{ addSheet: { properties: { title: GIDER_TAKIP_TAB_NAME, gridProperties: { columnCount: GIDER_TAKIP_COLUMNS.length } } } },
				],
			}),
		});
		const createData = (await createResponse.json()) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
		sheetId = createData.replies?.[0]?.addSheet?.properties?.sheetId;
		await writeHeaderRow(env);
	} else {
		const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
		if (columnCount < GIDER_TAKIP_COLUMNS.length && sheetId !== undefined) {
			await sheetsFetch(env, ':batchUpdate', {
				method: 'POST',
				body: JSON.stringify({
					requests: [
						{
							updateSheetProperties: {
								properties: { sheetId, gridProperties: { columnCount: GIDER_TAKIP_COLUMNS.length } },
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
		await sabitSatirYuksekligiUygula(env, sheetId, GIDER_TAKIP_COLUMNS.length);
	}
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${GIDER_TAKIP_TAB_NAME}!A1:${columnLetter(GIDER_TAKIP_COLUMNS.length - 1)}1`;
	const values = [GIDER_TAKIP_COLUMNS.map((key) => GIDER_TAKIP_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function getAllGiderTakipRows(env: Env): Promise<{ rowNumber: number; row: GiderTakipRow }[]> {
	const range = `${GIDER_TAKIP_TAB_NAME}!A2:${columnLetter(GIDER_TAKIP_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as GiderTakipRow;
			GIDER_TAKIP_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.id);
}

// Gerçek para harcaması — her "Limiti Yükselt" başarılı yüklemesinde APPEND edilir, hiç güncellenmez
// ya da silinmez. İşletmenin gider tablosundaki "gider" kalemi doğrudan bu satırların toplamı.
export async function appendHarcamaKaydi(
	env: Env,
	kayit: { kategori: KullanimKategori; tutar: number; paraBirimi: string; yaklasikUsd: number },
): Promise<void> {
	const row = bosSatir();
	row.id = crypto.randomUUID();
	row.tarihUtc = new Date().toISOString();
	row.tur = 'harcama';
	row.kategori = kayit.kategori;
	row.tutar = String(kayit.tutar);
	row.paraBirimi = kayit.paraBirimi.toUpperCase();
	row.yaklasikUsd = String(kayit.yaklasikUsd);
	row.aciklama = 'Anthropic kredi yüklemesi (Limiti Yükselt)';

	const range = `${GIDER_TAKIP_TAB_NAME}!A:${columnLetter(GIDER_TAKIP_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values: [GIDER_TAKIP_COLUMNS.map((key) => row[key])] }),
	});
}

// Bir (yılAyBaslangicUtc, kategori) çifti için TEK satır — o ay boyunca YERİNDE güncellenir (append
// değil), ay değişince yeni bir satır açılır. bkz. scheduled.ts#runGiderTakipAylikOzetSweep.
export async function upsertAylikKullanimKaydi(
	env: Env,
	kayit: { yilAyBaslangicUtc: string; kategori: KullanimKategori; kullanilanSayisi: number; aylikLimit: number | null },
): Promise<void> {
	const rows = await getAllGiderTakipRows(env);
	const mevcut = rows.find(
		({ row }) => row.tur === 'aylikKullanim' && row.tarihUtc === kayit.yilAyBaslangicUtc && row.kategori === kayit.kategori,
	);

	const row = bosSatir();
	row.id = mevcut?.row.id || crypto.randomUUID();
	row.tarihUtc = kayit.yilAyBaslangicUtc;
	row.tur = 'aylikKullanim';
	row.kategori = kayit.kategori;
	row.kullanilanSayisi = String(kayit.kullanilanSayisi);
	row.aylikLimit = kayit.aylikLimit != null ? String(kayit.aylikLimit) : '';

	const values = [GIDER_TAKIP_COLUMNS.map((key) => row[key])];
	if (mevcut) {
		const range = `${GIDER_TAKIP_TAB_NAME}!A${mevcut.rowNumber}:${columnLetter(GIDER_TAKIP_COLUMNS.length - 1)}${mevcut.rowNumber}`;
		await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
			method: 'PUT',
			body: JSON.stringify({ values }),
		});
	} else {
		const range = `${GIDER_TAKIP_TAB_NAME}!A:${columnLetter(GIDER_TAKIP_COLUMNS.length - 1)}`;
		await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
			method: 'POST',
			body: JSON.stringify({ values }),
		});
	}
}
