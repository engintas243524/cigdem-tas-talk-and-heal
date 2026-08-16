import { getAllRows } from '../lib/sheets';
import {
	appendRakipAnalizRow,
	getAllRakipAnalizRows,
	emptyRakipAnalizRow,
	ensureRakipAnaliziTab,
	deleteRakipAnalizRows,
} from '../lib/rakipSheets';
import { generateReport, InsufficientCreditError } from '../lib/claude';
import { searchCompetitors } from '../lib/places';
import { geocodeAddress } from '../lib/geocoding';
import { cleanDictation } from '../lib/textCleanup';
import { errorResponse, json } from '../lib/http';
import { ensureKullanimKaydiTab, logKullanim, getKullanimOzet, kotaDolduMu } from '../lib/kullanimKaydi';
import { belgedenMetinCikar, metinCikarWebLink } from '../lib/belgeCikar';
import { ANTHROPIC_BILLING_URL } from '../config';
import type { Env } from '../types';

const NOTE_MAX_LENGTH = 5000;
// İçe Aktar (Faz D1) tek seferde en fazla kaç kaynak belge/link kabul eder — hem prompt boyutunu
// hem de kullanıcının yanlışlıkla onlarca dosya sürükleyip bırakmasını sınırlamak için.
const ICE_AKTAR_MAX_ADET = 10;
const GOOGLE_QUOTA_URL = 'https://console.cloud.google.com/iam-admin/quotas';

function newId(): string {
	return crypto.randomUUID();
}

// POST /panel/rakip-analizi/rakip { isim, link?, adres?, not, kaynak: 'manuel' | 'harita',
// aramaAdres?, aramaSorgu?, aramaRadiusMeters? } — Çiğdem'in rastgele karşılaştığı bir rakip
// (manuel) veya harita aramasından seçtiği bir sonuç (harita), üzerine eklediği yazı/ses
// notuyla birlikte RakipAnalizi sekmesine kaydedilir. arama* alanları sadece kaynak='harita'
// için anlamlı — hangi arama (adres/terim/yarıçap) bu rakibi bulduğunu kaydeder.
export async function handleRakipEkle(request: Request, env: Env): Promise<Response> {
	let body: {
		isim?: unknown;
		link?: unknown;
		adres?: unknown;
		not?: unknown;
		kaynak?: unknown;
		aramaAdres?: unknown;
		aramaSorgu?: unknown;
		aramaRadiusMeters?: unknown;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const isim = String(body.isim ?? '').trim();
	const kaynak = String(body.kaynak ?? '');
	if (!isim) return errorResponse(request, 400, 'Rakip ismi gerekli.');
	if (kaynak !== 'manuel' && kaynak !== 'harita') return errorResponse(request, 400, 'Geçersiz kaynak.');

	const rawNot = String(body.not ?? '').slice(0, NOTE_MAX_LENGTH);
	const not = rawNot ? await cleanDictation(env, rawNot) : '';

	await ensureRakipAnaliziTab(env);
	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = kaynak;
	row.isim = isim;
	row.link = String(body.link ?? '').trim();
	row.adres = String(body.adres ?? '').trim();
	row.not = not;
	if (kaynak === 'harita') {
		row.aramaAdres = String(body.aramaAdres ?? '').trim();
		row.aramaSorgu = String(body.aramaSorgu ?? '').trim();
		row.aramaRadiusMeters = String(body.aramaRadiusMeters ?? '').trim();
	}
	const rowNumber = await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rowNumber }, request);
}

// GET /panel/rakip-analizi/rakip-liste — Çiğdem'in şu ana kadar eklediği (manuel veya haritadan
// seçilerek) rakiplerin listesi. 'rapor' kaynaklı satırlar (İçerik Stratejisi/Aksiyon Analizi
// çıktıları) burada gösterilmiyor — onlar rakip değil, üretilmiş rapor kaydı.
export async function handleRakipListe(request: Request, env: Env): Promise<Response> {
	await ensureRakipAnaliziTab(env);
	const rows = await getAllRakipAnalizRows(env);
	const rakipler = rows
		.filter(({ row }) => row.kaynak === 'manuel' || row.kaynak === 'harita')
		.map(({ row }) => ({
			id: row.id,
			createdAtUtc: row.createdAtUtc,
			kaynak: row.kaynak,
			isim: row.isim,
			link: row.link,
			adres: row.adres,
			not: row.not,
			aramaAdres: row.aramaAdres,
			aramaSorgu: row.aramaSorgu,
			aramaRadiusMeters: row.aramaRadiusMeters,
		}))
		.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
	return json({ rakipler }, request);
}

// GET /panel/rakip-analizi/kullanim-ozet — bu ayki kullanım sayacı. Detaylı olay-bazlı kayıt
// (hangi tarihte, hangi kategoride, hangi arama/istek) sadece Sheet'in KullanimKaydi sekmesinde
// tutuluyor; burası sadece ekranda gösterilecek özet toplamları döner.
export async function handleKullanimOzet(request: Request, env: Env): Promise<Response> {
	await ensureKullanimKaydiTab(env);
	const ozet = await getKullanimOzet(env);
	return json({ ozet }, request);
}

// POST /panel/rakip-analizi/rakip-sil { ids: string[] } — seçilen rakip(ler)i hem RakipAnalizi
// sekmesinden (gerçek satır silme, sadece işaretleme değil) hem de listeden kaldırır. id'ler
// istemcinin gönderdiği satır numarasına değil, sunucunun o an okuduğu güncel satır numarasına
// eşlenir — istemci elinde eski/yanlış bir satır numarası tutuyor olsa bile doğru satır silinir.
export async function handleRakipSil(request: Request, env: Env): Promise<Response> {
	let body: { ids?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
	if (!ids.length) return errorResponse(request, 400, 'Silinecek rakip seçilmedi.');

	await ensureRakipAnaliziTab(env);
	const rows = await getAllRakipAnalizRows(env);
	const rowNumbers = rows.filter(({ row }) => ids.includes(row.id)).map(({ rowNumber }) => rowNumber);
	if (!rowNumbers.length) return errorResponse(request, 404, 'Rakip bulunamadı.');

	await deleteRakipAnalizRows(env, rowNumbers);
	return json({ deleted: rowNumbers.length }, request);
}

// GET /panel/rakip-analizi/rakip-ara?adres=&sorgu=&radiusMeters= — adres/semt metni + serbest
// arama terimi (ör. "psikolog", "terapi merkezi", "avukat") + yarıçap bazlı arama. `sorgu`
// Çiğdem'in kendi yazdığı metin — Google'ın sabit place-type listesine (ör. 'psychotherapist')
// bağlı kalmıyoruz, çünkü o tipler Türkiye'deki işletmelerde zayıf/eksik kapsanıyor ve neyin
// arandığını Çiğdem'den gizliyordu. Backend önce adresi Geocoding API ile enlem/boylama çevirir,
// sonra Places Text Search'ü o konum+yarıçapla sınırlı çalıştırır. API key sızmasın diye backend
// proxy'liyor (kaydetme ayrı bir handleRakipEkle çağrısı — Çiğdem hangi sonuçları seçtiğine karar
// verdikten sonra).
export async function handleRakipAra(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const adres = (url.searchParams.get('adres') ?? '').trim();
	const sorgu = (url.searchParams.get('sorgu') ?? '').trim();
	const radiusMeters = Number(url.searchParams.get('radiusMeters'));
	if (!adres || !sorgu || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
		return errorResponse(request, 400, 'Geçersiz adres/arama terimi/yarıçap.');
	}
	// Google Text Search en fazla 20 sonuç veriyor (bkz. lib/places.ts), o yüzden bu aralıkla
	// sıkıştırıyoruz; 1'in altı/eksik/sayı-olmayan bir değer sessizce 20'ye (varsayılan) düşer.
	const maxResultsInput = Number(url.searchParams.get('maxResults'));
	const maxResults = Number.isFinite(maxResultsInput) && maxResultsInput >= 1 ? Math.min(20, Math.floor(maxResultsInput)) : 20;

	await ensureKullanimKaydiTab(env);
	// Google, ücretsiz aylık kotayı (Adres Bulma 10.000 / Rakip Arama 5.000) aşınca isteği
	// reddetmiyor, sessizce kayıtlı karttan faturalandırmaya başlıyor — bu yüzden çağrıyı hiç
	// yapmadan ÖNCE kendi sayacımızla kontrol edip durduruyoruz (sürpriz fatura riskini önler).
	if (await kotaDolduMu(env, 'adresBulma')) {
		return json(
			{ error: 'Bu ayki ücretsiz Adres Bulma kotası doldu (10.000). Ay başında sıfırlanır.', limitUrl: GOOGLE_QUOTA_URL },
			request,
			{
				status: 402,
			},
		);
	}
	if (await kotaDolduMu(env, 'rakipArama')) {
		return json(
			{ error: 'Bu ayki ücretsiz Rakip Arama kotası doldu (5.000). Ay başında sıfırlanır.', limitUrl: GOOGLE_QUOTA_URL },
			request,
			{
				status: 402,
			},
		);
	}

	try {
		const { lat, lng } = await geocodeAddress(env, adres);
		await logKullanim(env, 'adresBulma', adres);
		const places = await searchCompetitors(env, sorgu, lat, lng, radiusMeters, maxResults);
		await logKullanim(env, 'rakipArama', `'${sorgu}' (${radiusMeters}m) — ${adres}`);
		return json({ places }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Harita şu an yüklenemedi, manuel giriş yapabilirsin.', err);
	}
}

// Görsel/video stratejisi için sistem talimatı — rakip içeriği KOPYALANMAZ, sadece stratejiden
// (format/sıklık/platform) ilham alınır; küratif yaklaşımın kod-seviyesindeki karşılığı bu.
// Kullanıcı kararı (2026-08-15): rakip seçimi bu dalda da mümkün ama seçilen rakiplerin
// birebir/karşılaştırmalı analizi YAPILMAZ — sadece genel/güncel trend bağlamı için kullanılır
// (KVKK ve "içerik kopyalanmaz" ilkesiyle tutarlı). Tam karşılaştırma Aksiyon/Hedef Analizi'nde.
export const ICERIK_STRATEJI_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) sosyal medya içerik stratejisti olarak çalışıyorsun.
Sana verilen rakip verisini ASLA rakip rakip karşılaştırma/analiz yapmadan, sadece genel bir pazar/
güncel trend hissi vermek için arka plan bağlamı olarak kullan. Rakiplerin içeriklerini ASLA
kopyalamadan, sadece stratejilerinden (hangi platformda, ne sıklıkla, hangi format/konu daha çok
etkileşim alıyor) ilham alarak Talk and Heal için ORİJİNAL, telifsiz-stok veya AI-üretilmiş içerik
önerileri sun. Türkçe yaz, somut ve uygulanabilir öneriler ver. Sade, gündelik bir dil kullan —
pazarlama/iş jargonu, uzun karmaşık cümleler ve süslü terimlerden kaçın; hiç bu alanda uzman
olmayan sıradan bir okuyucunun tek okuyuşta anlayacağı, kısa cümlelerle yaz.`;

export const ANALIZ_PARAMETRE_ACIKLAMALARI: Record<string, string> = {
	sosyalMedya: 'Sosyal medya aktiflik/format sıklığı (hangi platformda ne sıklıkla paylaşım yapıyor)',
	fiyat: 'Fiyat/paket karşılaştırması (Not alanında fiyat bilgisi varsa)',
	konum: "Konum/yakınlık (Çiğdem'e ne kadar yakın — arama yarıçapından)",
	googlePuani: 'Google puanı/yorum sayısı ve içeriği (Not alanında varsa)',
	webSitesi: 'Web sitesi kalitesi/SEO görünürlüğü (Not alanında varsa)',
	randevuSistemi: 'Online randevu alma kolaylığı (Not alanında varsa)',
	uzmanlikCesitliligi: 'Uzmanlık alanı/terapi yöntemi çeşitliliği (Not alanında varsa)',
	seansSekli: 'Online/yüz yüze seans seçenekleri (Not alanında varsa)',
	calismaSaatleri: 'Çalışma saatleri esnekliği — akşam/hafta sonu (Not alanında varsa)',
	markaGuveni: 'Marka güveni — sertifika, dernek üyeliği, medya görünürlüğü (Not alanında varsa)',
	reklamGorunurlugu: 'Reklam/pazarlama görünürlüğü — Google Ads, sponsorlu içerik (Not alanında varsa)',
	dilSecenekleri: 'Dil seçenekleri — çoklu dil hizmeti (Not alanında varsa)',
	hedefKitle: 'Hedef kitle/niş konumlandırma — çift, ergen, travma vb. özel odak (Not alanında varsa)',
	ekipBuyuklugu: 'Ekip büyüklüğü/kapasite — tek terapist mi, çok terapistli klinik mi (Not alanında varsa)',
	deneyimSuresi: 'Deneyim süresi/kuruluş yılı (Not alanında varsa)',
	sigortaKurumsal: 'Sigorta/kurumsal anlaşmalar (Not alanında varsa)',
	ucretsizOnGorusme: 'Ücretsiz ön görüşme/deneme seansı sunuyor mu (Not alanında varsa)',
	referansVakaPaylasimi: 'Referans/vaka paylaşımı derinliği (Not alanında varsa)',
	topluluktEtkinlik: 'Atölye/webinar/topluluk etkinliği düzenliyor mu (Not alanında varsa)',
	fiyatSeffafligi: 'Fiyatı web sitesinde açıkça paylaşıyor mu — şeffaflık (Not alanında varsa)',
};

// Seçilen (veya boşsa TÜM kayıtlı) rakiplerin özet metnini üretir. parametreler, hangi
// boyutlara odaklanılacağını modele açıkça söyler (ör. sadece sosyal medya, fiyatı hariç tut).
export function rakipOzetOlustur(
	rakipler: { row: { id: string; isim: string; adres: string; not: string; aramaRadiusMeters: string } }[],
	rakipIds: string[],
	parametreler: string[],
): string {
	const secililer = rakipIds.length ? rakipler.filter(({ row }) => rakipIds.includes(row.id)) : rakipler;
	if (!secililer.length) return '(henüz rakip verisi yok)';
	const odaklanilacakParametreler = parametreler.filter((p) => p in ANALIZ_PARAMETRE_ACIKLAMALARI);
	const parametreSatiri = odaklanilacakParametreler.length
		? `Odaklanılacak boyutlar: ${odaklanilacakParametreler.map((p) => ANALIZ_PARAMETRE_ACIKLAMALARI[p]).join('; ')}.\n\n`
		: '';
	const satirlar = secililer.map(({ row }) => {
		const parcalar = [row.isim];
		if (row.adres) parcalar.push(`adres: ${row.adres}`);
		if (row.aramaRadiusMeters) parcalar.push(`yakınlık: ${row.aramaRadiusMeters}m yarıçap içinde bulundu`);
		if (row.not) parcalar.push(`not: ${row.not}`);
		return `- ${parcalar.join(', ')}`;
	});
	return parametreSatiri + satirlar.join('\n');
}

// İçe Aktar (Faz D1) ile eklenen metin kaynaklarını (docx/pptx/epub/txt/md/csv/web linki/yapıştırılan
// metin — pdf'ler burada yok, onlar generateReport'a ayrı bir document content block olarak gidiyor)
// rapor promptuna ekler.
function iceAktarPromptEki(kaynakBelgeler: string[]): string {
	if (!kaynakBelgeler.length) return '';
	return `\n\nİçe aktarılan ek kaynaklar:\n${kaynakBelgeler.map((t, i) => `--- Kaynak ${i + 1} ---\n${t}`).join('\n\n')}`;
}

// POST /panel/rakip-analizi/icerik-strateji { istek, rakipIds?, parametreler? } — seçilen (ya da
// boşsa tüm) rakip verisi + Çiğdem'in serbest metin/ses isteği Claude'a gönderilir, küratif öneri
// raporu üretilir ve kaydedilir.
export async function handleIcerikStrateji(request: Request, env: Env): Promise<Response> {
	let body: { istek?: unknown; rakipIds?: unknown; parametreler?: unknown; kaynakBelgeler?: unknown; kaynakPdfler?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawIstek = String(body.istek ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawIstek) return errorResponse(request, 400, 'İstek metni gerekli.');
	const istek = await cleanDictation(env, rawIstek);
	const rakipIds = Array.isArray(body.rakipIds) ? body.rakipIds.map((x) => String(x)) : [];
	const parametreler = Array.isArray(body.parametreler) ? body.parametreler.map((x) => String(x)) : [];
	const kaynakBelgeler = Array.isArray(body.kaynakBelgeler) ? body.kaynakBelgeler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];
	const kaynakPdfler = Array.isArray(body.kaynakPdfler) ? body.kaynakPdfler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];

	await ensureKullanimKaydiTab(env);
	if (await kotaDolduMu(env, 'icerikStrateji')) {
		return json(
			{ error: 'Bu ayki Görsel/Video Stratejisi kotası doldu. Ay başında sıfırlanır.', limitUrl: ANTHROPIC_BILLING_URL },
			request,
			{ status: 402 },
		);
	}

	await ensureRakipAnaliziTab(env);
	const rakipler = await getAllRakipAnalizRows(env);
	const rakipOzet = rakipOzetOlustur(rakipler, rakipIds, parametreler);
	const userPrompt = `Toplanan rakip verisi:\n${rakipOzet}\n\nÇiğdem'in isteği: ${istek}` + iceAktarPromptEki(kaynakBelgeler);

	let rapor: string;
	try {
		rapor = await generateReport(env, ICERIK_STRATEJI_SYSTEM_PROMPT, userPrompt, kaynakPdfler);
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			return json(
				{ error: 'Anthropic bakiyeniz bitti. Devam etmek için kredi yüklemeniz gerekiyor.', limitUrl: ANTHROPIC_BILLING_URL },
				request,
				{
					status: 402,
				},
			);
		}
		return errorResponse(request, 502, 'Rapor şu an üretilemedi, lütfen tekrar dene.', err);
	}
	await logKullanim(env, 'icerikStrateji', istek.slice(0, 200));

	// Kullanıcı kararı (2026-08-15): raporlar artık RakipAnalizi sekmesine satır olarak
	// eklenmiyor — her "Rapor Üret" tıklaması sayfayı aşağı doğru sonsuza kadar büyütüyordu.
	// Rapor zaten PDF/WhatsApp/e-posta/Paylaş ile dışa aktarılabiliyor (bkz. rakip-analizi.html
	// dalRaporAksiyonlar), Sheet'te ayrıca saklanmasına gerek yok. Kullanım kaydı (yukarıdaki
	// logKullanim) zaten ayrı, sabit büyümeyen bir sekmede tutuluyor.
	return json({ rapor }, request);
}

// Kullanıcı kararı (2026-08-15): İçerik Stratejisi'nin aksine, burada seçilen rakiplerin TAM
// karşılaştırmalı analizi yapılır — randevu/hedef verisiyle birlikte doğrudan rakip kıyası.
export const AKSIYON_ANALIZ_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) iş stratejisti olarak çalışıyorsun.
Sana verilen randevu/gelir verisi, (varsa) seçilen rakiplerin verisi ve Çiğdem'in gözlem/yorumuna
dayanarak haftalık/aylık/3-6-9-12 aylık somut hedefler, bir yol haritası ve atılması gereken
adımları öner. Rakip verisi verilmişse, İçerik Stratejisi analizinin aksine burada rakip rakip
DOĞRUDAN karşılaştırma yapabilirsin (fiyat/konum/sosyal medya aktifliği gibi verilen boyutlarda
Çiğdem'in nerede güçlü/zayıf olduğunu somutça belirt). Eğer önceki bir dönemin hedefi verilmişse,
"neredeydik / ne yaptık / neredeyiz" üçlemesiyle realizasyonu değerlendir; sapma varsa nedenini
analiz edip bir sonraki dönem için düzeltilmiş hedef/yol haritası öner. Türkçe yaz, somut ve
ölçülebilir ol. Sade, gündelik bir dil kullan — pazarlama/iş jargonu, uzun karmaşık cümleler ve
süslü terimlerden kaçın; hiç bu alanda uzman olmayan sıradan bir okuyucunun tek okuyuşta
anlayacağı, kısa cümlelerle yaz.`;

// POST /panel/rakip-analizi/aksiyon-analiz { yorum, rakipIds?, parametreler? } — booking
// Sheet'inden (Sayfa1) otomatik sayısal özet + seçilen (varsa) rakip verisi + Çiğdem'in yazı/ses
// yorumu birlikte Claude'a gönderilir.
export async function handleAksiyonAnaliz(request: Request, env: Env): Promise<Response> {
	let body: { yorum?: unknown; rakipIds?: unknown; parametreler?: unknown; kaynakBelgeler?: unknown; kaynakPdfler?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawYorum = String(body.yorum ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawYorum) return errorResponse(request, 400, 'Yorum metni gerekli.');
	const yorum = await cleanDictation(env, rawYorum);
	const rakipIds = Array.isArray(body.rakipIds) ? body.rakipIds.map((x) => String(x)) : [];
	const parametreler = Array.isArray(body.parametreler) ? body.parametreler.map((x) => String(x)) : [];
	const kaynakBelgeler = Array.isArray(body.kaynakBelgeler) ? body.kaynakBelgeler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];
	const kaynakPdfler = Array.isArray(body.kaynakPdfler) ? body.kaynakPdfler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];

	await ensureKullanimKaydiTab(env);
	if (await kotaDolduMu(env, 'aksiyonAnaliz')) {
		return json({ error: 'Bu ayki Aksiyon/Hedef Analizi kotası doldu. Ay başında sıfırlanır.', limitUrl: ANTHROPIC_BILLING_URL }, request, {
			status: 402,
		});
	}

	const bookingRows = await getAllRows(env);
	const aktifRandevu = bookingRows.filter(({ row }) => !row.cancelledAt).length;
	const iptalRandevu = bookingRows.filter(({ row }) => row.cancelledAt).length;
	const sayisalOzet = `Toplam randevu: ${bookingRows.length}, aktif: ${aktifRandevu}, iptal: ${iptalRandevu}`;

	await ensureRakipAnaliziTab(env);
	const rakipOzet = rakipIds.length ? rakipOzetOlustur(await getAllRakipAnalizRows(env), rakipIds, parametreler) : null;
	const userPrompt =
		`Sayısal özet: ${sayisalOzet}` +
		(rakipOzet ? `\n\nSeçilen rakip verisi:\n${rakipOzet}` : '') +
		`\n\nÇiğdem'in yorumu: ${yorum}` +
		iceAktarPromptEki(kaynakBelgeler);

	let rapor: string;
	try {
		rapor = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt, kaynakPdfler);
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			return json(
				{ error: 'Anthropic bakiyeniz bitti. Devam etmek için kredi yüklemeniz gerekiyor.', limitUrl: ANTHROPIC_BILLING_URL },
				request,
				{
					status: 402,
				},
			);
		}
		return errorResponse(request, 502, 'Analiz şu an üretilemedi, lütfen tekrar dene.', err);
	}
	await logKullanim(env, 'aksiyonAnaliz', yorum.slice(0, 200));

	// Kullanıcı kararı (2026-08-15) — bkz. handleIcerikStrateji'deki aynı not: raporlar artık
	// RakipAnalizi sekmesine satır olarak eklenmiyor, sayfanın sonsuza kadar büyümesine sebep
	// oluyordu.
	return json({ rapor }, request);
}

// POST /panel/rakip-analizi/ice-aktar { tur: 'dosya' | 'link', dosyaAdi?, uzanti?, veri?(base64),
// url? } — Faz D1: pdf/txt/md/docx/csv/pptx/epub + web linki. pdf kasıtlı olarak buraya hiç
// gelmiyor (frontend onu hiç yüklemeden base64'ünü lokalde tutup rapor üretimi anındaki
// kaynakPdfler alanına ekliyor, bkz. rakip-analizi.html dosyaYukle()). Sadece metin döndürür,
// hiçbir şey kaydetmez — kaydetme/rapor üretimi ayrı adımlarda (icerik-strateji/aksiyon-analiz).
export async function handleIceAktar(request: Request, env: Env): Promise<Response> {
	let body: { tur?: unknown; dosyaAdi?: unknown; uzanti?: unknown; veri?: unknown; url?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const tur = String(body.tur ?? '');
	try {
		if (tur === 'link') {
			const url = String(body.url ?? '').trim();
			if (!url) return errorResponse(request, 400, 'Link gerekli.');
			const metin = await metinCikarWebLink(url);
			return json({ metin }, request);
		}
		if (tur === 'dosya') {
			const uzanti = String(body.uzanti ?? '').toLowerCase();
			const veri = String(body.veri ?? '');
			if (!veri) return errorResponse(request, 400, 'Dosya verisi gerekli.');
			const bytes = Uint8Array.from(atob(veri), (c) => c.charCodeAt(0));
			const metin = belgedenMetinCikar(uzanti, bytes);
			return json({ metin }, request);
		}
		return errorResponse(request, 400, 'Geçersiz tür.');
	} catch (err) {
		return errorResponse(request, 400, err instanceof Error ? err.message : 'Belge okunamadı.', err);
	}
}
