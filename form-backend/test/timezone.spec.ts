import { describe, it, expect } from 'vitest';
import { detectTimezoneFromPhone, computeReminderDueUtc } from '../src/lib/timezone';

describe('detectTimezoneFromPhone', () => {
	it('detects UK numbers', () => {
		expect(detectTimezoneFromPhone('+447911123456')).toBe('Europe/London');
	});

	it('detects Turkish numbers', () => {
		expect(detectTimezoneFromPhone('+905321234567')).toBe('Europe/Istanbul');
	});

	it('falls back to a single representative zone for a multi-timezone country (US)', () => {
		// A Los Angeles-area number is still mapped to the US's representative zone
		// (America/New_York) — the documented conscious simplification, not a bug.
		expect(detectTimezoneFromPhone('+12135551234')).toBe('America/New_York');
	});

	it('falls back to a single representative zone for a multi-timezone country (Russia)', () => {
		// A Vladivostok-area number is still mapped to Russia's representative zone
		// (Europe/Moscow) — same documented simplification.
		expect(detectTimezoneFromPhone('+74232123456')).toBe('Europe/Moscow');
	});

	it('falls back to Europe/London for an unparseable number', () => {
		expect(detectTimezoneFromPhone('not-a-phone-number')).toBe('Europe/London');
	});
});

describe('computeReminderDueUtc', () => {
	it('computes 13:00 local the day before, converted to UTC (Europe/London, GMT)', () => {
		// 2026-01-20 10:00 UTC (London is GMT, no offset, in January)
		const appointment = new Date('2026-01-20T10:00:00Z');
		const due = computeReminderDueUtc(appointment, 'Europe/London');
		expect(due.toISOString()).toBe('2026-01-19T13:00:00.000Z');
	});

	it('computes 13:00 local the day before, converted to UTC (Europe/London, BST)', () => {
		// 2026-07-20 10:00 UTC — London is BST (+1) in July, so 13:00 local is 12:00 UTC.
		const appointment = new Date('2026-07-20T10:00:00Z');
		const due = computeReminderDueUtc(appointment, 'Europe/London');
		expect(due.toISOString()).toBe('2026-07-19T12:00:00.000Z');
	});

	it('uses the client-local calendar date, which can differ from the UTC calendar date', () => {
		// 2026-07-20 01:00 UTC is already 2026-07-20 11:00 in Australia/Sydney (AEST, UTC+10 —
		// July is southern winter, no DST), so "the day before" must be read off the Sydney
		// date (2026-07-20), not by coincidentally matching the UTC date.
		const appointment = new Date('2026-07-20T01:00:00Z');
		const due = computeReminderDueUtc(appointment, 'Australia/Sydney');
		// 2026-07-19 13:00 Sydney (UTC+10) = 03:00 UTC
		expect(due.toISOString()).toBe('2026-07-19T03:00:00.000Z');
	});
});
