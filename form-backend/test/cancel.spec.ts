import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleCancelGet, handleCancelPost } from '../src/routes/cancel';
import { computeRefund } from '../src/lib/refund';
import { signCancelToken } from '../src/lib/cancel-link';
import { SHEET_COLUMNS } from '../src/config';
import type { SheetRow } from '../src/types';

afterEach(() => {
	vi.unstubAllGlobals();
});

const SESSION_ID = 'cs_test_cancel_1';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const futureHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function makeRow(overrides: Partial<Record<keyof SheetRow, string>>): SheetRow {
	const row = {} as SheetRow;
	for (const key of SHEET_COLUMNS) row[key] = '';
	Object.assign(row, overrides);
	return row;
}

function rowArray(row: SheetRow): string[] {
	return SHEET_COLUMNS.map((key) => row[key] ?? '');
}

// --- Pure refund math (no I/O) -------------------------------------------------------------

describe('computeRefund', () => {
	const now = new Date();

	// Re-decided rule (2026-07-23): the tier is recomputed at cancellation time from hours-until
	// the soonest still-upcoming session — NOT read from the stale booking-time `policyTier`
	// column — and the resulting rate applies uniformly to every remaining session, regardless of
	// how many remain. This replaces Session 13's separate "3+ remaining" special case.

	it('plenty of notice on the soonest remaining session (>=72h): full refund, any session count', () => {
		// priceGBP is the per-session price (see refund.ts unit-price note): £120 each.
		const row = makeRow({
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(7),
			session2StartUtc: future(14),
			session3StartUtc: future(21),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(3);
		expect(result.refundGBP).toBe(360); // 3 * 120 * 1.0 — no forfeiture, notice was ample
		expect(result.refundPence).toBe(36000);
		expect(result.refundPercent).toBe(100);
	});

	it('short notice on the soonest remaining session (<24h): 50% refund, even with 3+ remaining', () => {
		// Same shape as the case above, except the soonest remaining session is now imminent —
		// this is the exact scenario that used to always forfeit the soonest 100% regardless of
		// notice; now it follows the same tier rule as every other case.
		const row = makeRow({
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72', // stale booking-time value — must be ignored
			appointmentStartUtc: futureHours(10),
			session2StartUtc: future(7),
			session3StartUtc: future(14),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(3);
		expect(result.refundGBP).toBe(180); // 3 * 120 * 0.5
		expect(result.refundPercent).toBe(50);
	});

	it('1 remaining, plenty of notice (>=72h): full refund', () => {
		const row = makeRow({ sessionCount: '1', priceGBP: '120', policyTier: '72', appointmentStartUtc: future(5) });
		const result = computeRefund(row, now);
		expect(result.refundGBP).toBe(120);
		expect(result.refundPercent).toBe(100);
	});

	it('regression: stale booking-time policyTier=72 must not override a real short-notice cancellation', () => {
		// Exactly the bug report: a 2-session package booked far in advance (policyTier locked in
		// as 72 at booking time), session 1 already attended (past), and the client cancels the
		// remaining session with only ~11 hours' notice. Must be 50%, not the stale 100%.
		const row = makeRow({
			sessionCount: '2',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: past(7), // session 1 already happened
			session2StartUtc: futureHours(11),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(1);
		expect(result.refundGBP).toBe(60);
		expect(result.refundPercent).toBe(50);
	});

	it('2 remaining, borderline notice (~60h, between 48 and 72): 50% refund', () => {
		const row = makeRow({
			sessionCount: '2',
			priceGBP: '120',
			policyTier: '48',
			appointmentStartUtc: futureHours(60),
			session2StartUtc: future(9),
		});
		const result = computeRefund(row, now);
		expect(result.refundGBP).toBe(120); // 2 * 120 * 0.5
		expect(result.refundPercent).toBe(50);
	});

	it('no future sessions: nothing to refund', () => {
		const row = makeRow({ sessionCount: '2', priceGBP: '120', policyTier: '72', appointmentStartUtc: past(7), session2StartUtc: past(1) });
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(0);
		expect(result.refundGBP).toBe(0);
		expect(result.refundPence).toBe(0);
	});
});

// --- Route behaviour (mocked Google/Stripe/WhatsApp) ---------------------------------------

interface Call {
	url: string;
	method: string;
	body: string;
}

// Stateful fake so the full cancel cascade can run against `fetch`. `row` is what getRow returns.
// `failWhatsApp` simulates the real, currently-expected state (the 2 cancellation templates aren't
// Meta-approved yet, so a real send 132001s) without needing a second stub function.
function stubApis(row: SheetRow, failWhatsApp = false) {
	const calls: Call[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		calls.push({ url, method, body: String(init?.body ?? '') });

		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('sheets.googleapis.com')) {
			if (url.endsWith('A2%3AA')) return new Response(JSON.stringify({ values: [[row.stripeSessionId]] }), { status: 200 }); // findRow -> row 2
			if (method === 'PUT') return new Response('{}', { status: 200 }); // writeCell
			return new Response(JSON.stringify({ values: [rowArray(row)] }), { status: 200 }); // getRow
		}
		if (url.includes('api.stripe.com/v1/checkout/sessions')) {
			return new Response(JSON.stringify({ id: row.stripeSessionId, payment_intent: 'pi_test_123' }), { status: 200 });
		}
		if (url.includes('api.stripe.com/v1/refunds')) {
			return new Response(JSON.stringify({ id: 're_test_1' }), { status: 200 });
		}
		if (url.includes('/calendar/v3')) return new Response('{}', { status: 200 }); // event delete
		if (url.includes('graph.facebook.com')) {
			if (failWhatsApp) {
				return new Response('{"error":{"message":"template name does not exist","code":132001}}', { status: 404 });
			}
			return new Response('{}', { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return calls;
}

async function getCancel(token: string) {
	return handleCancelGet(new Request(`http://example.com/cancel?session=${SESSION_ID}&token=${token}`), env);
}

async function postCancel(token: string, reason?: string) {
	return handleCancelPost(
		new Request('http://example.com/cancel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ session: SESSION_ID, token, reason }),
		}),
		env,
	);
}

describe('GET /cancel', () => {
	it('rejects an invalid token', async () => {
		stubApis(makeRow({ stripeSessionId: SESSION_ID }));
		const response = await getCancel('deadbeef');
		expect(response.status).toBe(401);
	});

	it('returns a refund preview for a valid token without mutating anything', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			sessionCount: '1',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(5),
			clientTimeZone: 'Europe/London',
		});
		const calls = stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await getCancel(token);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { refundGBP: number; refundPercent: number; alreadyCancelled: boolean };
		expect(data.refundGBP).toBe(120);
		expect(data.refundPercent).toBe(100);
		expect(data.alreadyCancelled).toBe(false);
		// Preview only: no Stripe refund, no writes, no WhatsApp.
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/refunds'))).toBe(false);
		expect(calls.some((c) => c.method === 'PUT')).toBe(false);
		expect(calls.some((c) => c.url.includes('graph.facebook.com'))).toBe(false);
	});
});

describe('POST /cancel', () => {
	it('rejects an invalid token', async () => {
		stubApis(makeRow({ stripeSessionId: SESSION_ID }));
		const response = await postCancel('deadbeef');
		expect(response.status).toBe(401);
	});

	it('performs the full cancellation: Stripe refund + calendar delete + sheets writes + 2 WhatsApp', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			phone: '447911123456',
			sessionCount: '1',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(5),
			clientTimeZone: 'Europe/London',
		});
		const calls = stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token, 'Feeling better, thank you');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { cancelled: boolean; refundGBP: number };
		expect(data.cancelled).toBe(true);
		expect(data.refundGBP).toBe(120);

		const refundCall = calls.find((c) => c.url.includes('api.stripe.com/v1/refunds'));
		expect(refundCall).toBeDefined();
		expect(refundCall!.body).toContain('amount=12000'); // £120 in pence
		expect(calls.filter((c) => c.url.includes('/calendar/v3') && c.method === 'DELETE').length).toBe(1);
		expect(calls.filter((c) => c.url.includes('graph.facebook.com')).length).toBe(2); // client + Selen
	});

	it('still reports success when the (not-yet-Meta-approved) WhatsApp templates fail', async () => {
		// Found live (2026-07-22): before this guard, a real cancellation actually refunded, deleted
		// the Calendar event and wrote the Sheets row correctly, but the client still got a 500
		// "could not complete the cancellation" response purely because the WhatsApp templates aren't
		// approved yet — the money/calendar/sheets side effects must not be reported as a failure.
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			phone: '447911123456',
			sessionCount: '1',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(5),
			clientTimeZone: 'Europe/London',
		});
		const calls = stubApis(row, true);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { cancelled: boolean; refundGBP: number };
		expect(data.cancelled).toBe(true);
		expect(data.refundGBP).toBe(120);

		// The parts that actually matter still went through despite the WhatsApp failure.
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/refunds'))).toBe(true);
		expect(calls.filter((c) => c.url.includes('/calendar/v3') && c.method === 'DELETE').length).toBe(1);
		// cancellationReason/stripeRefundId/refundPercent/refundAmount/cancelledAt + the 3 cleared
		// session-1 columns (appointmentStartUtc/reminderDueUtc/reminderSentAt) = 8 writeCell calls.
		expect(calls.filter((c) => c.url.includes('sheets.googleapis.com') && c.method === 'PUT').length).toBe(8);
	});

	it('is idempotent: an already-cancelled row does not refund or notify again', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			sessionCount: '1',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(5),
			cancelledAt: past(1),
			refundAmount: '120',
			refundPercent: '100',
		});
		const calls = stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { alreadyCancelled: boolean };
		expect(data.alreadyCancelled).toBe(true);
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/refunds'))).toBe(false);
		expect(calls.some((c) => c.url.includes('graph.facebook.com'))).toBe(false);
	});

	it('skips the Stripe refund when the amount is 0 (no future sessions) but still records the cancellation', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			phone: '447911123456',
			sessionCount: '1',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: past(5),
			clientTimeZone: 'Europe/London',
		});
		const calls = stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { cancelled: boolean; refundGBP: number };
		expect(data.cancelled).toBe(true);
		expect(data.refundGBP).toBe(0);
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/refunds'))).toBe(false); // Stripe rejects a 0 refund
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/checkout/sessions'))).toBe(false); // not even retrieved
		expect(calls.filter((c) => c.url.includes('graph.facebook.com')).length).toBe(2); // still notified
	});
});
