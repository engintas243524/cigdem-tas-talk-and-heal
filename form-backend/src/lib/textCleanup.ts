import type { Env } from '../types';

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

// Shared safety net for every text-cleanup helper here: never invent/drop content (a name, a
// diagnosis, a scientific term), and on any model failure or suspicious output, fall back to the
// input unchanged rather than risk storing something that isn't what the person actually wrote —
// same reasoning as summarize.ts's fallback.
async function runCleanup(
	env: Env,
	rawText: string,
	systemPrompt: string,
	examples: { user: string; assistant: string }[],
): Promise<string> {
	const text = rawText.trim();
	if (!text) return text;

	try {
		const result = await env.AI.run(MODEL, {
			messages: [
				{ role: 'system', content: systemPrompt },
				...examples.flatMap((e) => [
					{ role: 'user' as const, content: e.user },
					{ role: 'assistant' as const, content: e.assistant },
				]),
				{ role: 'user', content: text },
			],
			max_tokens: 600,
		});
		const cleaned = (result as { response?: string }).response?.trim();
		if (cleaned && !/^(note|output|text)\s*:/i.test(cleaned)) return cleaned;
		return text;
	} catch (err) {
		console.error('Text cleanup failed, falling back to raw text:', err);
		return text;
	}
}

// Madde 13 (2026-08-11): a therapist's dictated session note, cleaned of hesitation filler
// ("ee", "şey", stutter-repeats) and grammar/punctuation errors — in whichever language (TR/EN)
// it was dictated in. Used by the panel's note-saving flow (routes/panel.ts).
export function cleanDictation(env: Env, rawText: string): Promise<string> {
	return runCleanup(
		env,
		rawText,
		"You clean up a therapist's DICTATED session note. Remove hesitation filler words/sounds " +
			'("ee", "um", "uh", "şey", "yani" used as a filler, stutter-repeats) and fix grammar, ' +
			'spelling and punctuation, in the SAME language the note is written in (Turkish or English). ' +
			'Never remove, add, or reword any actual content — every name, diagnosis, date, symptom or ' +
			'clinical/scientific term must survive exactly as meant, only the filler/errors are removed. ' +
			'If there is nothing to clean, return the note unchanged. Reply with ONLY the cleaned note — ' +
			'no labels, no commentary, no quotes.',
		[
			{
				user: 'Ameliye Brown bu oturumuna gelmedi Eee o nedenle kendisine bir hatırlatma Eee maili mesajı göndermek istiyorum',
				assistant: 'Amelia Brown bu oturumuna gelmedi, o nedenle kendisine bir hatırlatma maili/mesajı göndermek istiyorum.',
			},
		],
	);
}

// New request (2026-08-11): grammar/spelling/punctuation ONLY (no filler removal — this is typed
// or already-coherent dictated prose from the booking form's "what would you like to talk about"
// field, not raw fragmented dictation), auto-detecting whichever language it's written/translated
// in. Used by booking.html's "Metni Düzelt" button AND the post-payment webhook fallback.
export function fixGrammar(env: Env, rawText: string): Promise<string> {
	return runCleanup(
		env,
		rawText,
		'You correct grammar, spelling and punctuation in a short piece of text, in whichever language ' +
			'(Turkish or English) it is written in — auto-detect the language, do not translate. Never ' +
			'change the meaning, context, or any name/diagnosis/scientific term; only fix language errors. ' +
			'If the text is already correct, return it unchanged. Reply with ONLY the corrected text — no ' +
			'labels, no commentary, no quotes.',
		[
			{
				user: 'i have been feeling very anxous lately and cant sleep good',
				assistant: 'I have been feeling very anxious lately and can’t sleep well.',
			},
			{
				user: 'eşimle sürekli tartısıyoruz ve is yerinde de cok yogunum',
				assistant: 'Eşimle sürekli tartışıyoruz ve iş yerinde de çok yoğunum.',
			},
		],
	);
}
