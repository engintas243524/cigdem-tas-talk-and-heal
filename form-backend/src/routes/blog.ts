import { errorResponse, json } from '../lib/http';
import { ensureBlogTab, appendBlogRow, updateBlogRow, getAllBlogRows, deleteBlogRows, emptyBlogRow, type BlogRow } from '../lib/blogSheets';
import { normalizeUrl } from '../lib/url';
import { BLOG_CATEGORIES, type BlogCategory } from '../config';
import type { Env } from '../types';

function newId(): string {
	return crypto.randomUUID();
}

// GET /blog-posts — PUBLIC (auth yok, blog.html'in ziyaretçi tarafından çağırılıyor).
// assets/blog-box.js'in beklediği alanlarla birebir eşleşir; id/createdAtUtc döndürmüyoruz
// (events.ts handleEventsListe ile aynı gerekçe — gereksiz iç veri sızdırmamak).
export async function handleBlogListe(request: Request, env: Env): Promise<Response> {
	await ensureBlogTab(env);
	const rows = await getAllBlogRows(env);
	const posts = [...rows]
		.sort((a, b) => b.row.createdAtUtc.localeCompare(a.row.createdAtUtc))
		.map(({ row }) => ({
			category: row.category,
			titleEn: row.titleEn,
			titleTr: row.titleTr,
			bodyEn: row.bodyEn,
			bodyTr: row.bodyTr,
			gorunum: row.gorunum || 'metin',
			gorselUrl: row.gorselUrl,
			videoUrl: row.videoUrl,
		}));
	return json({ posts }, request);
}

// GET /panel/blog-posts — panel içi liste (id dahil, silme/düzenleme için gerekli).
export async function handlePanelBlogListe(request: Request, env: Env): Promise<Response> {
	await ensureBlogTab(env);
	const rows = await getAllBlogRows(env);
	const posts = rows.map(({ row }) => row).sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
	return json({ posts }, request);
}

type BlogAlanlari = Pick<BlogRow, 'category' | 'titleEn' | 'titleTr' | 'bodyEn' | 'bodyTr' | 'gorunum' | 'gorselUrl' | 'videoUrl'>;

const BLOG_GORUNUM_DEGERLERI = ['metin', 'gorsel', 'ikisi'] as const;

// events.ts'teki eventAlanlariniDogrulaVeAyikla ile aynı desen — ekleme/güncelleme aynı
// doğrulamayı paylaşır.
function blogAlanlariniDogrulaVeAyikla(body: Record<string, unknown>): { hata: string } | { alanlar: BlogAlanlari } {
	const category = String(body.category ?? '');
	if (!BLOG_CATEGORIES.includes(category as BlogCategory)) return { hata: 'Geçersiz kategori.' };
	const titleEn = String(body.titleEn ?? '').trim();
	const titleTr = String(body.titleTr ?? '').trim();
	if (!titleEn || !titleTr) return { hata: 'Başlık (EN ve TR) gerekli.' };
	const bodyEn = String(body.bodyEn ?? '').trim();
	const bodyTr = String(body.bodyTr ?? '').trim();
	if (!bodyEn || !bodyTr) return { hata: 'Metin (EN ve TR) gerekli.' };
	const gorunumRaw = String(body.gorunum ?? 'metin');
	const gorunum = (BLOG_GORUNUM_DEGERLERI as readonly string[]).includes(gorunumRaw) ? gorunumRaw : 'metin';
	const gorselUrlRaw = String(body.gorselUrl ?? '').trim();
	if ((gorunum === 'gorsel' || gorunum === 'ikisi') && !gorselUrlRaw) {
		return { hata: 'Bu görünüm için görsel linki gerekli.' };
	}
	const videoUrlRaw = String(body.videoUrl ?? '').trim();
	return {
		alanlar: {
			category,
			titleEn,
			titleTr,
			bodyEn,
			bodyTr,
			gorunum,
			gorselUrl: gorselUrlRaw ? normalizeUrl(gorselUrlRaw) : '',
			videoUrl: videoUrlRaw ? normalizeUrl(videoUrlRaw) : '',
		},
	};
}

// POST /panel/blog-posts { category, titleEn, titleTr, bodyEn, bodyTr, gorunum?, gorselUrl?, videoUrl? }
export async function handlePanelBlogEkle(request: Request, env: Env): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}

	const sonuc = blogAlanlariniDogrulaVeAyikla(body);
	if ('hata' in sonuc) return errorResponse(request, 400, sonuc.hata);

	await ensureBlogTab(env);
	const row = emptyBlogRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	Object.assign(row, sonuc.alanlar);

	const rowNumber = await appendBlogRow(env, row);
	return json({ id: row.id, rowNumber }, request);
}

// POST /panel/blog-posts-guncelle { id, ...alanlar } — Madde 7b'deki (Etkinlikler) aynı
// tıkla-doldur-düzenle deseni blog paneli için de.
export async function handlePanelBlogGuncelle(request: Request, env: Env): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const id = String(body.id ?? '');
	if (!id) return errorResponse(request, 400, 'Yazı id gerekli.');

	const sonuc = blogAlanlariniDogrulaVeAyikla(body);
	if ('hata' in sonuc) return errorResponse(request, 400, sonuc.hata);

	await ensureBlogTab(env);
	const rows = await getAllBlogRows(env);
	const bulunan = rows.find(({ row }) => row.id === id);
	if (!bulunan) return errorResponse(request, 404, 'Yazı bulunamadı.');

	await updateBlogRow(env, bulunan.rowNumber, bulunan.row, sonuc.alanlar);
	return json({ id }, request);
}

// POST /panel/blog-posts-sil { id }
export async function handlePanelBlogSil(request: Request, env: Env): Promise<Response> {
	let body: { id?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const id = String(body.id ?? '');
	if (!id) return errorResponse(request, 400, 'Yazı id gerekli.');

	await ensureBlogTab(env);
	const rows = await getAllBlogRows(env);
	const bulunan = rows.find(({ row }) => row.id === id);
	if (!bulunan) return errorResponse(request, 404, 'Yazı bulunamadı.');

	await deleteBlogRows(env, [bulunan.rowNumber]);
	return json({ deleted: 1 }, request);
}
