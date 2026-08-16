import { errorResponse, json } from '../lib/http';
import { ensureKullanimLimitTab, getGuncelLimit, getAllKullanimLimitRows, updateKullanimLimit } from '../lib/kullanimLimitSheets';
import { ensureGiderTakipTab, appendHarcamaKaydi } from '../lib/giderTakipSheets';
import { usdKarsiligi } from '../lib/currency';
import { KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER, RAPOR_MALIYETI_USD, type KullanimKategori } from '../config';
import type { Env } from '../types';

function arttirilabilirMi(x: string): x is (typeof KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER)[number] {
	return (KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER as readonly string[]).includes(x);
}

// POST /panel/rakip-analizi/kullanim-limit-arttir { kategori, tutar, paraBirimi } — Limit Yükseltme
// (2026-08-15) + eksi tutarla düzeltme (2026-08-16, kullanıcı isteği). Anthropic/Google'ın bize
// "yükleme tamamlandı" webhook'u/bakiye API'si yok (araştırıldı) — Çiğdem sağlayıcı sayfasına
// gidip kendi yükler, ne kadar yüklediğini burada kendisi girer. Biz sadece USD karşılığını
// hesaplayıp (yaklaşık — gerçek kur kart ağına göre değişebilir) RAPOR_MALIYETI_USD'ye bölüp
// limite ekliyoruz/çıkarıyoruz.
//
// tutar NEGATİF de olabilir — bu, "yanlışlıkla girdiğim bir tutarı geri al" düzeltme yolu
// (kullanıcı 2026-08-16'da tam bunu yaşadı, elle düzeltmek zorunda kalındı). Eksi bir tutar SADECE
// o kategoride en son kullanılan para biriminde girilebilir — farklı bir para biriminde düzeltmeye
// izin verirsek, iki ayrı anda iki farklı FX kuru kullanılmış olur ve düzeltme orijinal işlemi tam
// iptal etmez. Yuvarlama da floor değil trunc (sıfıra doğru) — floor pozitifte "cömert olma" yönünde
// güvenliyken (daha az rapor ekler), NEGATİFTE floor tam tersi yönde davranıp gereğinden fazla rapor
// GERİ ALIRDI (-4.18/0.2 floor'u -21 verir, oysa orijinal ekleme +4.18/0.2 floor'u +20 vermişti) —
// trunc her iki yönde de simetrik ve tutarlı.
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
	if (!Number.isFinite(tutar) || tutar === 0) return errorResponse(request, 400, 'Geçersiz tutar.');

	const paraBirimi = String(body.paraBirimi ?? '')
		.trim()
		.toUpperCase();
	if (!/^[A-Z]{3}$/.test(paraBirimi)) return errorResponse(request, 400, 'Geçersiz para birimi kodu (ör. TRY, USD, EUR, GBP).');

	await ensureKullanimLimitTab(env);

	if (tutar < 0) {
		const rows = await getAllKullanimLimitRows(env);
		const sonKullanilan = rows.find(({ row }) => row.kategori === kategori)?.row.sonEklenenParaBirimi || null;
		if (!sonKullanilan) {
			return errorResponse(request, 400, 'Bu kategoride henüz bir yükleme yapılmadı, düzeltilecek bir şey yok.');
		}
		if (sonKullanilan !== paraBirimi) {
			return errorResponse(request, 400, `Düzeltme sadece en son kullanılan para biriminde (${sonKullanilan}) yapılabilir.`);
		}
	}

	let usdTutar: number;
	try {
		usdTutar = await usdKarsiligi(tutar, paraBirimi);
	} catch (err) {
		return errorResponse(request, 502, 'Kur bilgisi şu an alınamadı, lütfen tekrar dene.', err);
	}

	const ekRaporSayisi = Math.trunc(usdTutar / RAPOR_MALIYETI_USD);
	if (tutar > 0 && ekRaporSayisi < 1) {
		return json({ error: `Bu tutar (~$${usdTutar.toFixed(2)}) en az bir ek rapor hakkı kazandırmıyor.` }, request, { status: 400 });
	}

	const mevcutLimit = (await getGuncelLimit(env, kategori as KullanimKategori)) ?? 0;
	const yeniLimit = Math.max(0, mevcutLimit + ekRaporSayisi);
	await updateKullanimLimit(env, kategori as KullanimKategori, yeniLimit, tutar, paraBirimi);

	const yaklasikUsd = Math.round(usdTutar * 100) / 100;
	// Gerçek gider kaydı — işletmenin gider/gelir tablosunda kullanılmak üzere (kullanıcı isteği,
	// 2026-08-15). Negatif bir tutar burada da negatif bir harcama satırı olarak görünür — bir
	// önceki hatalı girişi telafi ettiğini gösteren doğal bir iz (append-only, hiçbir satır silinmiyor
	// ya da elle değiştirilmiyor). Bu adım başarısız olsa bile limit zaten güncellendi, kullanıcıya
	// hata gösterme.
	try {
		await ensureGiderTakipTab(env);
		await appendHarcamaKaydi(env, { kategori: kategori as KullanimKategori, tutar, paraBirimi, yaklasikUsd });
	} catch (err) {
		console.error('Gider kaydı eklenemedi', err);
	}

	return json({ yeniLimit, eklenenRaporSayisi: ekRaporSayisi, yaklasikUsd }, request);
}
