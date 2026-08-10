import type { Env } from '../types';
import { fixGrammar } from '../lib/textCleanup';
import { errorResponse, json } from '../lib/http';

// GET /fix-text?text=... — booking.html's "Metni Düzelt" button. Mirrors routes/translate.ts's
// shape (GET + query param, same CORS handling) since the frontend already has that pattern.
// Language is auto-detected by the model itself — no `sl`/`tl` params needed, this never
// translates, only corrects grammar/spelling/punctuation in whatever language is already there.
export async function handleFixText(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const text = url.searchParams.get('text');
	if (!text) return errorResponse(request, 400, 'text is required');

	const fixed = await fixGrammar(env, text);
	return json({ fixed }, request);
}
