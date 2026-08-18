import { errorResponse, json } from '../lib/http';
import { ensureEventsTab, appendEventRow, getAllEventRows, deleteEventRows, emptyEventRow } from '../lib/eventsSheets';
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

// POST /panel/events { category, titleEn, titleTr, dateTimeEn, dateTimeTr, formatEn, formatTr,
// descriptionEn, descriptionTr, ctaLabelEn, ctaLabelTr, ctaHref }
export async function handlePanelEventEkle(request: Request, env: Env): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}

	const category = String(body.category ?? '');
	if (!EVENTS_CATEGORIES.includes(category as EventCategory)) {
		return errorResponse(request, 400, 'Geçersiz kategori.');
	}
	const titleEn = String(body.titleEn ?? '').trim();
	const titleTr = String(body.titleTr ?? '').trim();
	if (!titleEn || !titleTr) return errorResponse(request, 400, 'Başlık (EN ve TR) gerekli.');
	const ctaHref = String(body.ctaHref ?? '').trim();
	if (!ctaHref) return errorResponse(request, 400, 'Buton linki gerekli.');

	await ensureEventsTab(env);
	const row = emptyEventRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.category = category;
	row.titleEn = titleEn;
	row.titleTr = titleTr;
	row.dateTimeEn = String(body.dateTimeEn ?? '').trim();
	row.dateTimeTr = String(body.dateTimeTr ?? '').trim();
	row.formatEn = String(body.formatEn ?? '').trim();
	row.formatTr = String(body.formatTr ?? '').trim();
	row.descriptionEn = String(body.descriptionEn ?? '').trim();
	row.descriptionTr = String(body.descriptionTr ?? '').trim();
	row.ctaLabelEn = String(body.ctaLabelEn ?? '').trim();
	row.ctaLabelTr = String(body.ctaLabelTr ?? '').trim();
	row.ctaHref = ctaHref;

	const rowNumber = await appendEventRow(env, row);
	return json({ id: row.id, rowNumber }, request);
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
