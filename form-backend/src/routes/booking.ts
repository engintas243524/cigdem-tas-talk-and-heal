import {
	getPriceGBP,
	STRIPE_SUCCESS_URL,
	STRIPE_CANCEL_URL,
	STRIPE_METADATA_VALUE_MAX,
	MAX_SESSION_COUNT,
	BUSINESS_HOURS,
	type SessionType,
	type SessionMode,
	type TherapyMode,
} from '../config';
import { getAvailableSlots } from '../lib/calendar';
import { detectTimezoneFromPhone, getLocalDateParts } from '../lib/timezone';
import { getStripeClient } from '../lib/stripe';
import { errorResponse, json } from '../lib/http';
import type { Env, BookingRequest } from '../types';

const VALID_SESSION_TYPES: SessionType[] = ['standard', 'extended'];
const VALID_SESSION_MODES: SessionMode[] = ['online', 'inPerson'];
const VALID_THERAPY_MODES: TherapyMode[] = ['individual', 'couple'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Monday-of-the-week (in BUSINESS_HOURS' timezone) as a sortable "YYYY-MM-DD" key, used to check
// the recurring-booking rule: one session per week, consecutive weeks only.
function weekStartKey(date: Date): string {
	const { year, month, day, isoWeekday } = getLocalDateParts(date, BUSINESS_HOURS.timeZone);
	const monday = new Date(Date.UTC(year, month - 1, day));
	monday.setUTCDate(monday.getUTCDate() - (isoWeekday - 1));
	return monday.toISOString().slice(0, 10);
}

// Weekday+hour identity (BUSINESS_HOURS' timezone) used to match a slot against the recurring
// pattern set below — independent of which week it falls in.
function patternKey(date: Date): string {
	const { isoWeekday, hour } = getLocalDateParts(date, BUSINESS_HOURS.timeZone);
	return `${isoWeekday}-${hour}`;
}

// Recurring/multi-session bookings establish their weekly pattern from the earliest ("reference")
// week the client picks: any number of distinct weekday+hour patterns in that first week (even
// several on the same day). Every later week may only reuse patterns from that set — a subset is
// fine, the client isn't forced to repeat all of them — and later weeks may be any distance apart
// (skipping weeks entirely is allowed; decided 2026-07-31, dropping the old "consecutive weeks
// only" cap). Generalizes the old "exactly one slot per week, identical weekday+hour every week"
// rule to N weekly patterns. Single-session bookings (length 1) skip this check entirely.
//
// Day-only mode (2026-08-10, Madde 10/11): if the reference week has exactly ONE slot, later
// weeks are constrained to that slot's WEEKDAY only (any hour, any number of sessions that day),
// not its exact hour. With a single reference slot the strict same-pattern rule would itself
// forbid ever picking more than one session in a later week — contradicting wanting to grow
// session count later while only having committed to one day up front. With 2+ reference slots
// the exact weekday+hour rule is unchanged.
function validateConsecutiveWeeks(slotStartUtcs: string[]): string | null {
	if (slotStartUtcs.length <= 1) return null;

	const sorted = [...slotStartUtcs].map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime());

	const weekOrder: string[] = [];
	const byWeek = new Map<string, Date[]>();
	for (const d of sorted) {
		const key = weekStartKey(d);
		if (!byWeek.has(key)) {
			byWeek.set(key, []);
			weekOrder.push(key);
		}
		byWeek.get(key)!.push(d);
	}

	const referenceSlots = byWeek.get(weekOrder[0])!;
	const referencePatterns = new Set(referenceSlots.map(patternKey));
	if (referencePatterns.size !== referenceSlots.length) {
		return 'Duplicate day/time selected in the same week.';
	}

	const dayOnlyMode = referenceSlots.length === 1;
	const referenceWeekdays = new Set(referenceSlots.map((d) => getLocalDateParts(d, BUSINESS_HOURS.timeZone).isoWeekday));

	for (let i = 1; i < weekOrder.length; i++) {
		const weekSlots = byWeek.get(weekOrder[i])!;
		const seen = new Set<string>();
		for (const d of weekSlots) {
			const key = patternKey(d);
			if (seen.has(key)) return 'Duplicate day/time selected in the same week.';
			seen.add(key);

			if (dayOnlyMode) {
				const weekday = getLocalDateParts(d, BUSINESS_HOURS.timeZone).isoWeekday;
				if (!referenceWeekdays.has(weekday)) {
					return "Only your first week's day can be selected in later weeks.";
				}
			} else if (!referencePatterns.has(key)) {
				return 'Only day/times from your first week can be selected in later weeks.';
			}
		}
	}
	return null;
}

function validate(body: Partial<BookingRequest>): string | null {
	if (!body.name?.trim()) return 'name is required';
	if (!body.email || !EMAIL_PATTERN.test(body.email)) return 'a valid email is required';
	if (!body.phone?.trim()) return 'phone is required';
	if (!body.summary?.trim()) return 'summary is required';
	if (!body.sessionType || !VALID_SESSION_TYPES.includes(body.sessionType)) {
		return `sessionType must be one of: ${VALID_SESSION_TYPES.join(', ')}`;
	}
	if (!body.sessionMode || !VALID_SESSION_MODES.includes(body.sessionMode)) {
		return `sessionMode must be one of: ${VALID_SESSION_MODES.join(', ')}`;
	}
	if (!body.therapyMode || !VALID_THERAPY_MODES.includes(body.therapyMode)) {
		return `therapyMode must be one of: ${VALID_THERAPY_MODES.join(', ')}`;
	}
	if (!Array.isArray(body.slotStartUtcs) || body.slotStartUtcs.length < 1 || body.slotStartUtcs.length > MAX_SESSION_COUNT) {
		return `slotStartUtcs must be an array of 1-${MAX_SESSION_COUNT} ISO instants`;
	}
	if (body.slotStartUtcs.some((s) => typeof s !== 'string' || Number.isNaN(Date.parse(s)))) {
		return 'every entry in slotStartUtcs must be a valid ISO instant';
	}
	const weekError = validateConsecutiveWeeks(body.slotStartUtcs);
	if (weekError) return weekError;
	if (body.cancellationAck !== true) return 'cancellation policy must be acknowledged';
	return null;
}

export async function handleBooking(request: Request, env: Env): Promise<Response> {
	let body: Partial<BookingRequest>;
	try {
		body = await request.json();
	} catch {
		return errorResponse(request, 400, 'Request body must be valid JSON');
	}

	const validationError = validate(body);
	if (validationError) return errorResponse(request, 400, validationError);
	const booking = body as BookingRequest;

	try {
		// Re-check every requested slot is still free right before creating the Checkout Session —
		// narrows but doesn't eliminate the double-booking race (see plan doc); the real Calendar
		// writes only happen once payment succeeds, in the Stripe webhook.
		const freeSlots = await getAvailableSlots(env, booking.sessionType);
		const unavailable = booking.slotStartUtcs.filter((s) => !freeSlots.includes(s));
		if (unavailable.length > 0) {
			return errorResponse(request, 409, 'One or more selected times are no longer available, please pick again.');
		}

		const sortedSlots = [...booking.slotStartUtcs].sort();
		const timeZone = detectTimezoneFromPhone(booking.phone);
		const priceGBP = getPriceGBP(booking.sessionMode, booking.therapyMode, booking.sessionType);
		const sessionCount = sortedSlots.length;

		// Madde 500 (2026-08-11, revised): the client's note (whatever's in the box at submit time,
		// after any Translate/Metni Düzelt edit) is split into as many ≤500-char chunks as needed —
		// never summarized here. A single Stripe metadata value can't hold more than
		// STRIPE_METADATA_VALUE_MAX characters, so this is purely a storage workaround; the webhook
		// reassembles the full text losslessly (see routes/stripe-webhook.ts).
		const summaryChunks: string[] = [];
		for (let i = 0; i < booking.summary.length; i += STRIPE_METADATA_VALUE_MAX) {
			summaryChunks.push(booking.summary.slice(i, i + STRIPE_METADATA_VALUE_MAX));
		}

		const stripe = getStripeClient(env);
		const session = await stripe.checkout.sessions.create({
			mode: 'payment',
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'gbp',
						product_data: {
							name: `Talk and Heal — ${booking.sessionMode} ${booking.therapyMode} ${booking.sessionType} session${sessionCount > 1 ? ` (x${sessionCount}, weekly)` : ''}`,
						},
						unit_amount: priceGBP * 100,
					},
					quantity: sessionCount,
				},
			],
			success_url: STRIPE_SUCCESS_URL,
			cancel_url: STRIPE_CANCEL_URL,
			metadata: {
				name: booking.name,
				email: booking.email,
				phone: booking.phone,
				summaryChunkCount: String(summaryChunks.length),
				...Object.fromEntries(summaryChunks.map((chunk, i) => [`summary${i}`, chunk])),
				sessionType: booking.sessionType,
				sessionMode: booking.sessionMode,
				therapyMode: booking.therapyMode,
				priceGBP: String(priceGBP),
				sessionCount: String(sessionCount),
				// The tiered 72/48/24h policy was retired (2026-08-10) in favor of a single flat 72h
				// cutoff (see lib/refund.ts) — this field is now always '72', kept only because
				// SHEET_COLUMNS still has a column for it and existing rows already carry the label.
				policyTier: '72',
				slotStartUtcsJson: JSON.stringify(sortedSlots),
				clientTimeZone: timeZone,
			},
		});

		return json({ url: session.url }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Could not start checkout right now, please try again shortly.', err);
	}
}
