import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eventIdForStripeSession, candidateSlotStarts } from '../src/lib/calendar';
import { getLocalDateParts } from '../src/lib/timezone';
import { BUSINESS_HOURS } from '../src/config';

describe('eventIdForStripeSession', () => {
	it('produces a valid Google Calendar event id (lowercase base32hex, 5-1024 chars)', () => {
		const id = eventIdForStripeSession('cs_test_a1a2hRr1s9dXEsQXiwlfVsIuDqd4guaZ8kSMNZUUEh8syod1MaRiI9acZC');
		expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
	});

	// Regression test for a real bug found via live testing (booking-system-expansion plan,
	// Session 10): a real 3-session booking only produced 1 real Calendar event, because
	// sessions 2 and 3's composite ids ("<stripeSessionId>_s2" / "_s3") both truncated to the
	// identical string — the differentiating suffix sat past the old 100-char cutoff.
	it('gives distinct ids for every session in a 10-session recurring booking', () => {
		const stripeSessionId = 'cs_test_a1a2hRr1s9dXEsQXiwlfVsIuDqd4guaZ8kSMNZUUEh8syod1MaRiI9acZC';
		const ids = [stripeSessionId, ...Array.from({ length: 9 }, (_, i) => `${stripeSessionId}_s${i + 2}`)].map(eventIdForStripeSession);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

// Europe/London calendar date (YYYY-MM-DD) a Date instant falls on.
function londonYmd(d: Date): string {
	const { year, month, day } = getLocalDateParts(d, BUSINESS_HOURS.timeZone);
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

describe('same-day booking cutoff (candidateSlotStarts)', () => {
	// 2026-07-15 is a Wednesday; +01:00 pins the instant to Europe/London (BST) unambiguously.
	it('before 18:00 London, the earliest candidate is tomorrow', () => {
		const now = new Date('2026-07-15T17:59:00+01:00');
		const starts = candidateSlotStarts(now);
		expect(londonYmd(starts[0])).toBe('2026-07-16'); // Thursday
	});

	it('at/after 18:00 London, the 18:00 rollover pushes the earliest candidate to the day after tomorrow', () => {
		const now = new Date('2026-07-15T18:00:00+01:00');
		const starts = candidateSlotStarts(now);
		expect(londonYmd(starts[0])).toBe('2026-07-17'); // Friday
	});
});

describe('getSlotStatuses', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Mocks the OAuth token, the Calendar freebusy endpoint (with `busy`), and the gov.uk holidays
	// endpoint (with `holidayDates` -> the shared title). resetModules + dynamic import gives each
	// test a fresh holidays/token module cache so its own fixture is actually fetched.
	async function loadWithMocks(busy: Array<{ start: string; end: string }>, holidayDates: string[]) {
		const holidayTitle = 'Test Bank Holiday';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('oauth2.googleapis.com')) {
					return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
				}
				if (url.includes('/freeBusy')) {
					return new Response(JSON.stringify({ calendars: { [env.GOOGLE_CALENDAR_ID]: { busy } } }), { status: 200 });
				}
				if (url.includes('gov.uk/bank-holidays.json')) {
					const events = holidayDates.map((date) => ({ title: holidayTitle, date }));
					return new Response(JSON.stringify({ 'england-and-wales': { events } }), { status: 200 });
				}
				throw new Error(`unexpected fetch in test: ${url}`);
			}),
		);
		vi.resetModules();
		const { getSlotStatuses, candidateSlotStarts: fresh } = await import('../src/lib/calendar');
		return { getSlotStatuses, candidateSlotStarts: fresh, holidayTitle };
	}

	// Busy range covering exactly one candidate slot (its 50-minute standard duration).
	function busyFor(slotStart: Date): { start: string; end: string } {
		return { start: slotStart.toISOString(), end: new Date(slotStart.getTime() + 50 * 60_000).toISOString() };
	}

	it("labels a busy slot on a non-holiday date 'reserved'", async () => {
		const target = candidateSlotStarts(new Date())[0];
		const { getSlotStatuses } = await loadWithMocks([busyFor(target)], []);
		const detail = (await getSlotStatuses(env, 'standard')).find((s) => s.iso === target.toISOString());
		expect(detail).toEqual({ iso: target.toISOString(), status: 'reserved' });
	});

	it("labels a busy slot on a UK bank-holiday date 'holiday' with the holiday title", async () => {
		const target = candidateSlotStarts(new Date())[0];
		const { getSlotStatuses, holidayTitle } = await loadWithMocks([busyFor(target)], [londonYmd(target)]);
		const detail = (await getSlotStatuses(env, 'standard')).find((s) => s.iso === target.toISOString());
		expect(detail).toEqual({ iso: target.toISOString(), status: 'holiday', holidayTitle });
	});

	it("keeps a holiday-date slot 'available' when it is not actually busy (deleted-placeholder override)", async () => {
		const target = candidateSlotStarts(new Date())[0];
		const { getSlotStatuses } = await loadWithMocks([], [londonYmd(target)]);
		const detail = (await getSlotStatuses(env, 'standard')).find((s) => s.iso === target.toISOString());
		expect(detail).toEqual({ iso: target.toISOString(), status: 'available' });
	});
});
