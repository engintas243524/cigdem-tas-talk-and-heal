import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { appendBookingRow, emptySheetRow } from '../src/lib/sheets';
import { isHeaderRequest, headerResponse } from './sheets-test-header';

afterEach(() => {
	vi.unstubAllGlobals();
});

// Real bugs found via live testing (booking-system-expansion plan): appending the full row in one
// call let Google's table-detection heuristic anchor to unrelated stray data in far-right columns,
// silently writing bookings into the wrong columns. The fix appends only stripeSessionId to its
// resolved column first (unambiguous single-column range), then writes the rest of the row via a
// values:batchUpdate addressed by each field's own resolved column — these tests pin both response
// shapes Google actually returns for that first append call.
describe('appendBookingRow', () => {
	function stubApis(idAppendUpdatedRange: string, stripeSessionId: string) {
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
				if (isHeaderRequest(url)) return headerResponse();
				if (url.includes(':append')) {
					return new Response(JSON.stringify({ updates: { updatedRange: idAppendUpdatedRange } }), { status: 200 });
				}
				// The post-append concurrency-guard read-back (see appendBookingRow) — echo the id
				// back so these tests, which aren't exercising the race itself, don't trip it.
				if (method === 'GET' && url.includes('/values/')) {
					return new Response(JSON.stringify({ values: [[stripeSessionId]] }), { status: 200 });
				}
				return new Response('{}', { status: 200 }); // the follow-up values:batchUpdate
			}),
		);
		return calls;
	}

	it('parses the row number from a single-cell updatedRange ("Sayfa1!A2", no colon — the very first data row)', async () => {
		const calls = stubApis('Sayfa1!A2', 'cs_test_1');
		const rowNumber = await appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_1' });
		expect(rowNumber).toBe(2);
		const batch = calls.find((c) => c.method === 'POST' && c.url.includes(':batchUpdate'));
		expect(batch?.body).toContain('"range":"Sayfa1!B2"'); // 'name' — first field after stripeSessionId
	});

	it('parses the row number from a multi-cell updatedRange ("Sayfa1!A7:A7", any later row)', async () => {
		const calls = stubApis('Sayfa1!A7:A7', 'cs_test_2');
		const rowNumber = await appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_2' });
		expect(rowNumber).toBe(7);
		const batch = calls.find((c) => c.method === 'POST' && c.url.includes(':batchUpdate'));
		expect(batch?.body).toContain('"range":"Sayfa1!B7"');
	});

	// Madde 2/#14 (2026-08-11): the concurrency guard (BE-43) is the permanent fix for two bookings
	// racing onto the same row — this pins the actual collision path, not just the happy path the
	// tests above stub around. Simulates Sheets' :append heuristic reporting the SAME row to two
	// concurrent callers: this call "wins" the append but the verify read-back finds the OTHER
	// booking's id already sitting in that cell (it lost the real race at the Sheets API level).
	it('detects a lost concurrent-write race and throws BEFORE writing any other field — never corrupts the row the other booking already claimed', async () => {
		const calls = stubApis('Sayfa1!A9', 'cs_the_other_booking'); // verify read-back echoes a DIFFERENT id
		await expect(appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_this_booking' })).rejects.toThrow(
			/lost a concurrent write race/,
		);
		// The rest-of-row values:batchUpdate must never fire — that's what would have overwritten
		// the other booking's already-claimed row.
		expect(calls.some((c) => c.method === 'POST' && c.url.includes(':batchUpdate'))).toBe(false);
	});

	it('throws (rather than silently writing to a garbled row) if updatedRange is missing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('oauth2.googleapis.com')) {
					return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
				}
				if (isHeaderRequest(url)) return headerResponse();
				return new Response(JSON.stringify({}), { status: 200 }); // no `updates` field at all
			}),
		);
		await expect(appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_3' })).rejects.toThrow(/Could not parse row number/);
	});
});
