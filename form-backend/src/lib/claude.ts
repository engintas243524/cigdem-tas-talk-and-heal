import type { Env } from '../types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

// Anthropic'in kendi bakiye kontrolü tetiklendiğinde (400, "credit balance is too low") ayrı bir
// hata tipi fırlatılıyor ki çağıran taraf bunu "üretilemedi, tekrar dene" gibi genel bir hatadan
// ayırt edip kullanıcıya "limit doldu, buradan yükle" mesajını gösterebilsin — canlı bir bakiye
// sorgulama API'si yok (bkz. INTEGRASYON_TODO.md 2026-08-15), o yüzden bu, "bakiye bitti mi"
// sorusunun tek güvenilir cevabı.
export class InsufficientCreditError extends Error {}

// İnce sarmalayıcı — Rakip Analizi'nin dalları (içerik-strateji, aksiyon-analiz, karşılaştırma) aynı
// şekilde bir sistem talimatı + kullanıcı isteği verip düz metin rapor alıyor.
//
// pdfBase64ler (İçe Aktar, Faz D1): PDF'ler burada kendi metnimizi çıkarmadan, Claude'un native
// "document" content block'u olarak doğrudan gönderiliyor — Claude API PDF'i GA olarak destekliyor
// (32MB/600 sayfa sınırı), ayrı bir PDF-parse kütüphanesi eklemeye gerek yok (bkz. lib/belgeCikar.ts
// başındaki not: aynı sebeple docx/pptx/epub kendi metnimizi çıkarıyor, pdf çıkarmıyor).
//
// webSearch (2026-08-16, kullanıcı isteği): Görsel/Video Stratejisi raporu eskiden SADECE modelin
// eğitim verisine (statik, güncel olmayan "ortalama" trend bilgisine) dayanıyordu — kullanıcı bunun
// nişe özel/güncel görsel-video trend tavsiyesi için yetersiz olduğunu haklı olarak belirtti. Native
// web_search tool'u (GA, Sonnet 5'te beta header gerekmiyor) SADECE bunu isteyen çağrılarda (şu an
// icerikStrateji) açılıyor — her rapor türünde açmak gereksiz arama maliyeti (~$0.01/arama) ekler.
// Arama açıkken yanıt BİRDEN FAZLA text bloğuna bölünebiliyor (arama öncesi/arası/sonrası metin) —
// bu yüzden artık İLK text bloğu değil, TÜM text bloklarının birleşimi dönülüyor.
export async function generateReport(
	env: Env,
	systemPrompt: string,
	userPrompt: string,
	pdfBase64ler: string[] = [],
	webSearch = false,
): Promise<string> {
	const content: unknown[] = [{ type: 'text', text: userPrompt }];
	for (const data of pdfBase64ler) {
		content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
	}
	const body: Record<string, unknown> = {
		model: MODEL,
		// webSearch açıkken 4096 riskli — gerçek testte (2026-08-16) dynamic-filtering'li sürümde
		// thinking+arama+rapor toplamı 4096'yı aşıp yanıtı ORTASINDA kesti (stop_reason: max_tokens).
		// 8192'ye çıkarmak basic web_search ile (aşağıdaki not) sorunu tamamen çözdü, tam rapor üretti.
		// webSearch=false dalı (aksiyonAnaliz) da aynı sınıra çekildi (2026-08-24) — 20 parametrenin
		// tamamı dolu bir rakiple gerçek testte RAPOR_YAPISI_TALIMATI'nın istediği "## Bu Ay" gibi
		// zaman ufku bölümlerine hiç ulaşmadan 4096'da kesildiği gözlendi (bkz. proje hafızası
		// project_talk_and_heal_rakip_yorum_analizi). generateReport hiçbir yerde stop_reason'ı
		// kontrol etmiyor (sadece 'refusal' özel işleniyor) — max_tokens'a çarpınca kesik rapor
		// sessizce döner, bu yüzden ÜST SINIRI yükseltmek (fail sonrası retry değil) tek pratik çözüm.
		max_tokens: 8192,
		system: systemPrompt,
		messages: [{ role: 'user', content: pdfBase64ler.length ? content : userPrompt }],
	};
	// web_search_20250305 (basic) — web_search_20260209'un "dynamic filtering" özelliği (kod
	// çalıştırarak sonuçları önceden filtreleme) kendi test verimizde (2026-08-16) input token'ı
	// ~3 KAT şişirdi (66K vs 22K) ve rapor kesilmesine sebep oldu — 2-4 hedefli aramamız için o
	// karmaşıklık gereksiz, basic sürüm aynı sonucu daha ucuz/güvenilir üretiyor. max_uses ile sert
	// üst sınır konuyor (aksi halde model teorik olarak çok daha fazla arama yapabilir, maliyet
	// öngörülebilir kalsın diye).
	if (webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }];
	const response = await fetch(ANTHROPIC_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const bodyText = await response.text();
		if (response.status === 400 && /credit balance is too low/i.test(bodyText)) {
			throw new InsufficientCreditError('Anthropic bakiyesi yetersiz.');
		}
		throw new Error(`Claude API call failed: ${response.status} ${bodyText}`);
	}
	const data = (await response.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
	if (data.stop_reason === 'refusal') {
		throw new Error('Claude bu isteği güvenlik nedeniyle reddetti.');
	}
	const metin = (data.content ?? [])
		.filter((b) => b.type === 'text' && b.text)
		.map((b) => b.text)
		.join('\n\n');
	if (!metin) throw new Error(`Claude API'den metin yanıtı alınamadı: ${JSON.stringify(data)}`);
	return metin;
}
