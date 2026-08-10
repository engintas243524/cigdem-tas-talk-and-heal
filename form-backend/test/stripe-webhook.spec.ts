import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleStripeWebhook } from '../src/routes/stripe-webhook';
import { constructStripeEvent } from '../src/lib/stripe';
import { SHEET_COLUMNS } from '../src/config';
import { isHeaderRequest, headerResponse } from './sheets-test-header';

vi.mock('../src/lib/stripe', () => ({ constructStripeEvent: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.mocked(constructStripeEvent).mockReset();
});

const METADATA = {
	name: 'Ada Test',
	email: 'ada@example.com',
	phone: '447911123456',
	summary: 'A test summary',
	sessionType: 'standard',
	sessionMode: 'online',
	therapyMode: 'individual',
	priceGBP: '120',
	sessionCount: '1',
	policyTier: '72',
	slotStartUtcsJson: JSON.stringify(['2026-08-03T09:00:00.000Z']),
	clientTimeZone: 'Europe/London',
};

function completedEvent() {
	return { type: 'checkout.session.completed', data: { object: { id: 'cs_test_123', metadata: METADATA } } };
}

const STUB_SUMMARY = 'Client wants to discuss work stress.';

// Workers AI has no local-emulation mode in the test pool (see wrangler.test.jsonc), so env.AI is
// stubbed directly. `shouldFail` exercises summarizeNote's fallback-to-raw-text path.
function stubAi(shouldFail = false) {
	env.AI = {
		run: vi.fn(async () => {
			if (shouldFail) throw new Error('Workers AI unavailable');
			return { response: STUB_SUMMARY };
		}),
	} as unknown as Ai;
}

function postWebhook() {
	return handleStripeWebhook(
		new Request('http://example.com/webhook/stripe', { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' }),
		env,
	);
}

// Stateful fake of Calendar/Sheets/WhatsApp/Email/OAuth so the full cascade can run against
// `fetch` without hitting real APIs. `confirmationAlreadySent` simulates a retried delivery.
function stubApis(confirmationAlreadySent: boolean, failClientEmail = false, failEmailToWhatsAppFallback = false) {
	const row = new Array(SHEET_COLUMNS.length).fill('');
	row[SHEET_COLUMNS.indexOf('stripeSessionId')] = 'cs_test_123';
	if (confirmationAlreadySent) row[SHEET_COLUMNS.indexOf('confirmationSentAt')] = '2026-08-01T00:00:00.000Z';
	let appended = confirmationAlreadySent;
	const putBodies: string[] = [];

	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('oauth2.googleapis.com'))
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		if (url.includes('/calendar/v3')) return new Response('{}', { status: 200 });
		if (url.includes('sheets.googleapis.com')) {
			if (isHeaderRequest(url)) return headerResponse();
			// Capture the row-population body — appendBookingRow now writes it via a single
			// values:batchUpdate POST (one entry per field) instead of one contiguous PUT — plus any
			// later single-cell PUT (guard timestamps etc.) — so a test can assert derived cell values
			// like sessionDurationMinutes actually land somewhere in the row.
			if (init?.method === 'PUT' && !url.includes(':append')) putBodies.push(String(init.body ?? ''));
			if (init?.method === 'POST' && url.includes(':batchUpdate')) putBodies.push(String(init.body ?? ''));
			if (url.includes(':append')) {
				appended = true;
				// Real shape of a Sheets values:append response — appendBookingRow reads the row
				// number straight out of `updates.updatedRange` (see lib/sheets.ts).
				return new Response(JSON.stringify({ updates: { updatedRange: 'Sayfa1!A2:AV2' } }), { status: 200 });
			}
			// findRowBySessionId's range is always exactly "A2:A" (whole column, no row number
			// after) — must check the URL *ends* there, not just contains it, since getRow's own
			// range ("A2:<lastCol>2") also contains "A2:A" as a substring once the sheet has more
			// than 26 columns and the last column letter starts with "A" (e.g. "AV").
			if (url.endsWith('A2%3AA')) {
				return new Response(JSON.stringify({ values: appended ? [[row[0]]] : [] }), { status: 200 });
			}
			return new Response(JSON.stringify({ values: appended ? [row] : [] }), { status: 200 }); // getRow
		}
		if (url.includes('graph.facebook.com')) {
			// Match the fallback specifically by its `type: "text"` + `to` fields (not just any
			// graph.facebook.com call) — the template sends (client confirm + Selen x2) must keep
			// succeeding even when only the fallback is made to fail.
			if (failEmailToWhatsAppFallback) {
				const body = JSON.parse(String(init?.body ?? '{}'));
				if (body.type === 'text' && body.to === env.SELEN_WHATSAPP_NUMBER) {
					return new Response('{"error":{"message":"outside 24h window","code":131047}}', { status: 400 });
				}
			}
			return new Response('{}', { status: 200 });
		}
		if (url.includes('api.resend.com')) {
			// Optionally simulate Resend's real sandbox restriction (send-to-client fails, e.g.
			// unverified domain) without touching Selen's own email — the real constraint documented
			// in config.ts's EMAIL_FROM comment. Must match the `to` field specifically, not just any
			// mention of the client's email — Selen's own notification email's BODY TEXT also mentions
			// the client's email as contact info, so a loose substring match would wrongly fail that
			// unrelated, unguarded send too.
			if (failClientEmail && String(init?.body ?? '').includes(`"to":["${METADATA.email}"]`)) {
				return new Response('{"message":"You can only send testing emails to your own email address"}', { status: 403 });
			}
			return new Response('{}', { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { fetchMock, putBodies };
}

describe('POST /webhook/stripe', () => {
	it('rejects a request with no stripe-signature header', async () => {
		const response = await handleStripeWebhook(new Request('http://example.com/webhook/stripe', { method: 'POST', body: '{}' }), env);
		expect(response.status).toBe(400);
	});

	it('rejects an invalid signature', async () => {
		vi.mocked(constructStripeEvent).mockRejectedValue(new Error('bad signature'));
		const response = await postWebhook();
		expect(response.status).toBe(400);
	});

	it('ignores event types other than checkout.session.completed', async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue({ type: 'payment_intent.created' } as never);
		const response = await postWebhook();
		expect(response.status).toBe(200);
	});

	it('runs the full booking cascade on a first delivery: calendar + sheets + 4 WhatsApp sends + 2 emails', async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock, putBodies } = stubApis(false);

		const response = await postWebhook();

		expect(response.status).toBe(200);
		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.some((u) => u.includes('/calendar/v3'))).toBe(true);
		expect(calls.some((u) => u.includes(':append'))).toBe(true);
		expect(calls.filter((u) => u.includes('graph.facebook.com')).length).toBe(4); // client confirm + email-to-WhatsApp fallback + Selen x2
		expect(calls.filter((u) => u.includes('api.resend.com')).length).toBe(2); // client confirmation + Selen notice
		// The derived "Seans Süresi" cell lands in the appended row (standard => "50 dk").
		expect(putBodies.some((b) => b.includes('50 dk'))).toBe(true);
	});

	it('sends the email-to-WhatsApp fallback to env.SELEN_WHATSAPP_NUMBER, but never leaks the cancel link there', async () => {
		// The existing "4 WhatsApp sends" test above only counts calls — it would still pass if the
		// fallback silently went to the wrong number or leaked the cancel link. This asserts on the
		// actual destination/content of that specific call. The cancel link is a bearer capability
		// token (whoever has it can cancel + trigger a refund for this booking) — it must only ever
		// reach the client's real email, never the fixed fallback number (security review finding,
		// 2026-08-02).
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock } = stubApis(false);

		await postWebhook();

		const textMessages = fetchMock.mock.calls
			.filter(([u]) => String(u).includes('graph.facebook.com'))
			.map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
			.filter((body) => body.type === 'text');
		expect(textMessages.length).toBe(1);
		expect(textMessages[0].to).toBe(env.SELEN_WHATSAPP_NUMBER);
		expect(textMessages[0].text.body).toContain(METADATA.name);
		expect(textMessages[0].text.body).toContain('Your booking is confirmed');
		expect(textMessages[0].text.body).not.toContain('/cancel?session='); // no cancel-link path leaked

		const emailCall = fetchMock.mock.calls.find(([u]) => String(u).includes('api.resend.com'));
		expect(String(emailCall?.[1]?.body ?? '')).toContain('/cancel?session='); // the real email still gets it
	});

	it('still writes the confirmation guard cell when only the email-to-WhatsApp fallback fails', async () => {
		// Own try/catch around the fallback send (stripe-webhook.ts) must isolate its failure from
		// the guard write, same as the client-email isolation tested below — otherwise a retry would
		// re-send the client's real WhatsApp template confirmation forever.
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock, putBodies } = stubApis(false, false, true);

		const response = await postWebhook();

		expect(response.status).toBe(200); // fallback failing must not break the booking cascade
		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.filter((u) => u.includes('graph.facebook.com')).length).toBe(4); // attempted, even though the fallback one 400s
		expect(putBodies.length).toBeGreaterThanOrEqual(2); // guard cell (confirmationSentAt) still written
	});

	it("sends the AI-condensed summary — not the client's raw note — to Sheets and Selen", async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock, putBodies } = stubApis(false);

		await postWebhook();

		expect(putBodies.some((b) => b.includes(STUB_SUMMARY))).toBe(true);
		expect(putBodies.some((b) => b.includes(METADATA.summary))).toBe(false);
		const whatsappBodies = fetchMock.mock.calls
			.filter(([u]) => String(u).includes('graph.facebook.com'))
			.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''));
		expect(whatsappBodies.some((b) => b.includes(STUB_SUMMARY))).toBe(true);
	});

	it('falls back to the raw note when Workers AI summarization fails, without blocking the booking', async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi(true);
		const { fetchMock } = stubApis(false);

		const response = await postWebhook();

		expect(response.status).toBe(200); // AI failing must never break the booking cascade
		const whatsappBodies = fetchMock.mock.calls
			.filter(([u]) => String(u).includes('graph.facebook.com'))
			.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''));
		expect(whatsappBodies.some((b) => b.includes(METADATA.summary))).toBe(true);
	});

	it('does not block confirmation or repeat the WhatsApp send when the client email fails (Resend sandbox restriction)', async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock, putBodies } = stubApis(false, true);

		const response = await postWebhook();
		expect(response.status).toBe(200); // the whole cascade must not 500 just because email failed

		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.filter((u) => u.includes('graph.facebook.com')).length).toBe(4); // client confirm + email-to-WhatsApp fallback + Selen x2, unaffected
		// confirmationSentAt must still get written (guard cell) even though the email failed —
		// otherwise a Stripe webhook retry would re-send the WhatsApp confirmation to the client
		// on every retry, forever, since the email will keep failing until Phase 5's domain switch.
		// The initial row-population PUT plus this guard-cell PUT means at least 2 non-append PUTs.
		expect(putBodies.length).toBeGreaterThanOrEqual(2);
	});

	it('skips the client confirmation on a retried delivery but still notifies Selen', async () => {
		vi.mocked(constructStripeEvent).mockResolvedValue(completedEvent() as never);
		stubAi();
		const { fetchMock } = stubApis(true);

		const response = await postWebhook();

		expect(response.status).toBe(200);
		const calls = fetchMock.mock.calls.map(([u]) => String(u));
		expect(calls.filter((u) => u.includes('graph.facebook.com')).length).toBe(2); // Selen only, client skipped
		expect(calls.filter((u) => u.includes('api.resend.com')).length).toBe(1); // Selen notice only, client email skipped
	});
});
