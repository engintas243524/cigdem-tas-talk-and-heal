import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleCancelGet, handleCancelPost } from '../src/routes/cancel';
import { computeRefund } from '../src/lib/refund';
import { signCancelToken } from '../src/lib/cancel-link';
import { SHEET_COLUMNS, TEMP_EMAIL_TO_WHATSAPP_NUMBER } from '../src/config';
import { isHeaderRequest, headerResponse } from './sheets-test-header';
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

	// Re-decided rule (2026-07-26): each remaining session is judged on ITS OWN notice period,
	// independent of its position (1st/2nd/.../Xth) and independent of every other remaining
	// session — not one shared rate derived from the soonest session and applied to all. Same day,
	// second policy change: under 72h now forfeits the FULL amount (0%), not 50%.

	it('plenty of notice on every remaining session (>=72h): full refund, any session count', () => {
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

	it('short notice on every remaining session (<72h each): 0% refund, even with 3+ remaining', () => {
		const row = makeRow({
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72', // stale booking-time value — must be ignored
			appointmentStartUtc: futureHours(10),
			session2StartUtc: futureHours(15),
			session3StartUtc: futureHours(20),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(3);
		expect(result.refundGBP).toBe(0); // all 3 forfeit fully — under 72h notice
		expect(result.refundPercent).toBe(0);
	});

	it('mixed notice across remaining sessions: each judged independently, not by the soonest', () => {
		// The soonest session (10h out) is short-notice; the other two (7 and 14 days out) are not.
		// Under the old "one rate for all" rule this whole cancellation would have forfeited 100%
		// across the board; the corrected rule only forfeits the session that's actually short-notice.
		const row = makeRow({
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: futureHours(10),
			session2StartUtc: future(7),
			session3StartUtc: future(14),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(3);
		expect(result.refundGBP).toBe(240); // 120*0 + 120*1.0 + 120*1.0
		expect(result.refundPercent).toBe(67); // 240/360 rounded
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
		// remaining session with only ~11 hours' notice. Must forfeit fully, not the stale 100%.
		const row = makeRow({
			sessionCount: '2',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: past(7), // session 1 already happened
			session2StartUtc: futureHours(11),
		});
		const result = computeRefund(row, now);
		expect(result.remaining.length).toBe(1);
		expect(result.refundGBP).toBe(0);
		expect(result.refundPercent).toBe(0);
	});

	it('2 remaining, one borderline (~60h, under 72) one far out: only the borderline one forfeits', () => {
		const row = makeRow({
			sessionCount: '2',
			priceGBP: '120',
			policyTier: '48',
			appointmentStartUtc: futureHours(60),
			session2StartUtc: future(9),
		});
		const result = computeRefund(row, now);
		expect(result.refundGBP).toBe(120); // 120*0 (60h session) + 120*1.0 (9-day session)
		expect(result.refundPercent).toBe(50); // 120/240 rounded
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
function stubApis(row: SheetRow, failWhatsApp = false, failEmailToWhatsAppFallback = false) {
	const calls: Call[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		calls.push({ url, method, body: String(init?.body ?? '') });

		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('sheets.googleapis.com')) {
			if (isHeaderRequest(url)) return headerResponse();
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
			if (failEmailToWhatsAppFallback) {
				const parsedBody = JSON.parse(String(init?.body ?? '{}'));
				if (parsedBody.type === 'text' && parsedBody.to === TEMP_EMAIL_TO_WHATSAPP_NUMBER) {
					return new Response('{"error":{"message":"outside 24h window","code":131047}}', { status: 400 });
				}
			}
			return new Response('{}', { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return calls;
}

async function getCancel(token: string, sessions?: string) {
	const qs = sessions ? `&sessions=${sessions}` : '';
	return handleCancelGet(new Request(`http://example.com/cancel?session=${SESSION_ID}&token=${token}${qs}`), env);
}

async function postCancel(token: string, reason?: string, sessionIndexes?: number[]) {
	return handleCancelPost(
		new Request('http://example.com/cancel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ session: SESSION_ID, token, reason, sessionIndexes }),
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

	it('lists every remaining session individually, and narrows the refund to a chosen subset', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(7),
			session2StartUtc: future(14),
			session3StartUtc: future(21),
			clientTimeZone: 'Europe/London',
		});
		stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const all = await getCancel(token);
		const allData = (await all.json()) as { sessions: { index: number; startUtc: string }[]; refundGBP: number };
		expect(allData.sessions.length).toBe(3);
		expect(allData.refundGBP).toBe(360); // every remaining session, ample notice

		const subset = await getCancel(token, '2');
		const subsetData = (await subset.json()) as { sessions: { index: number }[]; refundGBP: number };
		expect(subsetData.sessions.length).toBe(3); // full list still returned, for checkbox rendering
		expect(subsetData.refundGBP).toBe(120); // refund narrowed to just session 2
	});
});

describe('POST /cancel', () => {
	it('rejects an invalid token', async () => {
		stubApis(makeRow({ stripeSessionId: SESSION_ID }));
		const response = await postCancel('deadbeef');
		expect(response.status).toBe(401);
	});

	it('performs the full cancellation: Stripe refund + calendar delete + sheets writes + 3 WhatsApp', async () => {
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
		expect(calls.filter((c) => c.url.includes('graph.facebook.com')).length).toBe(3); // client + Selen + email-to-WhatsApp fallback

		const textMessages = calls
			.filter((c) => c.url.includes('graph.facebook.com'))
			.map((c) => JSON.parse(c.body))
			.filter((body) => body.type === 'text');
		expect(textMessages.length).toBe(1);
		expect(textMessages[0].to).toBe(TEMP_EMAIL_TO_WHATSAPP_NUMBER);
		expect(textMessages[0].text.body).toContain('Ada');
		expect(textMessages[0].text.body).toContain('cancellation has been processed');
	});

	it('still completes the cancellation when only the email-to-WhatsApp fallback fails', async () => {
		// Own try/catch around the fallback send (cancellation.ts) must isolate its failure from the
		// refund/calendar/sheets work already committed above it.
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
		const calls = stubApis(row, false, true);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token, 'Feeling better, thank you');

		expect(response.status).toBe(200); // fallback failing must not undo the refund/calendar/sheets work
		const data = (await response.json()) as { cancelled: boolean };
		expect(data.cancelled).toBe(true);
		expect(calls.some((c) => c.url.includes('api.stripe.com/v1/refunds'))).toBe(true);
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
		// cancellationReason/cancelledBy/stripeRefundId/refundPercent/refundAmount/activeSessionCount/
		// cancelledAt + the 3 cleared session-1 columns (appointmentStartUtc/reminderDueUtc/
		// reminderSentAt) = 10 writes.
		expect(calls.filter((c) => c.url.includes('sheets.googleapis.com') && c.method === 'PUT').length).toBe(10);
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
		expect(calls.filter((c) => c.url.includes('graph.facebook.com')).length).toBe(3); // still notified + email-to-WhatsApp fallback
	});

	it('cancels only the chosen sessions, leaving the booking (and the other sessions) live', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			phone: '447911123456',
			sessionCount: '3',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: future(7),
			session2StartUtc: future(14),
			session3StartUtc: future(21),
			clientTimeZone: 'Europe/London',
		});
		const calls = stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token, 'schedule conflict', [2]);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { cancelled: boolean; refundGBP: number };
		expect(data.cancelled).toBe(true);
		expect(data.refundGBP).toBe(120); // just session 2's price, ample notice

		expect(calls.filter((c) => c.url.includes('/calendar/v3') && c.method === 'DELETE').length).toBe(1);
		// Partial cancellation: cancellationReason/cancelledBy/stripeRefundId/refundPercent/refundAmount/
		// activeSessionCount (6) + session 2's 3 cleared columns = 9 fields, each mirrored to the
		// "3 Seans" tab (sessionCount>1) = 18 PUTs. cancelledAt must NOT be among them — the booking
		// as a whole is still live.
		expect(calls.filter((c) => c.url.includes('sheets.googleapis.com') && c.method === 'PUT').length).toBe(18);
		// activeSessionCount = 3 populated sessions - 1 just cancelled = 2 (column CC, per SHEET_COLUMNS).
		const activeCountWrite = calls.find((c) => c.method === 'PUT' && c.url.includes('CC2'));
		expect(activeCountWrite?.body).toBe('{"values":[["2"]]}');
		// cancelledBy: the client's own /cancel link always records 'Danışan', never 'Çiğdem'.
		const cancelledByWrite = calls.find((c) => c.method === 'PUT' && c.url.includes('BY2'));
		expect(cancelledByWrite?.body).toBe('{"values":[["Danışan"]]}');
	});

	it('rejects a sessionIndexes selection that includes an already-past/invalid session', async () => {
		const row = makeRow({
			stripeSessionId: SESSION_ID,
			name: 'Ada',
			sessionCount: '2',
			priceGBP: '120',
			policyTier: '72',
			appointmentStartUtc: past(1), // session 1 already happened
			session2StartUtc: future(7),
		});
		stubApis(row);
		const token = await signCancelToken(env, SESSION_ID);

		const response = await postCancel(token, undefined, [1, 2]);
		expect(response.status).toBe(400);
	});
});
