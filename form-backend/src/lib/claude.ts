import type { Env } from '../types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

// Anthropic'in kendi bakiye kontrolü tetiklendiğinde (400, "credit balance is too low") ayrı bir
// hata tipi fırlatılıyor ki çağıran taraf bunu "üretilemedi, tekrar dene" gibi genel bir hatadan
// ayırt edip kullanıcıya "limit doldu, buradan yükle" mesajını gösterebilsin — canlı bir bakiye
// sorgulama API'si yok (bkz. INTEGRASYON_TODO.md 2026-08-15), o yüzden bu, "bakiye bitti mi"
// sorusunun tek güvenilir cevabı.
export class InsufficientCreditError extends Error {}

// İnce sarmalayıcı — Rakip Analizi'nin iki dalı (içerik-strateji, aksiyon-analiz) da aynı
// şekilde bir sistem talimatı + kullanıcı isteği verip düz metin rapor alıyor, ekstra
// (tool use, streaming vb.) bir şey gerekmiyor.
//
// pdfBase64ler (İçe Aktar, Faz D1): PDF'ler burada kendi metnimizi çıkarmadan, Claude'un native
// "document" content block'u olarak doğrudan gönderiliyor — Claude API PDF'i GA olarak destekliyor
// (32MB/600 sayfa sınırı), ayrı bir PDF-parse kütüphanesi eklemeye gerek yok (bkz. lib/belgeCikar.ts
// başındaki not: aynı sebeple docx/pptx/epub kendi metnimizi çıkarıyor, pdf çıkarmıyor).
export async function generateReport(env: Env, systemPrompt: string, userPrompt: string, pdfBase64ler: string[] = []): Promise<string> {
	const content: unknown[] = [{ type: 'text', text: userPrompt }];
	for (const data of pdfBase64ler) {
		content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
	}
	const response = await fetch(ANTHROPIC_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 4096,
			system: systemPrompt,
			messages: [{ role: 'user', content: pdfBase64ler.length ? content : userPrompt }],
		}),
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
	const textBlock = data.content?.find((b) => b.type === 'text');
	if (!textBlock?.text) throw new Error(`Claude API'den metin yanıtı alınamadı: ${JSON.stringify(data)}`);
	return textBlock.text;
}
