// Cancellation-policy tier, locked in at booking time based on how far ahead of the first
// session the booking was made (booking-system-expansion plan). This is the REAL enforced rule
// for that booking (not just display text) — stored in Sheets and used later for the actual
// refund calculation (Session 13).
//
// Note: the exact refund percentage math for each tier (including the confirmed "flat 50% below
// 24h" rule, and the small textual gap between each tier's two thresholds) is Session 13's job —
// this module only determines which of the three tiers applies.
export type PolicyTier = 72 | 48 | 24;

export function computePolicyTier(hoursUntilFirstSession: number): PolicyTier {
	if (hoursUntilFirstSession >= 72) return 72;
	if (hoursUntilFirstSession >= 48) return 48;
	return 24;
}
