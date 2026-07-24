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

// Re-decided rule (2026-07-23, replaces Session 13's separate "3+ remaining" special case): the
// booking-time `policyTier` column is stale by the time a cancellation actually happens — it was
// computed once, from how far the FIRST session was from the moment of booking, not from how much
// notice the client is giving NOW. A 2-session package booked 10 days out locks in tier 72 (100%
// refund) at booking time; if the client attends session 1 and then cancels session 2 with only 11
// hours' notice, reading the stale tier would still refund 100% — a real revenue leak. Every
// cancellation now recomputes the tier from hours-until-the-soonest-still-upcoming session, and
// applies ONE resulting rate (72 => 100%, 48 or 24 => 50%) to every remaining session, no matter
// how many remain (1, 2, 3, or more) — same formula every time, re-evaluated at each cancellation.
//
// UNIT PRICE NOTE: `unitPriceGBP` is `row.priceGBP` as-stored, which booking.ts sets to the
// per-session price (Checkout charges `unit_amount = priceGBP*100` with `quantity = sessionCount`,
// so the real per-session amount charged IS priceGBP, and the total charged is priceGBP*sessionCount).
// It is deliberately NOT `priceGBP / sessionCount`. See the builder summary for why this diverges
// from the task's literal wording — using the divided value would under-refund multi-session
// bookings by a factor of sessionCount.
export function computeRefund(row: SheetRow, now: Date): RefundResult {
	const unitPriceGBP = Number(row.priceGBP) || 0;

	const remaining = sessionRefs(row)
		.filter((r) => new Date(r.startUtc).getTime() > now.getTime())
		.sort((a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime());

	const n = remaining.length;
	let refundGBP = 0;
	if (n >= 1) {
		const hoursUntilSoonest = (new Date(remaining[0].startUtc).getTime() - now.getTime()) / 3_600_000;
		const tier = computePolicyTier(hoursUntilSoonest);
		const rate = tier === 72 ? 1 : 0.5; // 48 & 24 both => 50%
		refundGBP = n * unitPriceGBP * rate;
	}

	const remainingValue = n * unitPriceGBP;
	const refundPercent = remainingValue > 0 ? Math.round((refundGBP / remainingValue) * 100) : 0;
	return { remaining, refundGBP, refundPence: Math.round(refundGBP * 100), refundPercent };
}
