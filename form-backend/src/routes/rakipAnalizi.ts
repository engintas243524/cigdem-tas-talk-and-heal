import { getAllRows } from '../lib/sheets';
import { appendRakipAnalizRow, getAllRakipAnalizRows, emptyRakipAnalizRow, ensureRakipAnaliziTab } from '../lib/rakipSheets';
import { generateReport } from '../lib/claude';
import { searchNearbyCompetitors } from '../lib/places';
import { cleanDictation } from '../lib/textCleanup';
import { errorResponse, json } from '../lib/http';
import type { Env } from '../types';

const NOTE_MAX_LENGTH = 5000;

function newId(): string {
	return crypto.randomUUID();
}

// POST /panel/rakip-analizi/rakip { isim, link?, adres?, not, kaynak: 'manuel' | 'harita' } —
// Çiğdem'in rastgele karşılaştığı bir rakip (manuel) veya harita aramasından seçtiği bir sonuç
// (harita), üzerine eklediği yazı/ses notuyla birlikte RakipAnalizi sekmesine kaydedilir.
export async function handleRakipEkle(request: Request, env: Env): Promise<Response> {
	let body: { isim?: unknown; link?: unknown; adres?: unknown; not?: unknown; kaynak?: unknown };
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
	const rowNumber = await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rowNumber }, request);
}

// GET /panel/rakip-analizi/rakip-ara?lat=&lng=&radiusMeters= — konum+yarıçap bazlı harita
// araması. API key sızmasın diye backend proxy'liyor, sonuçlar doğrudan frontend'in haritaya
// pin basması için kullanılır (kaydetme ayrı bir handleRakipEkle çağrısı — Çiğdem hangi
// sonuçları seçtiğine karar verdikten sonra).
export async function handleRakipAra(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	const radiusMeters = Number(url.searchParams.get('radiusMeters'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
		return errorResponse(request, 400, 'Geçersiz konum/yarıçap.');
	}
	try {
		const places = await searchNearbyCompetitors(env, lat, lng, radiusMeters);
		return json({ places }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Harita şu an yüklenemedi, manuel giriş yapabilirsin.', err);
	}
}

// Görsel/video stratejisi için sistem talimatı — rakip içeriği KOPYALANMAZ, sadece stratejiden
// (format/sıklık/platform) ilham alınır; küratif yaklaşımın kod-seviyesindeki karşılığı bu.
const ICERIK_STRATEJI_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) sosyal medya içerik stratejisti olarak çalışıyorsun.
Sana verilen rakip verisini analiz ederek, o rakiplerin içeriklerini ASLA kopyalamadan, sadece
stratejilerinden (hangi platformda, ne sıklıkla, hangi format/konu daha çok etkileşim alıyor)
ilham alarak Talk and Heal için ORİJİNAL, telifsiz-stok veya AI-üretilmiş içerik önerileri sun.
Türkçe yaz, somut ve uygulanabilir öneriler ver.`;

// POST /panel/rakip-analizi/icerik-strateji { istek } — toplanan tüm rakip verisi + Çiğdem'in
// serbest metin/ses isteği Claude'a gönderilir, küratif öneri raporu üretilir ve kaydedilir.
export async function handleIcerikStrateji(request: Request, env: Env): Promise<Response> {
	let body: { istek?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawIstek = String(body.istek ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawIstek) return errorResponse(request, 400, 'İstek metni gerekli.');
	const istek = await cleanDictation(env, rawIstek);

	await ensureRakipAnaliziTab(env);
	const rakipler = await getAllRakipAnalizRows(env);
	const rakipOzet = rakipler
		.map(({ row }) => `- ${row.isim}${row.adres ? ` (${row.adres})` : ''}${row.not ? `: ${row.not}` : ''}`)
		.join('\n');
	const userPrompt = `Toplanan rakip verisi:\n${rakipOzet || '(henüz rakip verisi yok)'}\n\nÇiğdem'in isteği: ${istek}`;

	let rapor: string;
	try {
		rapor = await generateReport(env, ICERIK_STRATEJI_SYSTEM_PROMPT, userPrompt);
	} catch (err) {
		return errorResponse(request, 502, 'Rapor şu an üretilemedi, lütfen tekrar dene.', err);
	}

	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = 'rapor';
	row.dal = 'icerikStrateji';
	row.not = istek;
	row.raporMetni = rapor;
	await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rapor }, request);
}

const AKSIYON_ANALIZ_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) iş stratejisti olarak çalışıyorsun.
Sana verilen randevu/gelir verisi ve Çiğdem'in gözlem/yorumuna dayanarak haftalık/aylık/
3-6-9-12 aylık somut hedefler, bir yol haritası ve atılması gereken adımları öner. Eğer
önceki bir dönemin hedefi verilmişse, "neredeydik / ne yaptık / neredeyiz" üçlemesiyle
realizasyonu değerlendir; sapma varsa nedenini analiz edip bir sonraki dönem için
düzeltilmiş hedef/yol haritası öner. Türkçe yaz, somut ve ölçülebilir ol.`;

// POST /panel/rakip-analizi/aksiyon-analiz { yorum } — booking Sheet'inden (Sayfa1) otomatik
// sayısal özet + Çiğdem'in yazı/ses yorumu birlikte Claude'a gönderilir.
export async function handleAksiyonAnaliz(request: Request, env: Env): Promise<Response> {
	let body: { yorum?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawYorum = String(body.yorum ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawYorum) return errorResponse(request, 400, 'Yorum metni gerekli.');
	const yorum = await cleanDictation(env, rawYorum);

	const bookingRows = await getAllRows(env);
	const aktifRandevu = bookingRows.filter(({ row }) => !row.cancelledAt).length;
	const iptalRandevu = bookingRows.filter(({ row }) => row.cancelledAt).length;
	const sayisalOzet = `Toplam randevu: ${bookingRows.length}, aktif: ${aktifRandevu}, iptal: ${iptalRandevu}`;
	const userPrompt = `Sayısal özet: ${sayisalOzet}\n\nÇiğdem'in yorumu: ${yorum}`;

	let rapor: string;
	try {
		rapor = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt);
	} catch (err) {
		return errorResponse(request, 502, 'Analiz şu an üretilemedi, lütfen tekrar dene.', err);
	}

	await ensureRakipAnaliziTab(env);
	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = 'rapor';
	row.dal = 'aksiyonAnaliz';
	row.not = yorum;
	row.raporMetni = rapor;
	await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rapor }, request);
}
