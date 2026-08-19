import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

afterEach(() => vi.unstubAllGlobals());

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
} as typeof env;

// events.spec.ts'teki stubApis ile aynı desen (BlogYazilari sekmesi için).
function stubApis() {
	const sheetsAppended: string[][] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'BlogYazilari', gridProperties: { columnCount: 20 } } }] }),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) {
			const body = init?.body ? JSON.parse(init.body as string) : {};
			for (const req of body.requests ?? []) {
				if (req.deleteDimension) {
					const arrIndex = req.deleteDimension.range.startIndex - 1;
					if (arrIndex >= 0 && arrIndex < sheetsAppended.length) sheetsAppended.splice(arrIndex, 1);
				}
			}
			return new Response('{}', { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			sheetsAppended.push(body.values[0]);
			return new Response(
				JSON.stringify({ updates: { updatedRange: `BlogYazilari!A${sheetsAppended.length + 1}:N${sheetsAppended.length + 1}` } }),
				{ status: 200 },
			);
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: sheetsAppended }), { status: 200 });
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { sheetsAppended, fetchMock };
}

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

const samplePayload = {
	category: 'thought-pieces',
	titleEn: 'A Thought Piece',
	titleTr: 'Bir Düşünce Yazısı',
	bodyEn: 'Some body text.',
	bodyTr: 'Bir metin.',
};

describe('POST /panel/blog-posts', () => {
	it('saves a new post', async () => {
		stubApis();
		const response = await authedRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify(samplePayload) });
		expect(response.status).toBe(200);
		const data = (await response.json()) as { id: string };
		expect(data.id).toBeTruthy();
	});

	it('rejects an invalid category', async () => {
		stubApis();
		const response = await authedRequest('/panel/blog-posts', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, category: 'all' }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects missing body text', async () => {
		stubApis();
		const response = await authedRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify({ ...samplePayload, bodyTr: '' }) });
		expect(response.status).toBe(400);
	});

	it('rejects gorunum: gorsel without gorselUrl', async () => {
		stubApis();
		const response = await authedRequest('/panel/blog-posts', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, gorunum: 'gorsel' }),
		});
		expect(response.status).toBe(400);
	});

	it('normalizes a scheme-less gorselUrl/videoUrl', async () => {
		stubApis();
		await authedRequest('/panel/blog-posts', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, gorunum: 'ikisi', gorselUrl: 'cdn.example.com/a.jpg', videoUrl: 'youtu.be/xyz' }),
		});
		const listResponse = await plainRequest('/blog-posts');
		const data = (await listResponse.json()) as { posts: { gorselUrl: string; videoUrl: string }[] };
		expect(data.posts[0].gorselUrl).toBe('https://cdn.example.com/a.jpg');
		expect(data.posts[0].videoUrl).toBe('https://youtu.be/xyz');
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const response = await plainRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify(samplePayload) });
		expect(response.status).toBe(401);
	});
});

describe('GET /blog-posts (public)', () => {
	it('lists posts without requiring auth, omitting internal fields', async () => {
		stubApis();
		await authedRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify(samplePayload) });
		const response = await plainRequest('/blog-posts');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { posts: Record<string, unknown>[] };
		expect(data.posts).toHaveLength(1);
		expect(data.posts[0].titleEn).toBe('A Thought Piece');
		expect(data.posts[0].id).toBeUndefined();
	});
});

describe('POST /panel/blog-posts-guncelle', () => {
	it('updates an existing post by id', async () => {
		stubApis();
		const created = await authedRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify(samplePayload) });
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/blog-posts-guncelle', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, id, titleEn: 'Updated' }),
		});
		expect(response.status).toBe(200);
	});

	it('404s for an unknown id', async () => {
		stubApis();
		const response = await authedRequest('/panel/blog-posts-guncelle', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, id: 'nope' }),
		});
		expect(response.status).toBe(404);
	});
});

describe('POST /panel/blog-posts-sil', () => {
	it('deletes the selected post, leaving others intact', async () => {
		stubApis();
		await authedRequest('/panel/blog-posts', { method: 'POST', body: JSON.stringify(samplePayload) });
		const second = await authedRequest('/panel/blog-posts', {
			method: 'POST',
			body: JSON.stringify({ ...samplePayload, titleEn: 'Second Post' }),
		});
		const secondId = ((await second.json()) as { id: string }).id;

		const del = await authedRequest('/panel/blog-posts-sil', { method: 'POST', body: JSON.stringify({ id: secondId }) });
		expect(del.status).toBe(200);

		const listResponse = await plainRequest('/blog-posts');
		const data = (await listResponse.json()) as { posts: Record<string, unknown>[] };
		expect(data.posts).toHaveLength(1);
		expect(data.posts[0].titleEn).toBe('A Thought Piece');
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const response = await plainRequest('/panel/blog-posts-sil', { method: 'POST', body: JSON.stringify({ id: 'x' }) });
		expect(response.status).toBe(401);
	});
});
