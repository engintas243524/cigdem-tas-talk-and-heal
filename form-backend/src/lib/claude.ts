import type { Env } from '../types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

// İnce sarmalayıcı — Rakip Analizi'nin iki dalı (içerik-strateji, aksiyon-analiz) da aynı
// şekilde bir sistem talimatı + kullanıcı isteği verip düz metin rapor alıyor, ekstra
// (tool use, streaming vb.) bir şey gerekmiyor.
export async function generateReport(env: Env, systemPrompt: string, userPrompt: string): Promise<string> {
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
			messages: [{ role: 'user', content: userPrompt }],
		}),
	});
	if (!response.ok) {
		throw new Error(`Claude API call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
	if (data.stop_reason === 'refusal') {
		throw new Error('Claude bu isteği güvenlik nedeniyle reddetti.');
	}
	const textBlock = data.content?.find((b) => b.type === 'text');
	if (!textBlock?.text) throw new Error(`Claude API'den metin yanıtı alınamadı: ${JSON.stringify(data)}`);
	return textBlock.text;
}
