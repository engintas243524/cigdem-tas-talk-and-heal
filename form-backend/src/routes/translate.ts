import type { Env } from '../types';
import { corsHeaders, errorResponse } from '../lib/http';

// Google's keyless "gtx" translate endpoint sends no CORS headers, so a browser
// calling it directly always fails with "Failed to fetch" — this route proxies
// the request server-side (no CORS restriction between two servers) and returns
// the same JSON with our own CORS headers attached.
export async function handleTranslate(request: Request, _env: Env): Promise<Response> {
	const url = new URL(request.url);
	const q = url.searchParams.get('q');
	const sl = url.searchParams.get('sl') || 'auto';
	const tl = url.searchParams.get('tl');
	if (!q || !tl) return errorResponse(request, 400, 'q and tl are required');

	const upstream = new URL('https://translate.googleapis.com/translate_a/single');
	upstream.searchParams.set('client', 'gtx');
	upstream.searchParams.set('dt', 't');
	upstream.searchParams.set('sl', sl);
	upstream.searchParams.set('tl', tl);
	upstream.searchParams.set('q', q);

	const upstreamResponse = await fetch(upstream);
	if (!upstreamResponse.ok) return errorResponse(request, 502, 'Translation service unavailable', await upstreamResponse.text());

	return new Response(upstreamResponse.body, {
		headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
	});
}
