import { WHATSAPP_TEMPLATES, MAX_SESSION_COUNT, locationFor } from '../config';
import { writeCellMirrored } from './sheets';
import { sendTemplate } from './whatsapp';
import type { Env, SheetRow } from '../types';

// The Sheets columns a given session index owns (Madde 5). Session 1 is prefix-less; 2..N carry the
// sessionN prefix — the same split cancel.ts / scheduled.ts already use for the start columns.
export interface SessionFields {
	startUtcField: keyof SheetRow;
	noteField: keyof SheetRow;
	guardField: keyof SheetRow;
}

export function sessionFields(index: number): SessionFields {
	if (index === 1) return { startUtcField: 'appointmentStartUtc', noteField: 'sessionNote', guardField: 'sessionNoteSubmittedAt' };
	return {
		startUtcField: `session${index}StartUtc` as keyof SheetRow,
		noteField: `session${index}Note` as keyof SheetRow,
		guardField: `session${index}NoteSubmittedAt` as keyof SheetRow,
	};
}

// Indices (1..MAX) that actually hold a booked start in this row, ascending. A cancelled session's
// start column is blanked (cancel.ts), so it drops out here naturally.
export function bookedSessionIndexes(row: SheetRow): number[] {
	const out: number[] = [];
	for (let i = 1; i <= MAX_SESSION_COUNT; i++) if (row[sessionFields(i).startUtcField]) out.push(i);
	return out;
}

// The next still-booked session after `index`, or null when `index` is the last — its absence is
// exactly what "son seans" means, and its startUtc is what the next-appointment WhatsApp points at.
export function nextBookedSession(row: SheetRow, index: number): { index: number; startUtc: string } | null {
	for (const i of bookedSessionIndexes(row)) {
		if (i > index) return { index: i, startUtc: row[sessionFields(i).startUtcField] };
	}
	return null;
}

export const DEFAULT_NOTE = 'Bu seansta not alınmadı.';

// The ONE place a session is "closed out" — shared by the manual "Ekle" button (routes/panel.ts)
// and the 23:59 cron fallback (scheduled.ts) so it happens exactly once. The guard field is the
// single authority: if it's already set, this no-ops and reports closed:false (the manual route
// turns that into a 409, the cron just moves on). Otherwise it writes the note (default when blank),
// stamps the guard, then — only if this isn't the last session — sends the client their
// next-appointment WhatsApp (reusing the approved randevu_onay_danisan template). The guard is
// stamped BEFORE the send, so a retry can never double-message the client — same idempotency
// ordering as scheduled.ts / stripe-webhook.ts; a WhatsApp failure is logged, not surfaced.
export async function closeOutSessionNote(
	env: Env,
	rowNumber: number,
	row: SheetRow,
	index: number,
	text: string,
): Promise<{ closed: boolean; notified: boolean }> {
	const { noteField, guardField } = sessionFields(index);
	if (row[guardField]) return { closed: false, notified: false }; // manual or cron already closed this

	await writeCellMirrored(env, row, rowNumber, noteField, text.trim() || DEFAULT_NOTE);
	await writeCellMirrored(env, row, rowNumber, guardField, new Date().toISOString());

	const next = nextBookedSession(row, index);
	if (!next) return { closed: true, notified: false }; // last session — client is never notified

	try {
		const appointment = new Date(next.startUtc).toLocaleString('en-GB', {
			timeZone: row.clientTimeZone,
			dateStyle: 'medium',
			timeStyle: 'short',
		});
		await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.bookingConfirmation, [row.name, appointment, locationFor(row.sessionMode)]);
		return { closed: true, notified: true };
	} catch (err) {
		console.error(`Next-appointment WhatsApp failed for ${row.stripeSessionId} session ${index}:`, err);
		return { closed: true, notified: false };
	}
}
