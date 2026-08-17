import type { Env } from '../types';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

export interface YoutubeVideoOzeti {
	videoId: string;
	title: string;
	publishedAt: string;
	viewCount: number;
	durationSaniye: number;
}

// YouTube'un contentDetails.duration alanı hep ISO 8601 (ör. "PT1M30S", "PT45S", "PT2H3M10S").
// Eşleşmezse (beklenmedik format) 0 döner — çağıran taraf bunu "süre bilinmiyor" olarak ele alır.
export function iso8601SureyiSaniyeyeCevir(durationIso: string): number {
	const eslesme = durationIso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
	if (!eslesme) return 0;
	const [, saat, dakika, saniye] = eslesme;
	return Number(saat ?? 0) * 3600 + Number(dakika ?? 0) * 60 + Number(saniye ?? 0);
}

interface RawSearchItem {
	id?: { videoId?: string };
}
interface RawSearchResponse {
	items?: RawSearchItem[];
	pageInfo?: { totalResults?: number };
}
interface RawVideoItem {
	id?: string;
	snippet?: { title?: string; publishedAt?: string };
	statistics?: { viewCount?: string };
	contentDetails?: { duration?: string };
}
interface RawVideosResponse {
	items?: RawVideoItem[];
}

// videos.list — ids sayısından bağımsız ~1-2 ünite (search.list'in 100 ünitesine kıyasla ihmal
// edilebilir). Tek çağrıda en fazla 50 id kabul ediyor; ARAMA_SONUC_LIMIT bunun altında kalıyor.
async function videoIstatistikleriGetir(env: Env, videoIds: string[]): Promise<YoutubeVideoOzeti[]> {
	if (!videoIds.length) return [];
	const url = `${YOUTUBE_API}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${env.YOUTUBE_API_KEY}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`YouTube videos.list call failed: ${response.status} ${await response.text()}`);
	const data = (await response.json()) as RawVideosResponse;
	return (data.items ?? []).map((v) => ({
		videoId: v.id ?? '',
		title: v.snippet?.title ?? '',
		publishedAt: v.snippet?.publishedAt ?? '',
		viewCount: Number(v.statistics?.viewCount ?? 0),
		durationSaniye: iso8601SureyiSaniyeyeCevir(v.contentDetails?.duration ?? 'PT0S'),
	}));
}

// search.list = 100 ünite (Google'ın sabit fiyatı, döndürülen sonuç sayısından bağımsız) — 25,
// örneklem kalitesi ile ünite maliyeti arasında makul bir denge (günlük 10.000 ünite bütçesinde
// bu tek çağrı ~%1).
const ARAMA_SONUC_LIMIT = 25;

// Bir konuyu belirtilen tarih aralığında (order=viewCount ile o pencerede en çok izlenenler) arar,
// video istatistiklerini (görüntülenme/süre) çeker. lib/gorselVideoBulmaSiralama.ts bunu GÜNCEL ve
// GEÇMİŞ iki ayrı pencere için çağırıp velocity-vs-baseline karşılaştırması yapar (bkz. o dosyanın
// başındaki araştırma referansı).
export async function konuIcinVideolariGetir(
	env: Env,
	konu: string,
	publishedAfterIso: string,
	publishedBeforeIso?: string,
): Promise<{ videolar: YoutubeVideoOzeti[]; toplamSonucSayisi: number }> {
	const params = new URLSearchParams({
		part: 'snippet',
		q: konu,
		type: 'video',
		order: 'viewCount',
		maxResults: String(ARAMA_SONUC_LIMIT),
		publishedAfter: publishedAfterIso,
		key: env.YOUTUBE_API_KEY,
	});
	if (publishedBeforeIso) params.set('publishedBefore', publishedBeforeIso);

	const response = await fetch(`${YOUTUBE_API}/search?${params.toString()}`);
	if (!response.ok) throw new Error(`YouTube search.list call failed: ${response.status} ${await response.text()}`);
	const data = (await response.json()) as RawSearchResponse;
	const videoIds = (data.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id);
	const videolar = await videoIstatistikleriGetir(env, videoIds);
	return { videolar, toplamSonucSayisi: data.pageInfo?.totalResults ?? videolar.length };
}
