import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const validBody = {
	name: 'Ada Test',
	email: 'ada@example.com',
	phone: '+447911123456',
	summary: 'A test summary',
	sessionType: 'standard',
	sessionMode: 'online',
	therapyMode: 'individual',
	slotStartUtcs: ['2026-08-03T09:00:00.000Z'],
	cancellationAck: true,
};

async function postBooking(overrides: Record<string, unknown>) {
	return SELF.fetch('http://example.com/booking', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...validBody, ...overrides }),
	});
}

describe('POST /booking validation', () => {
	it('rejects invalid JSON', async () => {
		const response = await SELF.fetch('http://example.com/booking', { method: 'POST', body: 'not json' });
		expect(response.status).toBe(400);
	});

	it('rejects a missing name', async () => {
		const response = await postBooking({ name: '' });
		expect(response.status).toBe(400);
	});

	it('rejects an invalid email', async () => {
		const response = await postBooking({ email: 'not-an-email' });
		expect(response.status).toBe(400);
	});

	it('rejects a missing phone', async () => {
		const response = await postBooking({ phone: '' });
		expect(response.status).toBe(400);
	});

	it('rejects a missing summary', async () => {
		const response = await postBooking({ summary: '' });
		expect(response.status).toBe(400);
	});

	it('rejects an invalid sessionType', async () => {
		const response = await postBooking({ sessionType: 'deluxe' });
		expect(response.status).toBe(400);
	});

	it('rejects an invalid sessionMode', async () => {
		const response = await postBooking({ sessionMode: 'astral' });
		expect(response.status).toBe(400);
	});

	it('rejects an invalid therapyMode', async () => {
		const response = await postBooking({ therapyMode: 'group' });
		expect(response.status).toBe(400);
	});

	it('rejects a missing cancellation acknowledgement', async () => {
		const response = await postBooking({ cancellationAck: false });
		expect(response.status).toBe(400);
	});

	describe('slotStartUtcs', () => {
		it('rejects a non-array value', async () => {
			const response = await postBooking({ slotStartUtcs: '2026-08-03T09:00:00.000Z' });
			expect(response.status).toBe(400);
		});

		it('rejects an empty array', async () => {
			const response = await postBooking({ slotStartUtcs: [] });
			expect(response.status).toBe(400);
		});

		it('rejects more than 20 entries', async () => {
			const slots = Array.from({ length: 21 }, (_, i) => `2026-08-${10 + i}T09:00:00.000Z`);
			const response = await postBooking({ slotStartUtcs: slots });
			expect(response.status).toBe(400);
		});

		it('rejects an invalid ISO instant inside the array', async () => {
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', 'not-a-date'] });
			expect(response.status).toBe(400);
		});

		it('allows multiple different day/times in the first (reference) week', async () => {
			// Monday and Wednesday of the same (first) week — now a valid pattern-establishing week.
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-05T09:00:00.000Z'] });
			expect(response.status).not.toBe(400);
		});

		it('rejects a duplicate day/time within the same week', async () => {
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-03T09:00:00.000Z'] });
			expect(response.status).toBe(400);
		});

		it('rejects a later week using a pattern not established in the first week', async () => {
			// Week 1: Monday 09:00 only. Week 2: Wednesday 09:00 — not in the reference pattern set.
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-12T09:00:00.000Z'] });
			expect(response.status).toBe(400);
		});

		it("allows a later week to reuse a subset of the first week's patterns", async () => {
			// Week 1: Mon 09:00 + Wed 09:00. Week 2: only Wed 09:00 — a subset, should be fine.
			const response = await postBooking({
				slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-05T09:00:00.000Z', '2026-08-12T09:00:00.000Z'],
			});
			expect(response.status).not.toBe(400);
		});

		it('allows sessions more than a week apart, as long as the day/time pattern matches', async () => {
			// 2026-08-03 and 2026-08-24 are three weeks apart (both Mondays 09:00) — skipping weeks
			// is allowed as long as the pattern from the reference week is kept.
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-24T09:00:00.000Z'] });
			expect(response.status).not.toBe(400);
		});

		it('accepts sessions exactly one week apart, in order', async () => {
			// Validation-only check (this will still 502 past validation since the slot isn't a
			// real available slot in this test environment) — a 400 here would mean the
			// consecutive-week check wrongly rejected a valid weekly selection.
			const response = await postBooking({ slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-10T09:00:00.000Z'] });
			expect(response.status).not.toBe(400);
		});

		it('day-only mode: a single reference-week slot lets a later week pick multiple hours on that same weekday', async () => {
			// Week 1: Monday 09:00 only (single slot => day-only mode). Week 2: Monday 09:00 + 10:00 —
			// same weekday as the reference, different hours, more than one session that week.
			const response = await postBooking({
				slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'],
			});
			expect(response.status).not.toBe(400);
		});

		it('day-only mode: a later week still cannot use a different weekday than the single reference slot', async () => {
			// Week 1: Monday 09:00 only. Week 2: Wednesday 09:00 + 10:00 — wrong weekday entirely,
			// day-only mode only relaxes the HOUR restriction, not the weekday one.
			const response = await postBooking({
				slotStartUtcs: ['2026-08-03T09:00:00.000Z', '2026-08-12T09:00:00.000Z', '2026-08-12T10:00:00.000Z'],
			});
			expect(response.status).toBe(400);
		});
	});
});
