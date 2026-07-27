import { SUMMARY_MAX_LENGTH } from '../config';
import { verifyCancelToken } from '../lib/cancel-link';
import { computeRefund } from '../lib/refund';
import { performCancellation } from '../lib/cancellation';
import { findRowBySessionId, getRow } from '../lib/sheets';
import { errorResponse, json } from '../lib/http';
import type { Env, SheetRow } from '../types';

async function loadRow(env: Env, stripeSessionId: string): Promise<{ rowNumber: number; row: SheetRow } | null> {
	const rowNumber = await findRowBySessionId(env, stripeSessionId);
	if (rowNumber === null) return null;
	return { rowNumber, row: await getRow(env, rowNumber) };
}

// Shared by GET and POST: "sessions=1,2" -> [1,2]; missing/blank -> undefined (meaning "all").
function parseSessionIndexes(raw: string | null | undefined): number[] | undefined {
	if (!raw) return undefined;
	const indexes = raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
	return indexes.length > 0 ? indexes : undefined;
}

// GET /cancel?session=&token=&sessions=1,2 — validate the link and return a PREVIEW (appointment
// details + every remaining session, individually, so the client can choose which to cancel + the
// refund computed for whichever subset `sessions` names, or all remaining if omitted). Never
// mutates anything; cancel.html renders this, then POSTs to actually cancel.
export async function handleCancelGet(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const stripeSessionId = url.searchParams.get('session') ?? '';
	const token = url.searchParams.get('token') ?? '';
	if (!stripeSessionId || !token || !(await verifyCancelToken(env, stripeSessionId, token))) {
		return errorResponse(request, 401, 'This cancellation link is invalid or has expired.');
	}

	const found = await loadRow(env, stripeSessionId);
	if (!found) return errorResponse(request, 404, 'We could not find this booking.');

	const now = new Date();
	const allRemaining = computeRefund(found.row, now).remaining;
	const chosen = parseSessionIndexes(url.searchParams.get('sessions'));
	const refund = computeRefund(found.row, now, chosen);
	return json(
		{
			alreadyCancelled: Boolean(found.row.cancelledAt),
			name: found.row.name,
			sessionCount: Number(found.row.sessionCount) || 1,
			// The earliest still-remaining session, not always session 1's column — session 1 may
			// already have been individually cancelled (via the panel) and its column blanked,
			// which produced "Invalid Date" on this preview (found live testing partial cancellation).
			appointmentStartUtc: allRemaining[0]?.startUtc ?? found.row.appointmentStartUtc,
			clientTimeZone: found.row.clientTimeZone,
			sessions: allRemaining.map((r) => ({ index: r.index, startUtc: r.startUtc })),
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
	let body: { session?: unknown; token?: unknown; reason?: unknown; sessionIndexes?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Request body must be valid JSON');
	}
	const stripeSessionId = String(body.session ?? '');
	const token = String(body.token ?? '');
	const reason = String(body.reason ?? '').slice(0, SUMMARY_MAX_LENGTH);
	// Omitted/empty means "every remaining session" — keeps single-session bookings (and any older
	// client that never sends this field) cancelling exactly as before.
	const sessionIndexes = Array.isArray(body.sessionIndexes) ? body.sessionIndexes.map(Number) : undefined;
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
		const allRemainingCount = computeRefund(row, now).remaining.length;
		const refund = computeRefund(row, now, sessionIndexes);
		if (sessionIndexes && refund.remaining.length !== sessionIndexes.length) {
			return errorResponse(request, 400, 'One of the selected sessions is no longer valid (it may already be cancelled or in the past).');
		}
		await performCancellation(env, rowNumber, row, stripeSessionId, {
			remaining: refund.remaining,
			refundGBP: refund.refundGBP,
			refundPercent: refund.refundPercent,
			reason,
			markBookingCancelled: refund.remaining.length === allRemainingCount,
		});
		return json({ cancelled: true, refundGBP: refund.refundGBP, refundPercent: refund.refundPercent }, request);
	} catch (err) {
		return errorResponse(request, 500, 'We could not complete the cancellation. Please contact us.', err);
	}
}
