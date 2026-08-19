import { errorResponse, json } from '../lib/http';
import {
	ensureEventsTab,
	appendEventRow,
	updateEventRow,
	getAllEventRows,
	deleteEventRows,
	emptyEventRow,
	type EventRow,
} from '../lib/eventsSheets';
import { normalizeUrl } from '../lib/url';
import { EVENTS_CATEGORIES, type EventCategory } from '../config';
import type { Env } from '../types';

function newId(): string {
	return crypto.randomUUID();
}

// GET /events — PUBLIC (auth yok, index.html/services.html'in ziyaretçi tarafından çağırılıyor).
// events-box.js'in beklediği alanlarla birebir eşleşir; id/createdAtUtc döndürmüyoruz (sitede
// gösterilecek hiçbir alanda kullanılmıyor, gereksiz iç veri sızdırmamak için).
export async function handleEventsListe(request: Request, env: Env): Promise<Response> {
	await ensureEventsTab(env);
	const rows = await getAllEventRows(env);
	const events = rows
		.map(({ row }) => ({
			category: row.category,
			titleEn: row.titleEn,
			titleTr: row.titleTr,
			dateTimeEn: row.dateTimeEn,
			dateTimeTr: row.dateTimeTr,
			formatEn: row.formatEn,
			formatTr: row.formatTr,
			descriptionEn: row.descriptionEn,
			descriptionTr: row.descriptionTr,
			ctaLabelEn: row.ctaLabelEn,
			ctaLabelTr: row.ctaLabelTr,
			ctaHref: row.ctaHref,
			// Eski satırlarda (Madde 6 öncesi) bu kolon boş olabilir — 'metin' varsayılanı geriye
			// dönük uyumluluk için (events-box.js bunu 'metin' gibi davranıyor zaten, ama açıkça
			// döndürmek daha sağlam).
			gorunum: row.gorunum || 'metin',
			gorselUrl: row.gorselUrl,
		}))
		.sort((a, b) => a.dateTimeEn.localeCompare(b.dateTimeEn));
	return json({ events }, request);
}

// GET /panel/events — panel içi liste (id dahil, silme butonları için gerekli).
export async function handlePanelEventsListe(request: Request, env: Env): Promise<Response> {
	await ensureEventsTab(env);
	const rows = await getAllEventRows(env);
	const events = rows.map(({ row }) => row).sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
	return json({ events }, request);
}

type EventAlanlari = Pick<
	EventRow,
	| 'category'
	| 'titleEn'
	| 'titleTr'
	| 'dateTimeEn'
	| 'dateTimeTr'
	| 'formatEn'
	| 'formatTr'
	| 'descriptionEn'
	| 'descriptionTr'
	| 'ctaLabelEn'
	| 'ctaLabelTr'
	| 'ctaHref'
	| 'gorunum'
	| 'gorselUrl'
>;

const EVENT_GORUNUM_DEGERLERI = ['metin', 'gorsel', 'ikisi'] as const;

// Hem ekleme hem güncelleme aynı alan setini/doğrulamasını paylaşıyor (2026-08-19) — iki ayrı
// yerde birbirinden sapabilecek doğrulama mantığı tutmamak için tek fonksiyon.
function eventAlanlariniDogrulaVeAyikla(body: Record<string, unknown>): { hata: string } | { alanlar: EventAlanlari } {
	const category = String(body.category ?? '');
	if (!EVENTS_CATEGORIES.includes(category as EventCategory)) return { hata: 'Geçersiz kategori.' };
	const titleEn = String(body.titleEn ?? '').trim();
	const titleTr = String(body.titleTr ?? '').trim();
	if (!titleEn || !titleTr) return { hata: 'Başlık (EN ve TR) gerekli.' };
	const ctaHrefRaw = String(body.ctaHref ?? '').trim();
	if (!ctaHrefRaw) return { hata: 'Buton linki gerekli.' };
	const gorunumRaw = String(body.gorunum ?? 'metin');
	const gorunum = (EVENT_GORUNUM_DEGERLERI as readonly string[]).includes(gorunumRaw) ? gorunumRaw : 'metin';
	const gorselUrlRaw = String(body.gorselUrl ?? '').trim();
	if ((gorunum === 'gorsel' || gorunum === 'ikisi') && !gorselUrlRaw) {
		return { hata: 'Bu görünüm için görsel linki gerekli.' };
	}
	return {
		alanlar: {
			category,
			titleEn,
			titleTr,
			dateTimeEn: String(body.dateTimeEn ?? '').trim(),
			dateTimeTr: String(body.dateTimeTr ?? '').trim(),
			formatEn: String(body.formatEn ?? '').trim(),
			formatTr: String(body.formatTr ?? '').trim(),
			descriptionEn: String(body.descriptionEn ?? '').trim(),
			descriptionTr: String(body.descriptionTr ?? '').trim(),
			ctaLabelEn: String(body.ctaLabelEn ?? '').trim(),
			ctaLabelTr: String(body.ctaLabelTr ?? '').trim(),
			ctaHref: normalizeUrl(ctaHrefRaw),
			gorunum,
			gorselUrl: gorselUrlRaw ? normalizeUrl(gorselUrlRaw) : '',
		},
	};
}

// POST /panel/events { category, titleEn, titleTr, dateTimeEn, dateTimeTr, formatEn, formatTr,
// descriptionEn, descriptionTr, ctaLabelEn, ctaLabelTr, ctaHref }
export async function handlePanelEventEkle(request: Request, env: Env): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}

	const sonuc = eventAlanlariniDogrulaVeAyikla(body);
	if ('hata' in sonuc) return errorResponse(request, 400, sonuc.hata);

	await ensureEventsTab(env);
	const row = emptyEventRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	Object.assign(row, sonuc.alanlar);

	const rowNumber = await appendEventRow(env, row);
	return json({ id: row.id, rowNumber }, request);
}

// POST /panel/events-guncelle { id, category, titleEn, titleTr, dateTimeEn, dateTimeTr, formatEn,
// formatTr, descriptionEn, descriptionTr, ctaLabelEn, ctaLabelTr, ctaHref } — panelde kayıtlı bir
// etkinliğe tıklayınca formu doldurup düzenleyebilme (2026-08-19, kullanıcı isteği, Madde 7b).
export async function handlePanelEventGuncelle(request: Request, env: Env): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const id = String(body.id ?? '');
	if (!id) return errorResponse(request, 400, 'Etkinlik id gerekli.');

	const sonuc = eventAlanlariniDogrulaVeAyikla(body);
	if ('hata' in sonuc) return errorResponse(request, 400, sonuc.hata);

	await ensureEventsTab(env);
	const rows = await getAllEventRows(env);
	const bulunan = rows.find(({ row }) => row.id === id);
	if (!bulunan) return errorResponse(request, 404, 'Etkinlik bulunamadı.');

	await updateEventRow(env, bulunan.rowNumber, bulunan.row, sonuc.alanlar);
	return json({ id }, request);
}

// POST /panel/events-sil { id }
export async function handlePanelEventSil(request: Request, env: Env): Promise<Response> {
	let body: { id?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const id = String(body.id ?? '');
	if (!id) return errorResponse(request, 400, 'Etkinlik id gerekli.');

	await ensureEventsTab(env);
	const rows = await getAllEventRows(env);
	const bulunan = rows.find(({ row }) => row.id === id);
	if (!bulunan) return errorResponse(request, 404, 'Etkinlik bulunamadı.');

	await deleteEventRows(env, [bulunan.rowNumber]);
	return json({ deleted: 1 }, request);
}
