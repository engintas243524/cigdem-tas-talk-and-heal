import { errorResponse, json } from '../lib/http';
import { ensureKullanimLimitTab, getGuncelLimit, updateKullanimLimit } from '../lib/kullanimLimitSheets';
import { usdKarsiligi } from '../lib/currency';
import { KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER, RAPOR_MALIYETI_USD, type KullanimKategori } from '../config';
import type { Env } from '../types';

function arttirilabilirMi(x: string): x is (typeof KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER)[number] {
	return (KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER as readonly string[]).includes(x);
}

// POST /panel/rakip-analizi/kullanim-limit-arttir { kategori, tutar, paraBirimi } — Limit Yükseltme
// (2026-08-16, kullanıcı isteği). Anthropic/Google'ın bize "yükleme tamamlandı" webhook'u/bakiye
// API'si yok (2026-08-16'da araştırıldı) — Çiğdem sağlayıcı sayfasına gidip kendi yükler, ne kadar
// yüklediğini burada kendisi girer. Biz sadece USD karşılığını hesaplayıp (yaklaşık — gerçek kur
// kart ağına göre değişebilir) RAPOR_MALIYETI_USD'ye bölüp limite ekliyoruz.
export async function handleKullanimLimitArttir(request: Request, env: Env): Promise<Response> {
	let body: { kategori?: unknown; tutar?: unknown; paraBirimi?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const kategori = String(body.kategori ?? '');
	if (!arttirilabilirMi(kategori)) return errorResponse(request, 400, 'Bu kategori için limit yükseltme desteklenmiyor.');

	const tutar = Number(body.tutar);
	if (!Number.isFinite(tutar) || tutar <= 0) return errorResponse(request, 400, 'Geçersiz tutar.');

	const paraBirimi = String(body.paraBirimi ?? '')
		.trim()
		.toUpperCase();
	if (!/^[A-Z]{3}$/.test(paraBirimi)) return errorResponse(request, 400, 'Geçersiz para birimi kodu (ör. TRY, USD, EUR, GBP).');

	let usdTutar: number;
	try {
		usdTutar = await usdKarsiligi(tutar, paraBirimi);
	} catch (err) {
		return errorResponse(request, 502, 'Kur bilgisi şu an alınamadı, lütfen tekrar dene.', err);
	}

	const ekRaporSayisi = Math.floor(usdTutar / RAPOR_MALIYETI_USD);
	if (ekRaporSayisi < 1) {
		return json({ error: `Bu tutar (~$${usdTutar.toFixed(2)}) en az bir ek rapor hakkı kazandırmıyor.` }, request, { status: 400 });
	}

	await ensureKullanimLimitTab(env);
	const mevcutLimit = (await getGuncelLimit(env, kategori as KullanimKategori)) ?? 0;
	const yeniLimit = mevcutLimit + ekRaporSayisi;
	await updateKullanimLimit(env, kategori as KullanimKategori, yeniLimit, tutar, paraBirimi);

	return json({ yeniLimit, eklenenRaporSayisi: ekRaporSayisi, yaklasikUsd: Math.round(usdTutar * 100) / 100 }, request);
}
