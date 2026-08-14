import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateReport } from '../src/lib/claude';

afterEach(() => vi.unstubAllGlobals());

describe('generateReport', () => {
	it('returns the text block from a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Rapor içeriği burada.' }] }), { status: 200 })),
		);
		const result = await generateReport(env, 'sistem talimatı', 'kullanıcı isteği');
		expect(result).toBe('Rapor içeriği burada.');
	});

	it('throws a clear error when Claude refuses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }), { status: 200 })),
		);
		await expect(generateReport(env, 'sistem', 'istek')).rejects.toThrow(/reddetti/);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('rate limited', { status: 429 })),
		);
		await expect(generateReport(env, 'sistem', 'istek')).rejects.toThrow(/429/);
	});
});
