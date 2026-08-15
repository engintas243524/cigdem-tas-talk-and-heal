import {
	RAKIP_TAKIP_GECMIS_TAB_NAME,
	RAKIP_TAKIP_GECMIS_COLUMNS,
	RAKIP_TAKIP_GECMIS_COLUMN_LABELS,
	RAKIP_TAKIP_GECMIS_MAX_KAYIT,
} from '../config';
import { columnLetter, sheetsFetch } from './sheets';
import type { Env } from '../types';

export type RakipTakipGecmisRow = Record<(typeof RAKIP_TAKIP_GECMIS_COLUMNS)[number], string>;

function emptyRow(): RakipTakipGecmisRow {
	const row = {} as RakipTakipGecmisRow;
	for (const key of RAKIP_TAKIP_GECMIS_COLUMNS) row[key] = '';
	return row;
}

// rakipSheets.ts'deki ensureRakipAnaliziTab ile aynı oluşturma/genişletme deseni — bu sekme sadece
// append (rotasyonla sınırlı) yapıyor, RakipTakip'in aksine sabit satır tohumlamıyor.
export async function ensureRakipTakipGecmisTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAKIP_TAKIP_GECMIS_TAB_NAME);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: { title: RAKIP_TAKIP_GECMIS_TAB_NAME, gridProperties: { columnCount: RAKIP_TAKIP_GECMIS_COLUMNS.length } },
						},
					},
				],
			}),
		});
		await writeHeaderRow(env);
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < RAKIP_TAKIP_GECMIS_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: { sheetId: existing.properties.sheetId, gridProperties: { columnCount: RAKIP_TAKIP_GECMIS_COLUMNS.length } },
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
	const range = `${RAKIP_TAKIP_GECMIS_TAB_NAME}!A1:${columnLetter(RAKIP_TAKIP_GECMIS_COLUMNS.length - 1)}1`;
	const values = [RAKIP_TAKIP_GECMIS_COLUMNS.map((key) => RAKIP_TAKIP_GECMIS_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

export async function getAllRakipTakipGecmisRows(env: Env): Promise<{ rowNumber: number; row: RakipTakipGecmisRow }[]> {
	const range = `${RAKIP_TAKIP_GECMIS_TAB_NAME}!A2:${columnLetter(RAKIP_TAKIP_GECMIS_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? [])
		.map((values, i) => {
			const row = {} as RakipTakipGecmisRow;
			RAKIP_TAKIP_GECMIS_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
			return { rowNumber: i + 2, row };
		})
		.filter(({ row }) => row.id);
}

// (varlikId, periyotTuru) çifti için geçmiş, kronolojik (eskiden yeniye) sırada — grafik çizmek
// için doğrudan kullanılabilir sıra.
export async function getRakipTakipGecmisi(env: Env, varlikId: string, periyotTuru: string): Promise<RakipTakipGecmisRow[]> {
	const rows = await getAllRakipTakipGecmisRows(env);
	return rows
		.filter(({ row }) => row.varlikId === varlikId && row.periyotTuru === periyotTuru)
		.map(({ row }) => row)
		.sort((a, b) => a.donemBaslangicUtc.localeCompare(b.donemBaslangicUtc));
}

async function deleteRows(env: Env, rowNumbers: number[]): Promise<void> {
	if (!rowNumbers.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_TAKIP_GECMIS_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) return;
	// Sıralamayı BÜYÜKTEN KÜÇÜĞE tutmak zorunlu — deleteDimension her istek uygulandıkça alttaki
	// satırları yukarı kaydırır, küçükten büyüğe gidilirse ikinci silme yanlış satırı hedefler
	// (bkz. rakipSheets.ts deleteRakipAnalizRows'daki aynı uyarı).
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

export interface RakipTakipGecmisYeniKayit {
	varlikId: string;
	varlikAdi: string;
	periyotTuru: string;
	donemBaslangicUtc: string;
	donemBitisUtc: string;
	parametreSkorlari: Record<string, number | null>;
	raporMetni: string;
}

// Yeni bir dönem snapshot'ı ekler, sonra o (varlikId, periyotTuru) çifti için
// RAKIP_TAKIP_GECMIS_MAX_KAYIT'ı aşan en eski satır(lar)ı siler — "sınırlı/rotasyonlu geçmiş"
// kararının (2026-08-15) tek uygulama noktası, çağıran kod rotasyonla hiç ilgilenmiyor.
export async function addRakipTakipGecmisKaydi(env: Env, kayit: RakipTakipGecmisYeniKayit): Promise<void> {
	const row = emptyRow();
	row.id = crypto.randomUUID();
	row.varlikId = kayit.varlikId;
	row.varlikAdi = kayit.varlikAdi;
	row.periyotTuru = kayit.periyotTuru;
	row.donemBaslangicUtc = kayit.donemBaslangicUtc;
	row.donemBitisUtc = kayit.donemBitisUtc;
	row.parametreSkorlariJson = JSON.stringify(kayit.parametreSkorlari);
	row.raporMetni = kayit.raporMetni;
	row.eklenmeTarihUtc = new Date().toISOString();

	const range = `${RAKIP_TAKIP_GECMIS_TAB_NAME}!A:${columnLetter(RAKIP_TAKIP_GECMIS_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values: [RAKIP_TAKIP_GECMIS_COLUMNS.map((key) => row[key])] }),
	});

	const tumSatirlar = await getAllRakipTakipGecmisRows(env);
	const ayniCift = tumSatirlar
		.filter(({ row: r }) => r.varlikId === kayit.varlikId && r.periyotTuru === kayit.periyotTuru)
		.sort((a, b) => a.row.eklenmeTarihUtc.localeCompare(b.row.eklenmeTarihUtc));
	if (ayniCift.length > RAKIP_TAKIP_GECMIS_MAX_KAYIT) {
		const silinecekler = ayniCift.slice(0, ayniCift.length - RAKIP_TAKIP_GECMIS_MAX_KAYIT).map(({ rowNumber }) => rowNumber);
		await deleteRows(env, silinecekler);
	}
}
