import { WHATSAPP_TEMPLATES } from '../config';
import { sessionRefs, type SessionRef } from './refund';
import { deleteCalendarEvent } from './calendar';
import { getStripeClient } from './stripe';
import { sendTemplate, sendText } from './whatsapp';
import { sendEmail } from './email';
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
	params: {
		remaining: SessionRef[];
		refundGBP: number;
		refundPercent: number;
		reason: string;
		cancelledBy: 'Danışan' | 'Çiğdem';
		markBookingCancelled?: boolean;
		// Çiğdem's own freeform note for a manual cancellation (Madde 11, 2026-08-10) — e.g. a
		// condolence message or a no-show remark. Optional; only Çiğdem's panel override ever sets
		// this (the client's own self-service /cancel link never does).
		clientMessage?: string;
	},
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
	await writeCellMirrored(env, row, rowNumber, 'cancelledBy', params.cancelledBy);
	if (params.clientMessage) {
		await writeCellMirrored(env, row, rowNumber, 'cancellationClientMessage', params.clientMessage);
	}
	// refundAmount/refundPercent/stripeRefundId are CUMULATIVE across every partial cancellation this
	// booking ever goes through (BE-37, 2026-07-27) — a booking can be partially cancelled more than
	// once (different sessions, different days), and overwriting these with just the latest call's
	// numbers silently lost every earlier refund's amount/id. refundPercent is now "% of the booking's
	// ORIGINAL total value refunded so far", not "this action's rate" — the two are the same number
	// for a booking's first/only cancellation, and only diverge once a second partial cancel happens.
	// `refundId` already came back from the SAME Stripe idempotency key on a retried request, so
	// checking it's not already in the prior list is what keeps a retry from double-counting.
	const priorRefundIds = row.stripeRefundId ? row.stripeRefundId.split(', ').filter(Boolean) : [];
	const isNewRefund = refundId !== '' && !priorRefundIds.includes(refundId);
	const cumulativeRefundAmount = isNewRefund ? (Number(row.refundAmount) || 0) + params.refundGBP : Number(row.refundAmount) || 0;
	const cumulativeRefundId = isNewRefund ? [...priorRefundIds, refundId].join(', ') : row.stripeRefundId;
	const originalTotalGBP = (Number(row.priceGBP) || 0) * (Number(row.sessionCount) || 1);
	const cumulativeRefundPercent = originalTotalGBP > 0 ? Math.round((cumulativeRefundAmount / originalTotalGBP) * 100) : 0;
	await writeCellMirrored(env, row, rowNumber, 'stripeRefundId', cumulativeRefundId);
	await writeCellMirrored(env, row, rowNumber, 'refundPercent', String(cumulativeRefundPercent));
	await writeCellMirrored(env, row, rowNumber, 'refundAmount', String(cumulativeRefundAmount));
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
	const referenceStart = params.remaining[0]?.startUtc ?? row.appointmentStartUtc;
	const appointment = formatAppointment(referenceStart, row.clientTimeZone);
	const refundText = `£${params.refundGBP}`;
	try {
		await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.cancellationConfirmed, [row.name, appointment, refundText]);
		await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.cancellationNotice, [row.name, appointment, refundText]);
	} catch (err) {
		console.error(`Cancellation WhatsApp notice failed for ${stripeSessionId}:`, err);
	}

	// Çiğdem's own freeform personal note (Madde 11) — separate template, separate isolation: a
	// failure here must never affect the standard cancellation confirmation above or vice versa.
	if (params.clientMessage) {
		try {
			await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.cancellationPersonalNote, [params.clientMessage]);
		} catch (err) {
			console.error(`Cancellation personal-note WhatsApp failed for ${stripeSessionId}:`, err);
		}
	}

	// Client cancellation email — same isolation reasoning as the booking confirmation email
	// (stripe-webhook.ts): will fail while Resend stays in sandbox mode, must never undo the
	// refund/Calendar/Sheets work already committed above.
	const emailBody = `Hi ${row.name},\n\nYour cancellation has been processed.\nCancelled appointment: ${appointment}\nRefund: ${refundText}\n\nWarm wishes,\nTalk and Heal`;
	try {
		await sendEmail(env, row.email, 'Your Talk and Heal cancellation is confirmed', emailBody);
	} catch (err) {
		console.error(`Client cancellation email failed for ${stripeSessionId}:`, err);
	}
	// ponytail: same email-to-WhatsApp mirror (to the configured notification number) as the
	// booking confirmation, for the cancellation email above.
	try {
		await sendText(env, env.SELEN_WHATSAPP_NUMBER, `[Email preview for ${row.email}]\n\n${emailBody}`);
	} catch (err) {
		console.error(`Email-to-WhatsApp fallback failed for ${stripeSessionId}:`, err);
	}

	return { refundId };
}
