import { errorResponse, json } from '../lib/http';
import { medyaYukle, MedyaYuklemeHatasi } from '../lib/media';
import type { Env } from '../types';

// POST /panel/medya-yukle { veri (base64), mimeType } — Blog/Etkinlik panellerindeki "cihazdan
// yükle" akışı; index.ts'te requirePanelAuth ile korunuyor.
export async function handlePanelMedyaYukle(request: Request, env: Env): Promise<Response> {
	let body: { veri?: unknown; mimeType?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const veri = String(body.veri ?? '');
	const mimeType = String(body.mimeType ?? '');
	if (!veri || !mimeType) return errorResponse(request, 400, 'Görsel verisi gerekli.');

	try {
		const { url } = await medyaYukle(env, veri, mimeType);
		return json({ url }, request);
	} catch (err) {
		if (err instanceof MedyaYuklemeHatasi) return errorResponse(request, 400, err.message);
		return errorResponse(request, 502, 'Yüklenemedi, tekrar deneyin.', err);
	}
}

// GET /media/:key — PUBLIC, blog.html/index.html'deki <img> src'i doğrudan buraya işaret eder.
// index.ts'in flat METHOD-path switch'i tam eşleşme beklediği için, bu tek route değişken path
// segmenti (key) yüzünden switch'e girmeden ÖNCE ayrı bir prefix kontrolüyle çağrılıyor
// (bkz. index.ts'teki "GET /media/" notu).
export async function handleMedyaServis(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const key = url.pathname.slice('/media/'.length);
	if (!key || key.includes('/')) return new Response('Not Found', { status: 404 });

	const object = await env.MEDIA_BUCKET.get(key);
	if (!object) return new Response('Not Found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	// Anahtar rastgele UUID, içerik hiç değişmez — sonsuz/immutable cache güvenli.
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('access-control-allow-origin', '*');
	return new Response(object.body, { headers });
}
