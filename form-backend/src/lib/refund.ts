import type { SheetRow } from '../types';
import { computePolicyTier } from './policy';

// Refund calculation for a cancellation (Session 13). Pure — no I/O — so the money math can be
// unit-tested in isolation. The route (routes/cancel.ts) turns the result into the actual Stripe
// refund, Calendar deletions and Sheets writes.

export interface SessionRef {
	index: number; // 1-based: 1 = the original single-session columns, 2..N = trailing columns
	startUtc: string;
}

// Every populated session in the booking, in stored order. Session 1 lives in the original
// appointment columns; sessions 2..sessionCount live in the trailing sessionNStartUtc columns.
export function sessionRefs(row: SheetRow): SessionRef[] {
	const count = Number(row.sessionCount) || 1;
	const refs: SessionRef[] = [];
	for (let i = 1; i <= count; i++) {
		const startUtc = i === 1 ? row.appointmentStartUtc : row[`session${i}StartUtc` as keyof SheetRow];
		if (startUtc) refs.push({ index: i, startUtc });
	}
	return refs;
}

export interface RefundResult {
	remaining: SessionRef[]; // future (not-yet-held) sessions, soonest first
	refundGBP: number; // in pounds, what we tell the client / write to Sheets
	refundPence: number; // Math.round(refundGBP * 100), what Stripe's amount field wants
	refundPercent: number; // effective % of the remaining sessions' value being refunded
}

// Re-decided rule (2026-07-26, replaces the 2026-07-23 "one rate for every remaining session"
// version): each session being cancelled is judged on ITS OWN notice period, independent of its
// position in the booking (1st, 2nd, ... Xth) and independent of every other remaining session.
// A booking can mix days freely (client picks any day/count within the current week), so it's
// normal for one remaining session to be 10 hours out and another 10 days out in the same
// cancellation — each gets its own tier, not one shared rate.
//
// Same day, second policy change: under 72 hours' notice now forfeits the FULL amount (0% refund),
// not 50% — a session cancelled with under 72h notice earns no refund at all. >=72h notice still
// refunds 100%. (The 48/24 sub-tiers in policy.ts no longer affect the refund rate at all — both
// collapse to 0%, same as they collapsed to 50% before — but the tier plumbing is left in place
// since nothing else needs removing it.)
function remainingSessions(row: SheetRow, now: Date): SessionRef[] {
	return sessionRefs(row)
		.filter((r) => new Date(r.startUtc).getTime() > now.getTime())
		.sort((a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());
}

// UNIT PRICE NOTE: `unitPriceGBP` is `row.priceGBP` as-stored, which booking.ts sets to the
// per-session price (Checkout charges `unit_amount = priceGBP*100` with `quantity = sessionCount`,
// so the real per-session amount charged IS priceGBP, and the total charged is priceGBP*sessionCount).
// It is deliberately NOT `priceGBP / sessionCount`. See the builder summary for why this diverges
// from the task's literal wording — using the divided value would under-refund multi-session
// bookings by a factor of sessionCount.
// `onlyIndexes` (2026-07-27): the client's own /cancel link now lets them pick which remaining
// session(s) to cancel, same as Çiğdem's panel override below — omitted or empty still means
// "every remaining session" so a single-session booking needs no caller changes.
export function computeRefund(row: SheetRow, now: Date, onlyIndexes?: number[]): RefundResult {
	const unitPriceGBP = Number(row.priceGBP) || 0;
	let remaining = remainingSessions(row, now);
	if (onlyIndexes && onlyIndexes.length > 0) {
		const chosen = new Set(onlyIndexes);
		remaining = remaining.filter((r) => chosen.has(r.index));
	}

	let refundGBP = 0;
	for (const session of remaining) {
		const hoursUntil = (new Date(session.startUtc).getTime() - now.getTime()) / 3_600_000;
		const tier = computePolicyTier(hoursUntil);
		const rate = tier === 72 ? 1 : 0; // under 72h => full forfeiture
		refundGBP += unitPriceGBP * rate;
	}

	const remainingValue = remaining.length * unitPriceGBP;
	const refundPercent = remainingValue > 0 ? Math.round((refundGBP / remainingValue) * 100) : 0;
	return { remaining, refundGBP, refundPence: Math.round(refundGBP * 100), refundPercent };
}

// Çiğdem's manual override (panel), for extreme circumstances (bereavement, severe illness, etc.):
// she picks the refund percentage by hand instead of the automatic policy-tier calculation above,
// and picks WHICH remaining session(s) it applies to (2026-07-27: a booking can have several
// upcoming sessions and only some of them may need cancelling — found live, the panel used to
// always cancel every remaining session in one shot, which is not what "cancel just session 2"
// needs). `onlyIndexes` omitted or empty means "every remaining session", same as before.
export function computeOverrideRefund(row: SheetRow, now: Date, refundPercent: number, onlyIndexes?: number[]): RefundResult {
	const unitPriceGBP = Number(row.priceGBP) || 0;
	let remaining = remainingSessions(row, now);
	if (onlyIndexes && onlyIndexes.length > 0) {
		const chosen = new Set(onlyIndexes);
		remaining = remaining.filter((r) => chosen.has(r.index));
	}
	const refundGBP = remaining.length * unitPriceGBP * (refundPercent / 100);
	return { remaining, refundGBP, refundPence: Math.round(refundGBP * 100), refundPercent };
}
