import type { Env } from '../types';

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

// Condenses the client's free-text "what would you like to talk about" note into a short, real
// summary via Cloudflare Workers AI (free tier, no separate API key — same account as the Worker
// itself) before it's stored in Sheets or sent to Selen/Çiğdem. Never blocks the booking cascade:
// on any failure (model error, empty output), falls back to the raw text so a booking is never
// lost over a summarization hiccup.
export async function summarizeNote(env: Env, rawText: string): Promise<string> {
	const text = rawText.trim();
	if (!text) return text;

	try {
		const result = await env.AI.run(MODEL, {
			// Real user/assistant example turns (not text-labeled "Note:"/"Output:" pairs inside one
			// system message) — a small model is far less likely to echo stray formatting/labels back
			// when the examples are shaped exactly like the turn it's about to produce.
			messages: [
				{
					role: 'system',
					content:
						"You condense a therapy client's note into ONE short sentence, in the SAME language it is written in. " +
						'Only ever use details explicitly present in the note — never invent, assume, or add a detail (symptom, ' +
						'person, age, condition) that is not stated. If the note has no real concern (just a greeting/filler), reply ' +
						'with the note itself, unchanged. Reply with ONLY that final text — no labels, no commentary, no quotes.',
				},
				{ role: 'user', content: 'Eşimle son zamanlarda çok tartışıyoruz, uyku sorunum var, işte de yoğun bir dönemdeyim.' },
				{ role: 'assistant', content: 'Eşiyle tartışmalar, uyku sorunu ve iş yoğunluğu yaşıyor.' },
				{ role: 'user', content: 'selam' },
				{ role: 'assistant', content: 'selam' },
				{ role: 'user', content: text },
			],
			max_tokens: 120,
		});
		const summary = (result as { response?: string }).response?.trim();
		// Defensive guard: if the model ever leaks meta-formatting (seen live with ambiguous
		// single-word input) rather than plain output, don't store garbage — fall back to the raw
		// text, same as any other summarization failure.
		if (summary && !/^(note|output)\s*:/i.test(summary)) return summary;
		return text;
	} catch (err) {
		console.error('Note summarization failed, falling back to raw text:', err);
		return text;
	}
}
