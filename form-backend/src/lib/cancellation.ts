import { WHATSAPP_TEMPLATES } from '../config';
import { sessionRefs, type SessionRef } from './refund';
import { deleteCalendarEvent } from './calendar';
import { getStripeClient } from './stripe';
import { sendTemplate } from './whatsapp';
import { writeCellMirrored } from './sheets';
import type { Env, SheetRow } from '../types';

function formatAppointment(startUtc: string, timeZone: string): string {
	return new Date(startUtc).toLocaleString('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
}

// The Sheets columns a cancelled (future) session occupies — cleared on cancellation so the cron
// reminder sweep (scheduled.ts) stops reminding for it. Session 1 uses the original columns.
function sessionColumns(index: number): (keyof SheetRow)[] {
	if (index === 1) return ['appointmentStartUtc', 'reminderDueUtc', 'reminderSentAt'];
	return [
		`session${index}StartUtc` as keyof SheetRow,
		`session${index}ReminderDueUtc` as keyof SheetRow,
		`session${index}ReminderSentAt` as keyof SheetRow,
	];
}

// The one place a booking is actually cancelled — Stripe refund, Calendar deletion, Sheets record,
// client/Selen WhatsApp — shared by the client's own self-service link (routes/cancel.ts, always
// cancels every remaining session) and Çiğdem's manual panel override (routes/panel.ts, refund
// percent AND which specific session(s) chosen by hand). One implementation, two triggers, same
// idempotency/isolation shape as the rest of the codebase: the WhatsApp notify is isolated in its
// own try/catch so a template failure never undoes an already-committed refund/Calendar/Sheets
// write. `markBookingCancelled` (default true) controls the `cancelledAt` guard — it must be false
// for a PARTIAL cancellation (some remaining sessions untouched), otherwise the note-taking/reminder
// sweeps would treat the whole booking as dead (see scheduled.ts / panel.ts's `cancelledAt` skips).
export async function performCancellation(
	env: Env,
	rowNumber: number,
	row: SheetRow,
	stripeSessionId: string,
	params: { remaining: SessionRef[]; refundGBP: number; refundPercent: number; reason: string; markBookingCancelled?: boolean },
): Promise<{ refundId: string }> {
	const refundPence = Math.round(params.refundGBP * 100);

	// 1. Stripe refund — skip a 0-amount refund (Stripe rejects it).
	let refundId = '';
	if (refundPence > 0) {
		const stripe = getStripeClient(env);
		const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
		const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? '');
		if (paymentIntent) {
			// The key must be unique per DISTINCT cancellation action, not just per booking — a
			// partial cancellation (2026-07-27) means the same stripeSessionId can now go through
			// several separate refund calls (session 2 today, session 3 next week), each for a
			// different amount. Keying on stripeSessionId alone made Stripe correctly reject the
			// second call ("idempotent requests can only be used with the same parameters"),
			// because it looked like a retry of the first with a different amount. Including the
			// sorted session indices keeps a genuine retry of the SAME action deduplicated while
			// letting a later, different partial cancellation go through.
			const sessionsKey = params.remaining
				.map((s) => s.index)
				.sort((a, b) => a - b)
				.join('-');
			const created = await stripe.refunds.create(
				{ payment_intent: paymentIntent, amount: refundPence },
				{ idempotencyKey: `cancel_${stripeSessionId}_s${sessionsKey}` },
			);
			refundId = created.id;
		}
	}

	// 2. Remove the cancelled sessions from the Calendar (idempotent per event).
	for (const s of params.remaining) {
		await deleteCalendarEvent(env, s.index === 1 ? stripeSessionId : `${stripeSessionId}_s${s.index}`);
	}

	// 3. Record the cancellation, then blank the cancelled sessions' columns so the reminder sweep
	// skips them. cancelledAt (when written) is last — it's the guard the idempotency check upstream
	// reads, and must only mean "no future sessions remain on this booking".
	await writeCellMirrored(env, row, rowNumber, 'cancellationReason', params.reason);
	await writeCellMirrored(env, row, rowNumber, 'stripeRefundId', refundId);
	await writeCellMirrored(env, row, rowNumber, 'refundPercent', String(params.refundPercent));
	await writeCellMirrored(env, row, rowNumber, 'refundAmount', String(params.refundGBP));
	// Display-only counter for Çiğdem (2026-07-27) — deliberately NOT `sessionCount` itself, which
	// every reminder/panel/mirror-tab lookup uses as "how many sessionN columns to read"; shrinking
	// that on a non-contiguous partial cancellation (e.g. sessions 2+4 of 6 cancelled) would make the
	// still-active sessions 5 and 6 invisible to those lookups. This just counts what's still
	// populated, with no effect on any other code path.
	const activeCount = sessionRefs(row).length - params.remaining.length;
	await writeCellMirrored(env, row, rowNumber, 'activeSessionCount', String(activeCount));
	for (const s of params.remaining) {
		for (const column of sessionColumns(s.index)) await writeCellMirrored(env, row, rowNumber, column, '');
	}
	if (params.markBookingCancelled !== false) {
		await writeCellMirrored(env, row, rowNumber, 'cancelledAt', new Date().toISOString());
	}

	// 4. Notify client + Selen. Isolated in its own try/catch, deliberately: the refund, Calendar
	// deletion and Sheets record above are the parts that actually matter and are already committed
	// by this point — a WhatsApp failure here must never make the caller report the cancellation as
	// failed when it actually succeeded (see cancel.ts's original note on this, found live).
	//
	// The appointment date quoted in the message is the EARLIEST cancelled session, not always
	// row.appointmentStartUtc (session 1) — found live: a partial cancellation of session 2 or 3
	// was quoting session 1's date in the confirmation, which is simply wrong when session 1 was
	// never touched.
	try {
		const referenceStart = params.remaining[0]?.startUtc ?? row.appointmentStartUtc;
		const appointment = formatAppointment(referenceStart, row.clientTimeZone);
		const refundText = `£${params.refundGBP}`;
		await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.cancellationConfirmed, [row.name, appointment, refundText]);
		await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.cancellationNotice, [row.name, appointment, refundText]);
	} catch (err) {
		console.error(`Cancellation WhatsApp notice failed for ${stripeSessionId}:`, err);
	}

	return { refundId };
}
