import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { appendBookingRow, emptySheetRow } from '../src/lib/sheets';

afterEach(() => {
	vi.unstubAllGlobals();
});

// Real bugs found via live testing (booking-system-expansion plan): appending the full ~48-column
// row in one call let Google's table-detection heuristic anchor to unrelated stray data in
// far-right columns, silently writing bookings into the wrong columns. The fix appends only
// stripeSessionId to column A first (unambiguous single-column range), then PUTs the rest to the
// row number read from that append's own response — these tests pin both response shapes Google
// actually returns for that first append call.
describe('appendBookingRow', () => {
	function stubApis(idAppendUpdatedRange: string) {
		const calls: Array<{ url: string; method: string; body: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				if (url.includes('oauth2.googleapis.com')) {
					return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
				}
				calls.push({ url, method, body: String(init?.body ?? '') });
				if (url.includes(':append')) {
					return new Response(JSON.stringify({ updates: { updatedRange: idAppendUpdatedRange } }), { status: 200 });
				}
				return new Response('{}', { status: 200 }); // the follow-up PUT to B<row>:AV<row>
			}),
		);
		return calls;
	}

	it('parses the row number from a single-cell updatedRange ("Sayfa1!A2", no colon — the very first data row)', async () => {
		const calls = stubApis('Sayfa1!A2');
		const rowNumber = await appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_1' });
		expect(rowNumber).toBe(2);
		expect(calls.some((c) => c.method === 'PUT' && c.url.includes('B2%3ABQ2'))).toBe(true);
	});

	it('parses the row number from a multi-cell updatedRange ("Sayfa1!A7:A7", any later row)', async () => {
		const calls = stubApis('Sayfa1!A7:A7');
		const rowNumber = await appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_2' });
		expect(rowNumber).toBe(7);
		expect(calls.some((c) => c.method === 'PUT' && c.url.includes('B7%3ABQ7'))).toBe(true);
	});

	it('throws (rather than silently writing to a garbled row) if updatedRange is missing', async () => {
		stubApis(undefined as unknown as string);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('oauth2.googleapis.com')) {
					return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
				}
				return new Response(JSON.stringify({}), { status: 200 }); // no `updates` field at all
			}),
		);
		await expect(appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_3' })).rejects.toThrow(/Could not parse row number/);
	});
});
