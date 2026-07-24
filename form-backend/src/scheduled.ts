import { WHATSAPP_TEMPLATES, MAX_SESSION_COUNT, locationFor } from './config';
import { getAllRows, writeCellMirrored } from './lib/sheets';
import { sendTemplate } from './lib/whatsapp';
import { getLocalDateParts, localTimeToUtc } from './lib/timezone';
import { closeOutSessionNote, sessionFields, bookedSessionIndexes } from './lib/notes';
import type { Env, SheetRow } from './types';

// Çiğdem's fixed local timezone (Madde 5 design assumption) — the "end of the session's own day" a
// note fallback is measured against.
const PANEL_TIMEZONE = 'Europe/London';

function formatAppointment(startUtc: string, timeZone: string): string {
	return new Date(startUtc).toLocaleString('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
}

interface SessionSlotFields {
	startUtcField: keyof SheetRow;
	reminderDueField: keyof SheetRow;
	reminderSentField: keyof SheetRow;
}

// Session 1 uses the original columns; sessions 2..MAX_SESSION_COUNT use the trailing
// sessionNStartUtc/sessionNReminderDueUtc/sessionNReminderSentAt columns reserved for recurring
// bookings (booking-system-expansion plan, Session 10). Checked every tick regardless of a given
// row's actual sessionCount — unused columns are just blank and skipped below.
const SESSION_SLOTS: SessionSlotFields[] = [
	{ startUtcField: 'appointmentStartUtc', reminderDueField: 'reminderDueUtc', reminderSentField: 'reminderSentAt' },
	...Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => {
		const n = i + 2;
		return {
			startUtcField: `session${n}StartUtc` as keyof SheetRow,
			reminderDueField: `session${n}ReminderDueUtc` as keyof SheetRow,
			reminderSentField: `session${n}ReminderSentAt` as keyof SheetRow,
		};
	}),
];

// Runs every 15 min (wrangler.jsonc cron trigger). Each session's reminder-due instant was
// computed once at booking time (config.ts REMINDER_LOCAL_HOUR), not recalculated here — this
// just checks which due sessions haven't been reminded yet, across every row and every session
// slot within a row (a recurring booking has up to MAX_SESSION_COUNT independent reminders).
export async function runReminderSweep(env: Env, now: Date = new Date()): Promise<void> {
	const rows = await getAllRows(env);

	for (const { rowNumber, row } of rows) {
		for (const slot of SESSION_SLOTS) {
			const startUtc = row[slot.startUtcField];
			const reminderDueUtc = row[slot.reminderDueField];
			if (!startUtc || row[slot.reminderSentField]) continue; // no session here, or already sent
			if (!reminderDueUtc || new Date(reminderDueUtc) > now) continue; // not due yet

			try {
				const appointment = formatAppointment(startUtc, row.clientTimeZone);
				await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.reminder, [row.name, appointment, locationFor(row.sessionMode)]);
				// Guarded before Selen's notification fires, same idempotency ordering as the Stripe
				// webhook cascade — a retried/overlapping sweep can at worst double-notify Selen.
				await writeCellMirrored(env, row, rowNumber, slot.reminderSentField, now.toISOString());
				await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.reminderSentNotice, [row.name, appointment]);
			} catch (err) {
				// A failed session slot is simply retried on the next 15-min tick (its
				// reminderSentAt cell stays empty) — no dead-letter tracking, add one if a
				// slot ever silently gets stuck.
				console.error(`Reminder sweep failed for row ${rowNumber} (${row.stripeSessionId}), slot ${slot.startUtcField}`, err);
			}
		}
	}
}

// Madde 5 fallback: once a session's own calendar day is over (past 23:59 London) and Çiğdem still
// hasn't pressed "Ekle" for it, close it out automatically — the exact same action as the manual
// button (default "Bu seansta not alınmadı." note + next-appointment WhatsApp if not the last
// session), routed through the same closeOutSessionNote guard so whichever fires first wins and the
// client is never notified twice. Runs on the same 15-min cron as the reminder sweep.
// Cancelled packages are skipped entirely: their remaining sessions were blanked at cancellation
// (so nothing to notify about), and an attended-but-cancelled package must not auto-fire either.
export async function runSessionNoteFallback(env: Env, now: Date = new Date()): Promise<void> {
	const rows = await getAllRows(env);

	for (const { rowNumber, row } of rows) {
		if (row.cancelledAt) continue;
		for (const index of bookedSessionIndexes(row)) {
			const { startUtcField, guardField } = sessionFields(index);
			if (row[guardField]) continue; // already closed (manual "Ekle" or an earlier tick)

			const { year, month, day } = getLocalDateParts(new Date(row[startUtcField]), PANEL_TIMEZONE);
			const endOfDay = new Date(localTimeToUtc(year, month, day, 23, PANEL_TIMEZONE).getTime() + 59 * 60_000);
			if (now <= endOfDay) continue; // the session's day (London) isn't over yet

			try {
				await closeOutSessionNote(env, rowNumber, row, index, ''); // '' -> default note applied inside
			} catch (err) {
				console.error(`Note fallback failed for row ${rowNumber} (${row.stripeSessionId}), session ${index}`, err);
			}
		}
	}
}
