import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	ilgiOraniHesapla,
	doygunlukTersiHesapla,
	formatUygunluguHesapla,
	konuSkoruHesapla,
	konuHavuzunuSirala,
} from '../src/lib/gorselVideoBulmaSiralama';
import type { YoutubeVideoOzeti } from '../src/lib/youtube';

afterEach(() => vi.unstubAllGlobals());

const SIMDI = new Date('2026-08-17T12:00:00Z');

function video(overrides: Partial<YoutubeVideoOzeti> = {}): YoutubeVideoOzeti {
	return { videoId: 'v', title: 't', publishedAt: '2026-08-10T00:00:00Z', viewCount: 1000, durationSaniye: 60, ...overrides };
}

describe('ilgiOraniHesapla', () => {
	it('güncel hız geçmişin 2 katı veya üstündeyse 1 döner (üst sınırda kırpılır)', () => {
		const guncel = [video({ publishedAt: '2026-08-16T12:00:00Z', viewCount: 10000 })]; // 1 gün, 10000 görüntülenme/gün
		const gecmis = [video({ publishedAt: '2026-08-15T12:00:00Z', viewCount: 1000 })]; // eski pencerede aynı hız birimiyle karşılaştırma
		expect(ilgiOraniHesapla(guncel, gecmis, SIMDI)).toBe(1);
	});

	it('hiç güncel video yoksa 0 döner', () => {
		expect(ilgiOraniHesapla([], [video()], SIMDI)).toBe(0);
	});

	it('geçmiş video yoksa (karşılaştırma imkansız) 0.5 döner', () => {
		expect(ilgiOraniHesapla([video()], [], SIMDI)).toBe(0.5);
	});

	it('sonuç her zaman [0,1] aralığında', () => {
		const guncel = [video({ publishedAt: '2026-08-16T12:00:00Z', viewCount: 1 })];
		const gecmis = [video({ publishedAt: '2026-08-16T11:00:00Z', viewCount: 100000 })];
		const sonuc = ilgiOraniHesapla(guncel, gecmis, SIMDI);
		expect(sonuc).toBeGreaterThanOrEqual(0);
		expect(sonuc).toBeLessThanOrEqual(1);
	});
});

describe('doygunlukTersiHesapla', () => {
	it('0 sonuç -> 1 (hiç doymamış)', () => {
		expect(doygunlukTersiHesapla(0)).toBe(1);
	});
	it('çok yüksek sonuç sayısı -> 0a yakın (doymuş)', () => {
		expect(doygunlukTersiHesapla(100000)).toBeCloseTo(0, 5);
	});
	it('sonuç her zaman [0,1] aralığında', () => {
		expect(doygunlukTersiHesapla(500)).toBeGreaterThanOrEqual(0);
		expect(doygunlukTersiHesapla(500)).toBeLessThanOrEqual(1);
	});
});

describe('formatUygunluguHesapla', () => {
	it('hiç video yoksa 0.5 (belirsiz) döner', () => {
		expect(formatUygunluguHesapla([])).toBe(0.5);
	});
	it('sadece kısa-form video varsa 0.75 döner', () => {
		expect(formatUygunluguHesapla([video({ durationSaniye: 60 }), video({ durationSaniye: 90 })])).toBe(0.75);
	});
	it('sadece uzun-form video varsa 0.35 döner', () => {
		expect(formatUygunluguHesapla([video({ durationSaniye: 600 })])).toBe(0.35);
	});
	it('kısa-form videolar daha çok izleniyorsa skor 0.5in üstünde çıkar', () => {
		const videolar = [video({ durationSaniye: 60, viewCount: 10000 }), video({ durationSaniye: 600, viewCount: 100 })];
		expect(formatUygunluguHesapla(videolar)).toBeGreaterThan(0.5);
	});
});

describe('konuSkoruHesapla', () => {
	it('skor her zaman [0,10] aralığında ve 3 bileşenin ağırlıklı toplamı', () => {
		const guncel = [video({ publishedAt: '2026-08-16T12:00:00Z', viewCount: 5000, durationSaniye: 60 })];
		const gecmis = [video({ publishedAt: '2026-08-16T11:00:00Z', viewCount: 500, durationSaniye: 60 })];
		const sonuc = konuSkoruHesapla('kaygı yönetimi', guncel, gecmis, 200, SIMDI);
		expect(sonuc.konu).toBe('kaygı yönetimi');
		expect(sonuc.skor).toBeGreaterThanOrEqual(0);
		expect(sonuc.skor).toBeLessThanOrEqual(10);
		expect(sonuc.guncelVideoSayisi).toBe(1);
		expect(sonuc.toplamSonucSayisi).toBe(200);
	});
});

describe('konuHavuzunuSirala', () => {
	it('birden fazla konuyu skoruna göre büyükten küçüğe sıralar', async () => {
		const testEnv = { ...env, YOUTUBE_API_KEY: 'test-key' } as typeof env;
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/search?') && url.includes('q=populer+konu')) {
				return new Response(JSON.stringify({ items: [{ id: { videoId: 'v1' } }], pageInfo: { totalResults: 5 } }), { status: 200 });
			}
			if (url.includes('/search?') && url.includes('q=doymus+konu')) {
				return new Response(JSON.stringify({ items: [{ id: { videoId: 'v2' } }], pageInfo: { totalResults: 500000 } }), { status: 200 });
			}
			if (url.includes('/videos?') && url.includes('id=v1')) {
				return new Response(
					JSON.stringify({
						items: [
							{
								id: 'v1',
								snippet: { publishedAt: '2026-08-16T00:00:00Z' },
								statistics: { viewCount: '100000' },
								contentDetails: { duration: 'PT60S' },
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (url.includes('/videos?') && url.includes('id=v2')) {
				return new Response(
					JSON.stringify({
						items: [
							{
								id: 'v2',
								snippet: { publishedAt: '2026-08-16T00:00:00Z' },
								statistics: { viewCount: '10' },
								contentDetails: { duration: 'PT600S' },
							},
						],
					}),
					{ status: 200 },
				);
			}
			throw new Error(`Unexpected fetch in test: ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const sonuclar = await konuHavuzunuSirala(testEnv, ['populer konu', 'doymus konu'], SIMDI);
		expect(sonuclar.map((s) => s.konu)).toEqual(['populer konu', 'doymus konu']);
		expect(sonuclar[0].skor).toBeGreaterThan(sonuclar[1].skor);
	});
});
