import {
	KULLANIM_KAYDI_TAB_NAME,
	KULLANIM_KAYDI_COLUMNS,
	KULLANIM_KAYDI_COLUMN_LABELS,
	KULLANIM_KATEGORILERI,
	type KullanimKategori,
} from '../config';
import { columnLetter, sheetsFetch } from './sheets';
import type { Env } from '../types';

type KullanimKaydiRow = Record<(typeof KULLANIM_KAYDI_COLUMNS)[number], string>;

// kotaDolduMu true dönünce çağıran route bunu yakalayıp 402 döndürür (bkz. routes/rakipAnalizi.ts,
// routes/rakipTakip.ts) — Google kategorilerindeki aynı desen, Anthropic kategorileri için de.
export class KotaDolduError extends Error {
	constructor(public readonly kategori: KullanimKategori) {
		super(`Kota doldu: ${kategori}`);
	}
}

// RakipAnalizi'nin ensureRakipAnaliziTab'ıyla aynı desen — tab yoksa oluştur, varsa kolon
// sayısını genişlet, header'ı her seferinde yeniden yaz (kendini onaran).
export async function ensureKullanimKaydiTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === KULLANIM_KAYDI_TAB_NAME);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{ addSheet: { properties: { title: KULLANIM_KAYDI_TAB_NAME, gridProperties: { columnCount: KULLANIM_KAYDI_COLUMNS.length } } } },
				],
			}),
		});
		await writeHeaderRow(env);
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < KULLANIM_KAYDI_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: { sheetId: existing.properties.sheetId, gridProperties: { columnCount: KULLANIM_KAYDI_COLUMNS.length } },
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
	const range = `${KULLANIM_KAYDI_TAB_NAME}!A1:${columnLetter(KULLANIM_KAYDI_COLUMNS.length - 1)}1`;
	const values = [KULLANIM_KAYDI_COLUMNS.map((key) => KULLANIM_KAYDI_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Tek bir kullanım olayını kaydeder (ör. bir arama, bir rapor üretimi). Kota kontrolünün TEK
// kaynağı bu tablo — ayrı bir sayaç tutulmuyor, aylık toplam her seferinde bu satırlardan sayılır.
export async function logKullanim(env: Env, kategori: KullanimKategori, detay: string): Promise<void> {
	const row: KullanimKaydiRow = { id: crypto.randomUUID(), tarihUtc: new Date().toISOString(), kategori, detay };
	const values = [KULLANIM_KAYDI_COLUMNS.map((key) => row[key])];
	const range = `${KULLANIM_KAYDI_TAB_NAME}!A:${columnLetter(KULLANIM_KAYDI_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}

export interface KullanimOzetKategori {
	etiket: string;
	kullanilan: number;
	aylikLimit: number | null;
}

// Bu ayki (UTC takvim ayı) kullanımı kategori başına sayar. Tüm satırları okuyup bellekte
// filtreliyor — hacim (aylık birkaç yüz/bin satır) bunun için hâlâ ucuz, ayrı bir sayaç
// tutmanın (ve onu senkron tutmanın) karmaşıklığından kaçınmaya değer.
export async function getKullanimOzet(env: Env): Promise<Record<KullanimKategori, KullanimOzetKategori>> {
	const range = `${KULLANIM_KAYDI_TAB_NAME}!A2:${columnLetter(KULLANIM_KAYDI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	const rows = data.values ?? [];

	const now = new Date();
	const ayBaslangici = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();

	const sayimlar: Partial<Record<KullanimKategori, number>> = {};
	for (const values of rows) {
		const tarihUtc = values[1];
		const kategori = values[2] as KullanimKategori;
		if (!tarihUtc || !(kategori in KULLANIM_KATEGORILERI)) continue;
		const ts = Date.parse(tarihUtc);
		if (Number.isNaN(ts) || ts < ayBaslangici) continue;
		sayimlar[kategori] = (sayimlar[kategori] ?? 0) + 1;
	}

	const ozet = {} as Record<KullanimKategori, KullanimOzetKategori>;
	for (const kategori of Object.keys(KULLANIM_KATEGORILERI) as KullanimKategori[]) {
		ozet[kategori] = {
			etiket: KULLANIM_KATEGORILERI[kategori].etiket,
			kullanilan: sayimlar[kategori] ?? 0,
			aylikLimit: KULLANIM_KATEGORILERI[kategori].aylikLimit,
		};
	}
	return ozet;
}

// Bir kategori bu ay için kotasını doldurmuş mu? aylikLimit=null olan bir kategori (şu an yok,
// ama gelecekte eklenebilir) burada hiç sınırlanmaz.
export async function kotaDolduMu(env: Env, kategori: KullanimKategori): Promise<boolean> {
	const limit = KULLANIM_KATEGORILERI[kategori].aylikLimit;
	if (limit === null) return false;
	const ozet = await getKullanimOzet(env);
	return ozet[kategori].kullanilan >= limit;
}
