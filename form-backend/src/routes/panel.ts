import { MAX_SESSION_COUNT, getSessionMinutes, type SessionType } from '../config';
import { signPanelToken, isPanelAuthorized } from '../lib/panel-auth';
import { findRowBySessionId, getRow, getAllRows, writeCellMirrored } from '../lib/sheets';
import { sessionFields, bookedSessionIndexes, nextBookedSession, closeOutSessionNote } from '../lib/notes';
import { errorResponse, json } from '../lib/http';
import type { Env, SheetRow } from '../types';

// A note is Çiğdem's own (authenticated) dictation — a generous cap purely to bound a runaway
// paste; Sheets itself allows far more.
const NOTE_MAX_LENGTH = 5000;

// Everything the panel needs to render one session's note box + button states. `submitted` is what
// greys out "Ekle" (its guard is set); `isLastSession` decides the confirm-dialog wording and
// whether "Ekle" will notify the client.
function sessionContext(row: SheetRow, index: number) {
	const { startUtcField, noteField, guardField } = sessionFields(index);
	const next = nextBookedSession(row, index);
	return {
		stripeSessionId: row.stripeSessionId,
		sessionIndex: index,
		name: row.name,
		appointmentStartUtc: row[startUtcField],
		clientTimeZone: row.clientTimeZone,
		note: row[noteField],
		submitted: Boolean(row[guardField]),
		isLastSession: !next,
		nextAppointmentStartUtc: next?.startUtc ?? '',
	};
}

async function loadRow(env: Env, stripeSessionId: string): Promise<{ rowNumber: number; row: SheetRow } | null> {
	const rowNumber = await findRowBySessionId(env, stripeSessionId);
	if (rowNumber === null) return null;
	return { rowNumber, row: await getRow(env, rowNumber) };
}

// POST /panel/login { password } — plain compare against the single shared PANEL_PASSWORD, returns
// a signed, time-limited token on success. One therapist, one password: no user table needed.
export async function handlePanelLogin(request: Request, env: Env): Promise<Response> {
	let body: { password?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	if (String(body.password ?? '') !== env.PANEL_PASSWORD) {
		return errorResponse(request, 401, 'Parola hatalı.');
	}
	return json({ token: await signPanelToken(env) }, request);
}

// GET /panel/pending — the panel's default context: the most recent session that is already over
// (start + duration in the past) but not yet closed out. Null when there's nothing waiting.
export async function handlePanelPending(request: Request, env: Env): Promise<Response> {
	const rows = await getAllRows(env);
	const now = Date.now();
	let best: { row: SheetRow; index: number; start: string } | null = null;

	for (const { row } of rows) {
		if (row.cancelledAt) continue;
		const minutes = getSessionMinutes(row.sessionType as SessionType) || 0;
		for (const index of bookedSessionIndexes(row)) {
			const { startUtcField, guardField } = sessionFields(index);
			if (row[guardField]) continue; // already closed
			const end = new Date(row[startUtcField]).getTime() + minutes * 60_000;
			if (end >= now) continue; // not finished yet
			if (!best || row[startUtcField] > best.start) best = { row, index, start: row[startUtcField] };
		}
	}

	return json({ pending: best ? sessionContext(best.row, best.index) : null }, request);
}

// GET /panel/clients — every booking, alphabetical by name, each with its bookable sessions and
// whether each is already closed. Small dataset: search/scroll happen client-side.
export async function handlePanelClients(request: Request, env: Env): Promise<Response> {
	const rows = await getAllRows(env);
	const clients = rows
		.filter(({ row }) => row.name)
		.map(({ row }) => ({
			stripeSessionId: row.stripeSessionId,
			name: row.name,
			cancelled: Boolean(row.cancelledAt),
			sessions: bookedSessionIndexes(row).map((index) => {
				const { startUtcField, guardField } = sessionFields(index);
				return { sessionIndex: index, startUtc: row[startUtcField], submitted: Boolean(row[guardField]) };
			}),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
	return json({ clients }, request);
}

// GET /panel/note?stripeSessionId=&sessionIndex= — one session's current note + full context.
export async function handlePanelNoteGet(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const stripeSessionId = url.searchParams.get('stripeSessionId') ?? '';
	const index = Number(url.searchParams.get('sessionIndex'));
	if (!stripeSessionId || !Number.isInteger(index) || index < 1 || index > MAX_SESSION_COUNT) {
		return errorResponse(request, 400, 'Geçersiz seans bilgisi.');
	}
	const found = await loadRow(env, stripeSessionId);
	if (!found) return errorResponse(request, 404, 'Kayıt bulunamadı.');
	return json({ context: sessionContext(found.row, index) }, request);
}

// POST /panel/note { stripeSessionId, sessionIndex, mode, text }
//  - mode 'add'    : GUARDED close-out (default note when blank, next-appointment WhatsApp if not
//                    last). 409 if this session was already closed — that's the "Ekle" lock.
//  - mode 'append' : append text to the existing note. No guard, never notifies.
//  - mode 'replace': overwrite the note. No guard, never notifies.
export async function handlePanelNotePost(request: Request, env: Env): Promise<Response> {
	let body: { stripeSessionId?: unknown; sessionIndex?: unknown; mode?: unknown; text?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const stripeSessionId = String(body.stripeSessionId ?? '');
	const index = Number(body.sessionIndex);
	const mode = String(body.mode ?? '');
	const text = String(body.text ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!stripeSessionId || !Number.isInteger(index) || index < 1 || index > MAX_SESSION_COUNT) {
		return errorResponse(request, 400, 'Geçersiz seans bilgisi.');
	}
	if (mode !== 'add' && mode !== 'append' && mode !== 'replace') {
		return errorResponse(request, 400, 'Geçersiz işlem.');
	}

	const found = await loadRow(env, stripeSessionId);
	if (!found) return errorResponse(request, 404, 'Kayıt bulunamadı.');
	const { rowNumber, row } = found;
	const { noteField } = sessionFields(index);

	if (mode === 'add') {
		const result = await closeOutSessionNote(env, rowNumber, row, index, text);
		if (!result.closed) return errorResponse(request, 409, 'Bu seans için not zaten işlendi.');
		return json({ closed: true, notified: result.notified }, request);
	}

	// append / replace — Sheets only, never a WhatsApp, never touches the guard.
	const existing = row[noteField];
	const value = mode === 'append' && existing ? `${existing}\n${text}` : text;
	await writeCellMirrored(env, row, rowNumber, noteField, value.slice(0, NOTE_MAX_LENGTH));
	return json({ ok: true }, request);
}

// Shared guard: every /panel/* route except login must carry a valid Bearer token.
export async function requirePanelAuth(request: Request, env: Env): Promise<Response | null> {
	if (await isPanelAuthorized(env, request)) return null;
	return errorResponse(request, 401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.');
}
