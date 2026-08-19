import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
} as typeof env;

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function plainRequest(path: string, init: RequestInit = {}) {
	const request = new Request(`http://localhost${path}`, init);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

// 1x1 transparent PNG, valid minimal file.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('POST /panel/medya-yukle', () => {
	it('uploads a PNG to R2 and returns a fetchable URL', async () => {
		const upload = await authedRequest('/panel/medya-yukle', {
			method: 'POST',
			body: JSON.stringify({ veri: TINY_PNG_BASE64, mimeType: 'image/png' }),
		});
		expect(upload.status).toBe(200);
		const data = (await upload.json()) as { url: string };
		expect(data.url).toMatch(/^https:\/\/form-backend\.engintass19-358\.workers\.dev\/media\/[a-f0-9-]+\.png$/);

		const key = data.url.split('/media/')[1];
		const served = await plainRequest('/media/' + key);
		expect(served.status).toBe(200);
		expect(served.headers.get('content-type')).toBe('image/png');
		expect(served.headers.get('cache-control')).toContain('immutable');
		// R2 object body'sini tüketmeden bırakmak vitest-pool-workers'ın izole storage
		// snapshot'ını kapatamamasına yol açıyor (bkz. Cloudflare'in bilinen sorun kaydı) —
		// test sonunda stream mutlaka tüketilmeli.
		await served.arrayBuffer();
	});

	it('rejects an unsupported mime type', async () => {
		const response = await authedRequest('/panel/medya-yukle', {
			method: 'POST',
			body: JSON.stringify({ veri: TINY_PNG_BASE64, mimeType: 'video/mp4' }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects a file over the 8MB cap', async () => {
		const bigBase64 = 'A'.repeat(12 * 1024 * 1024); // base64 çıktısı da orantılı büyük, gerçek bayt sınırını tetikler
		const response = await authedRequest('/panel/medya-yukle', {
			method: 'POST',
			body: JSON.stringify({ veri: bigBase64, mimeType: 'image/png' }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects requests without a valid panel token', async () => {
		const response = await plainRequest('/panel/medya-yukle', {
			method: 'POST',
			body: JSON.stringify({ veri: TINY_PNG_BASE64, mimeType: 'image/png' }),
		});
		expect(response.status).toBe(401);
	});
});

describe('GET /media/:key', () => {
	it('404s for an unknown key', async () => {
		const response = await plainRequest('/media/does-not-exist.png');
		expect(response.status).toBe(404);
	});

	it('404s for a key containing a nested path segment', async () => {
		const response = await plainRequest('/media/some/nested/key.png');
		expect(response.status).toBe(404);
	});
});
