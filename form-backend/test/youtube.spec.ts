import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { iso8601SureyiSaniyeyeCevir, konuIcinVideolariGetir } from '../src/lib/youtube';

afterEach(() => vi.unstubAllGlobals());

const testEnv = { ...env, YOUTUBE_API_KEY: 'test-key' } as typeof env;

describe('iso8601SureyiSaniyeyeCevir', () => {
	it('dakika+saniyeyi doğru çevirir', () => {
		expect(iso8601SureyiSaniyeyeCevir('PT1M30S')).toBe(90);
	});
	it('sadece saniyeyi çevirir', () => {
		expect(iso8601SureyiSaniyeyeCevir('PT45S')).toBe(45);
	});
	it('saat+dakika+saniyeyi çevirir', () => {
		expect(iso8601SureyiSaniyeyeCevir('PT2H3M10S')).toBe(2 * 3600 + 3 * 60 + 10);
	});
	it('eşleşmeyen formatta 0 döner', () => {
		expect(iso8601SureyiSaniyeyeCevir('garbage')).toBe(0);
	});
});

describe('konuIcinVideolariGetir', () => {
	function stubFetch(searchItems: { id: { videoId: string } }[], totalResults: number, videos: unknown[]) {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/search?')) {
				return new Response(JSON.stringify({ items: searchItems, pageInfo: { totalResults } }), { status: 200 });
			}
			if (url.includes('/videos?')) {
				return new Response(JSON.stringify({ items: videos }), { status: 200 });
			}
			throw new Error(`Unexpected fetch in test: ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('arama sonuçlarını video istatistikleriyle birleştirir', async () => {
		stubFetch([{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }], 12345, [
			{
				id: 'v1',
				snippet: { title: 'Video 1', publishedAt: '2026-08-01T00:00:00Z' },
				statistics: { viewCount: '1000' },
				contentDetails: { duration: 'PT1M30S' },
			},
			{
				id: 'v2',
				snippet: { title: 'Video 2', publishedAt: '2026-08-05T00:00:00Z' },
				statistics: { viewCount: '2000' },
				contentDetails: { duration: 'PT5M' },
			},
		]);
		const { videolar, toplamSonucSayisi } = await konuIcinVideolariGetir(testEnv, 'kaygı yönetimi', '2026-07-01T00:00:00Z');
		expect(toplamSonucSayisi).toBe(12345);
		expect(videolar).toHaveLength(2);
		expect(videolar[0]).toEqual({
			videoId: 'v1',
			title: 'Video 1',
			publishedAt: '2026-08-01T00:00:00Z',
			viewCount: 1000,
			durationSaniye: 90,
		});
	});

	it('hiç sonuç yoksa boş liste döner, videos.list çağrılmaz', async () => {
		const fetchMock = stubFetch([], 0, []);
		const { videolar } = await konuIcinVideolariGetir(testEnv, 'nadir bir konu', '2026-07-01T00:00:00Z');
		expect(videolar).toEqual([]);
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/videos?'))).toBe(false);
	});

	it('publishedBefore verilirse sorguya eklenir', async () => {
		const fetchMock = stubFetch([], 0, []);
		await konuIcinVideolariGetir(testEnv, 'konu', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
		const searchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/search?'))!;
		expect(String(searchCall[0])).toContain('publishedBefore=');
	});

	it('search.list başarısız olursa hata fırlatır', async () => {
		const fetchMock = vi.fn(async () => new Response('quota exceeded', { status: 403 }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(konuIcinVideolariGetir(testEnv, 'konu', '2026-01-01T00:00:00Z')).rejects.toThrow(/YouTube search.list/);
	});
});
