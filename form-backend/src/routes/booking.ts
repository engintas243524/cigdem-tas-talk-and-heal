import {
	getPriceGBP,
	STRIPE_SUCCESS_URL,
	STRIPE_CANCEL_URL,
	SUMMARY_MAX_LENGTH,
	MAX_SESSION_COUNT,
	BUSINESS_HOURS,
	type SessionType,
	type SessionMode,
	type TherapyMode,
} from '../config';
import { getAvailableSlots } from '../lib/calendar';
import { detectTimezoneFromPhone, getLocalDateParts } from '../lib/timezone';
import { computePolicyTier } from '../lib/policy';
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

// Recurring/multi-session bookings must be exactly one slot per week, in consecutive weeks (no
// skipped weeks) — the exact rule + wording the user specified for the booking-system-expansion
// plan. Single-session bookings (length 1) skip this check entirely.
function validateConsecutiveWeeks(slotStartUtcs: string[]): string | null {
	if (slotStartUtcs.length <= 1) return null;

	const sorted = [...slotStartUtcs].map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime());
	const weekKeys = sorted.map(weekStartKey);
	if (new Set(weekKeys).size !== weekKeys.length) {
		return 'Only one session per week is allowed for a recurring booking.';
	}
	for (let i = 1; i < weekKeys.length; i++) {
		const daysBetween = (new Date(weekKeys[i]).getTime() - new Date(weekKeys[i - 1]).getTime()) / 86_400_000;
		if (daysBetween > 7) {
			return 'Sessions cannot be more than a week apart — please adjust your session selections.';
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
		const firstSlotStart = new Date(sortedSlots[0]);
		const hoursUntilFirstSession = (firstSlotStart.getTime() - Date.now()) / 3_600_000;
		const policyTier = computePolicyTier(hoursUntilFirstSession);
		const priceGBP = getPriceGBP(booking.sessionMode, booking.therapyMode, booking.sessionType);
		const sessionCount = sortedSlots.length;

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
				summary: booking.summary.slice(0, SUMMARY_MAX_LENGTH),
				sessionType: booking.sessionType,
				sessionMode: booking.sessionMode,
				therapyMode: booking.therapyMode,
				priceGBP: String(priceGBP),
				sessionCount: String(sessionCount),
				policyTier: String(policyTier),
				slotStartUtcsJson: JSON.stringify(sortedSlots),
				clientTimeZone: timeZone,
			},
		});

		return json({ url: session.url }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Could not start checkout right now, please try again shortly.', err);
	}
}
