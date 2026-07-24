// CORS is needed because the booking page (talkandheal.co.uk, a separate static site) calls this
// Worker from the browser. Restrict to the real site + localhost dev instead of '*'.
// The 192.168.1.102 entry is a temporary local-network testing origin (phone on the same Wi-Fi
// hitting Selen's Mac during Phase 3 QA) — safe to remove once no longer needed.
// TEMP (2026-07-23 multi-device test session, revert after): Cloudflare quick tunnel origin for
// the frontend, so phones/other devices/Çiğdem off-LAN can hit this Worker through the tunnel.
const ALLOWED_ORIGINS = [
	'https://talkandheal.co.uk',
	'http://localhost:5173',
	'http://192.168.1.102:5173',
	'https://guam-serial-unlimited-labs.trycloudflare.com',
];

export function corsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get('Origin');
	const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		// Authorization: the Madde 5 panel sends a Bearer token on every /panel/* call.
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};
}

export function json(data: unknown, request: Request, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: { 'Content-Type': 'application/json', ...corsHeaders(request), ...init.headers },
	});
}

// Client-facing errors are intentionally generic — real details go to console/Observability only,
// never into the response (avoids leaking service-account/API internals to callers).
export function errorResponse(request: Request, status: number, publicMessage: string, internalError?: unknown): Response {
	if (internalError !== undefined) {
		console.error(publicMessage, internalError);
	}
	return json({ error: publicMessage }, request, { status });
}
