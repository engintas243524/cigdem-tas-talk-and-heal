import { WHATSAPP_TEMPLATES, SUMMARY_MAX_LENGTH } from '../config';
import { verifyCancelToken } from '../lib/cancel-link';
import { computeRefund } from '../lib/refund';
import { findRowBySessionId, getRow, writeCellMirrored } from '../lib/sheets';
import { deleteCalendarEvent } from '../lib/calendar';
import { getStripeClient } from '../lib/stripe';
import { sendTemplate } from '../lib/whatsapp';
import { errorResponse, json } from '../lib/http';
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

async function loadRow(env: Env, stripeSessionId: string): Promise<{ rowNumber: number; row: SheetRow } | null> {
	const rowNumber = await findRowBySessionId(env, stripeSessionId);
	if (rowNumber === null) return null;
	return { rowNumber, row: await getRow(env, rowNumber) };
}

// GET /cancel?session=&token= — validate the link and return a PREVIEW (appointment details +
// remaining sessions + computed refund). Never mutates anything; cancel.html renders this, then
// POSTs to actually cancel.
export async function handleCancelGet(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const stripeSessionId = url.searchParams.get('session') ?? '';
	const token = url.searchParams.get('token') ?? '';
	if (!stripeSessionId || !token || !(await verifyCancelToken(env, stripeSessionId, token))) {
		return errorResponse(request, 401, 'This cancellation link is invalid or has expired.');
	}

	const found = await loadRow(env, stripeSessionId);
	if (!found) return errorResponse(request, 404, 'We could not find this booking.');

	const refund = computeRefund(found.row, new Date());
	return json(
		{
			alreadyCancelled: Boolean(found.row.cancelledAt),
			name: found.row.name,
			sessionCount: Number(found.row.sessionCount) || 1,
			appointmentStartUtc: found.row.appointmentStartUtc,
			clientTimeZone: found.row.clientTimeZone,
			remaining: refund.remaining.map((r) => r.startUtc),
			refundGBP: refund.refundGBP,
			refundPercent: refund.refundPercent,
		},
		request,
	);
}

// POST /cancel { session, token, reason? } — perform the cancellation. Idempotent via the row's
// cancelledAt cell (same guard shape as the Stripe webhook's confirmationSentAt): a second POST
// (double-click, retry) never refunds or notifies twice. The Stripe refund additionally carries an
// idempotency key, so even a crash before cancelledAt is written can't double-charge a refund.
export async function handleCancelPost(request: Request, env: Env): Promise<Response> {
	let body: { session?: unknown; token?: unknown; reason?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Request body must be valid JSON');
	}
	const stripeSessionId = String(body.session ?? '');
	const token = String(body.token ?? '');
	const reason = String(body.reason ?? '').slice(0, SUMMARY_MAX_LENGTH);
	if (!stripeSessionId || !token || !(await verifyCancelToken(env, stripeSessionId, token))) {
		return errorResponse(request, 401, 'This cancellation link is invalid or has expired.');
	}

	const found = await loadRow(env, stripeSessionId);
	if (!found) return errorResponse(request, 404, 'We could not find this booking.');
	const { rowNumber, row } = found;

	if (row.cancelledAt) {
		return json(
			{ alreadyCancelled: true, refundGBP: Number(row.refundAmount) || 0, refundPercent: Number(row.refundPercent) || 0 },
			request,
		);
	}

	try {
		const now = new Date();
		const refund = computeRefund(row, now);

		// 1. Stripe refund — skip a 0-amount refund (Stripe rejects it; happens only when no future
		// sessions remain). Idempotency key makes a retried cancellation return the same refund.
		let refundId = '';
		if (refund.refundPence > 0) {
			const stripe = getStripeClient(env);
			const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
			const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? '');
			if (paymentIntent) {
				const created = await stripe.refunds.create(
					{ payment_intent: paymentIntent, amount: refund.refundPence },
					{ idempotencyKey: `cancel_${stripeSessionId}` },
				);
				refundId = created.id;
			}
		}

		// 2. Remove the remaining sessions from the Calendar (idempotent per event).
		for (const s of refund.remaining) {
			await deleteCalendarEvent(env, s.index === 1 ? stripeSessionId : `${stripeSessionId}_s${s.index}`);
		}

		// 3. Record the cancellation, then blank the cancelled sessions' columns so the reminder
		// sweep skips them. cancelledAt is written last of the "record" cells — it is the guard the
		// idempotency check above reads.
		await writeCellMirrored(env, row, rowNumber, 'cancellationReason', reason);
		await writeCellMirrored(env, row, rowNumber, 'stripeRefundId', refundId);
		await writeCellMirrored(env, row, rowNumber, 'refundPercent', String(refund.refundPercent));
		await writeCellMirrored(env, row, rowNumber, 'refundAmount', String(refund.refundGBP));
		for (const s of refund.remaining) {
			for (const column of sessionColumns(s.index)) await writeCellMirrored(env, row, rowNumber, column, '');
		}
		await writeCellMirrored(env, row, rowNumber, 'cancelledAt', now.toISOString());

		// 4. Notify client + Selen. Isolated in its own try/catch, deliberately: the refund, Calendar
		// deletion and Sheets record above are the parts that actually matter and are ALREADY done and
		// committed (cancelledAt is written) by this point — a WhatsApp failure here (these two
		// templates aren't Meta-approved yet, so this WILL 132001 until they are, same expected state
		// as Sessions 6/7) must never make the client-facing response say the cancellation failed when
		// it actually succeeded. Found live: without this guard, the real refund + Calendar delete +
		// Sheets write all happened, but the client got a scary "could not complete" 500 anyway.
		try {
			const appointment = formatAppointment(row.appointmentStartUtc, row.clientTimeZone);
			const refundText = `£${refund.refundGBP}`;
			await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.cancellationConfirmed, [row.name, appointment, refundText]);
			await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.cancellationNotice, [row.name, appointment, refundText]);
		} catch (err) {
			console.error(`Cancellation WhatsApp notice failed for ${stripeSessionId}:`, err);
		}

		return json({ cancelled: true, refundGBP: refund.refundGBP, refundPercent: refund.refundPercent }, request);
	} catch (err) {
		return errorResponse(request, 500, 'We could not complete the cancellation. Please contact us.', err);
	}
}
