import { getSessionMinutes, BUSINESS_HOURS, type SessionType } from '../config';
import { getLocalDateParts, localTimeToUtc } from './timezone';
import { getGoogleAccessToken } from './google-auth';
import { getUkHolidays } from './holidays';
import type { Env } from '../types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface BusyRange {
	start: string;
	end: string;
}

async function queryFreeBusy(env: Env, timeMinIso: string, timeMaxIso: string): Promise<BusyRange[]> {
	const token = await getGoogleAccessToken(env);
	const response = await fetch(`${CALENDAR_API}/freeBusy`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			timeMin: timeMinIso,
			timeMax: timeMaxIso,
			items: [{ id: env.GOOGLE_CALENDAR_ID }],
		}),
	});
	if (!response.ok) {
		throw new Error(`Calendar freebusy query failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as { calendars: Record<string, { busy: BusyRange[] }> };
	return data.calendars[env.GOOGLE_CALENDAR_ID]?.busy ?? [];
}

function overlapsBusy(slotStart: Date, slotEnd: Date, busy: BusyRange[]): boolean {
	return busy.some((b) => slotStart < new Date(b.end) && slotEnd > new Date(b.start));
}

// How far ahead to list availability. Bumped from 14 to 75 days (booking-system-expansion plan,
// Session 10) — recurring bookings need one slot per week for up to MAX_SESSION_COUNT (10) weeks,
// so the window must cover at least 10 weeks plus a small buffer.
export const LOOKAHEAD_DAYS = 75;

// Slots always start on the hour (9, 10, 11, 14, 15, 16 in London local time) — a fixed set of
// start times independent of session length, confirmed 2026-07-22 (replacing the earlier
// back-to-back-by-duration stepping, which produced uneven starts like 11:00/11:50/12:40). Only
// the lunch window (12:00/13:00) is skipped; an extended (80min) session starting at 16:00 running
// past the 17:00 close is expected and fine — 16:00 is a fixed start hour for every session type,
// not bounded by whether the session finishes before endHour (real bug found via live testing:
// the duration-bounded loop below used to silently drop 16:00 for extended sessions only).
const SLOT_STEP_MS = 60 * 60_000;

// A visitor can never book the current calendar day. Before 18:00 (Europe/London) the earliest
// bookable day is tomorrow; at/after 18:00 the rollover pushes it one extra day to the day after
// tomorrow. Evaluated in BUSINESS_HOURS.timeZone, like every other business-hour calculation here.
function earliestBookableDayOffset(now: Date): number {
	const { hour } = getLocalDateParts(now, BUSINESS_HOURS.timeZone);
	return hour >= 18 ? 2 : 1;
}

// Every candidate slot-start (business day, on-the-hour business time, lunch-break skipped, past the
// same-day/18:00 cutoff) in chronological order — with NO freebusy or holiday filtering applied.
// The same fixed set of start hours applies to every session type (see SLOT_STEP_MS above), so this
// takes no sessionType. Shared by getAvailableSlots and getSlotStatuses; `now` is a parameter so
// tests can pin the clock.
export function candidateSlotStarts(now: Date): Date[] {
	const starts: Date[] = [];
	for (let dayOffset = earliestBookableDayOffset(now); dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
		const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
		const { year, month, day: dayOfMonth, isoWeekday } = getLocalDateParts(day, BUSINESS_HOURS.timeZone);
		if (!(BUSINESS_HOURS.days as readonly number[]).includes(isoWeekday)) continue;

		const dayStart = localTimeToUtc(year, month, dayOfMonth, BUSINESS_HOURS.startHour, BUSINESS_HOURS.timeZone);
		const dayEnd = localTimeToUtc(year, month, dayOfMonth, BUSINESS_HOURS.endHour, BUSINESS_HOURS.timeZone);

		for (let slotStart = dayStart; slotStart.getTime() < dayEnd.getTime(); slotStart = new Date(slotStart.getTime() + SLOT_STEP_MS)) {
			// No past-slot guard needed: earliestBookableDayOffset starts the day loop at tomorrow (or
			// later), so every candidate day is already in the future by construction.
			const { hour: localHour } = getLocalDateParts(slotStart, BUSINESS_HOURS.timeZone);
			if (localHour >= BUSINESS_HOURS.lunchBreak.startHour && localHour < BUSINESS_HOURS.lunchBreak.endHour) continue; // lunch break
			starts.push(slotStart);
		}
	}
	return starts;
}

export async function getAvailableSlots(env: Env, sessionType: SessionType): Promise<string[]> {
	const now = new Date();
	const timeMin = now.toISOString();
	const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const busy = await queryFreeBusy(env, timeMin, timeMax);
	const durationMs = getSessionMinutes(sessionType) * 60_000;

	return candidateSlotStarts(now)
		.filter((slotStart) => !overlapsBusy(slotStart, new Date(slotStart.getTime() + durationMs), busy))
		.map((slotStart) => slotStart.toISOString());
}

export type SlotStatus = 'available' | 'reserved' | 'holiday';
export interface SlotDetail {
	iso: string;
	status: SlotStatus;
	holidayTitle?: string; // only present when status === 'holiday'
}

// The full candidate grid annotated with a status, for the frontend to render reserved/holiday chips
// instead of hiding them. A slot is 'holiday' only when it is BOTH busy AND on a UK bank-holiday
// date — holiday-blocking works by seeding an all-day busy placeholder onto the real Calendar for
// each holiday (a separate one-time script), so deleting that placeholder to work the day naturally
// turns every slot back to 'available' via the busy check alone, no special-casing here.
export async function getSlotStatuses(env: Env, sessionType: SessionType): Promise<SlotDetail[]> {
	const now = new Date();
	const timeMin = now.toISOString();
	const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const durationMs = getSessionMinutes(sessionType) * 60_000;
	const [busy, holidays] = await Promise.all([queryFreeBusy(env, timeMin, timeMax), getUkHolidays()]);

	return candidateSlotStarts(now).map((slotStart): SlotDetail => {
		const iso = slotStart.toISOString();
		if (!overlapsBusy(slotStart, new Date(slotStart.getTime() + durationMs), busy)) {
			return { iso, status: 'available' };
		}
		const { year, month, day } = getLocalDateParts(slotStart, BUSINESS_HOURS.timeZone);
		const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		const holidayTitle = holidays.get(ymd);
		return holidayTitle ? { iso, status: 'holiday', holidayTitle } : { iso, status: 'reserved' };
	});
}

// Deterministic Calendar event id derived from the Stripe Checkout session id (or, for sessions
// 2..N of a recurring booking, that id plus a "_sN" suffix — see stripe-webhook.ts), so a retried
// events.insert 409s instead of creating a duplicate event (idempotency, see plan doc).
// Google event ids must be lowercase base32hex ([a-v0-9]), 5-1024 chars.
//
// Real bug found via live testing (booking-system-expansion plan, Session 10): each input char
// expands to ~2 base32 chars, so a ~65-char input (Stripe session id + "_s10") produces ~140
// encoded chars — the previous `.slice(0, 100)` truncated that, and since the "_sN" suffix sits
// at the *end* of the input, sessions 2+ of the same booking all truncated to the SAME id,
// silently colliding (a 409 was mistaken for "already created") so only session 1's Calendar
// event ever actually got created. 300 comfortably covers the real max (~140) with room to spare,
// well under Google's 1024-char limit.
export function eventIdForStripeSession(stripeSessionId: string): string {
	return (
		'thbooking' +
		Array.from(stripeSessionId)
			.map((c) => c.charCodeAt(0).toString(32))
			.join('')
			.slice(0, 300)
	);
}

export interface CalendarEventInput {
	stripeSessionId: string;
	summary: string;
	description: string;
	startUtc: string;
	endUtc: string;
}

// Returns true if the event was created, false if it already existed (safe to treat as success).
export async function createCalendarEvent(env: Env, input: CalendarEventInput): Promise<boolean> {
	const token = await getGoogleAccessToken(env);
	const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			id: eventIdForStripeSession(input.stripeSessionId),
			summary: input.summary,
			description: input.description,
			start: { dateTime: input.startUtc },
			end: { dateTime: input.endUtc },
		}),
	});
	if (response.status === 409) return false; // already created by a prior/retried delivery
	if (!response.ok) {
		throw new Error(`Calendar event creation failed: ${response.status} ${await response.text()}`);
	}
	return true;
}

// Delete an event by the same deterministic id createCalendarEvent used (Session 13 cancellations).
// Idempotent: a 404/410 (already gone, e.g. a retried cancellation) is treated as success.
export async function deleteCalendarEvent(env: Env, stripeSessionId: string): Promise<void> {
	const token = await getGoogleAccessToken(env);
	const eventId = eventIdForStripeSession(stripeSessionId);
	const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${eventId}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}` },
	});
	if (response.ok || response.status === 404 || response.status === 410) return;
	throw new Error(`Calendar event deletion failed: ${response.status} ${await response.text()}`);
}
