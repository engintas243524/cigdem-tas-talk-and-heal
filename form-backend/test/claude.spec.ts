import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateReport, platformTespitiYap } from '../src/lib/claude';

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

describe('platformTespitiYap', () => {
	it('extracts platform names from the web_search response text', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Instagram, Facebook' }] }), { status: 200 })),
		);
		const result = await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		expect(result).toBe('Instagram, Facebook');
	});

	it('returns an empty string when the model finds no platforms', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 })),
		);
		const result = await platformTespitiYap(env, 'Test Klinik', '');
		expect(result).toBe('');
	});

	it('throws a clear error when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('rate limited', { status: 429 })),
		);
		await expect(platformTespitiYap(env, 'Test Klinik', '')).rejects.toThrow(/429/);
	});

	it('sends the web_search tool capped at max_uses 3 and a 512 max_tokens budget', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Instagram' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.max_tokens).toBe(512);
		expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
	});

	it('includes the exact RAKIP_PLATFORM_LISTESI and the business name/address in the request', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.system).toContain('Instagram');
		expect(body.system).toContain('Mastodon');
		expect(body.messages[0].content).toBe('İşletme: Test Klinik (Test Adres)');
	});

	it('omits the parenthesized address when none is given', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', '');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.messages[0].content).toBe('İşletme: Test Klinik');
	});
});
