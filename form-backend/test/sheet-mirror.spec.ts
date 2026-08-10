import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SHEET_COLUMNS } from '../src/config';
import { emptySheetRow, writeCellMirrored } from '../src/lib/sheets';
import { isHeaderRequest, headerResponse } from './sheets-test-header';
import type { SheetRow } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

function makeRow(sessionCount: string): SheetRow {
	return { ...emptySheetRow(), stripeSessionId: 'cs_mirror_1', name: 'Ada', sessionCount };
}

interface StubOptions {
	tabExists?: boolean; // is the "{N} Seans" tab already present in spreadsheet metadata?
	mirrorRowExists?: boolean; // does a row with this stripeSessionId already exist in the mirror tab?
	failMetadata?: boolean; // force the metadata read (first mirror step) to 500
	tabColumnCount?: number; // grid width Google reports for the existing tab (default: wide enough)
}

// Models exactly the Sheets endpoints writeCellMirrored touches, recording every non-oauth call.
function stubSheets(opts: StubOptions = {}) {
	const calls: Array<{ url: string; method: string; body: string }> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = decodeURIComponent(String(input));
			const method = init?.method ?? 'GET';
			if (url.includes('oauth2.googleapis.com')) {
				return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
			}
			calls.push({ url, method, body: String(init?.body ?? '') });

			// Spreadsheet metadata (ensureSheetTab) — the first mirror step.
			if (url.includes('fields=sheets.properties')) {
				if (opts.failMetadata) return new Response('boom', { status: 500 });
				const columnCount = opts.tabColumnCount ?? SHEET_COLUMNS.length;
				const sheets = [
					{ properties: { sheetId: 0, title: 'Sayfa1', gridProperties: { columnCount } } },
					...(opts.tabExists ? [{ properties: { sheetId: 1, title: '3 Seans', gridProperties: { columnCount } } }] : []),
				];
				return new Response(JSON.stringify({ sheets }), { status: 200 });
			}
			// header-row read (resolveHeaderPositions) — return a full real header so it never needs to
			// PUT one, and so column resolution lands exactly where SHEET_COLUMNS says it should.
			if (method === 'GET' && isHeaderRequest(url)) {
				return headerResponse();
			}
			// findRowBySessionId read (column A of the mirror tab).
			if (method === 'GET' && /!A2:A(\b|$)/.test(url)) {
				return new Response(JSON.stringify({ values: opts.mirrorRowExists ? [['cs_mirror_1']] : [] }), { status: 200 });
			}
			// appendBookingRow's column-A append.
			if (url.includes(':append')) {
				return new Response(JSON.stringify({ updates: { updatedRange: '3 Seans!A2' } }), { status: 200 });
			}
			// The post-append concurrency-guard read-back (see appendBookingRow) — a single-cell GET
			// (no colon range, unlike findRowBySessionId's whole-column read above) — echo the id back.
			if (method === 'GET' && /![A-Z]+\d+$/.test(url)) {
				return new Response(JSON.stringify({ values: [['cs_mirror_1']] }), { status: 200 });
			}
			return new Response('{}', { status: 200 }); // PUT writes, batchUpdate, etc.
		}),
	);
	return calls;
}

const has = (calls: Array<{ url: string; method: string }>, method: string, fragment: string) =>
	calls.some((c) => c.method === method && c.url.includes(fragment));

describe('writeCellMirrored — Madde 7 multi-session mirror', () => {
	it('sessionCount === 1: writes Sayfa1 only, never touches a mirror tab', async () => {
		const calls = stubSheets();
		await writeCellMirrored(env, makeRow('1'), 5, 'confirmationSentAt', '2026-08-01T00:00:00.000Z');
		expect(has(calls, 'PUT', 'Sayfa1!')).toBe(true);
		expect(calls.some((c) => c.url.includes('fields=sheets.properties'))).toBe(false);
		expect(calls.some((c) => c.url.includes(':batchUpdate'))).toBe(false);
		expect(calls.some((c) => c.url.includes('3 Seans'))).toBe(false);
	});

	it('sessionCount > 1, mirror tab missing: creates the tab, then mirrors the cell', async () => {
		const calls = stubSheets({ tabExists: false, mirrorRowExists: false });
		await writeCellMirrored(env, makeRow('3'), 5, 'confirmationSentAt', '2026-08-01T00:00:00.000Z');
		// authoritative write happened first
		expect(has(calls, 'PUT', 'Sayfa1!')).toBe(true);
		// tab auto-created via addSheet
		const batch = calls.find((c) => c.url.includes(':batchUpdate'));
		expect(batch?.body).toContain('"title":"3 Seans"');
		// row copied into the new tab, then the cell mirrored there
		expect(has(calls, 'POST', '3 Seans!A:A')).toBe(true);
		expect(has(calls, 'PUT', '3 Seans!')).toBe(true);
	});

	it('sessionCount > 1, tab + row already exist: mirrors the cell without re-creating anything', async () => {
		const calls = stubSheets({ tabExists: true, mirrorRowExists: true });
		await writeCellMirrored(env, makeRow('3'), 5, 'cancelledAt', '2026-08-01T00:00:00.000Z');
		expect(has(calls, 'PUT', 'Sayfa1!')).toBe(true);
		expect(has(calls, 'PUT', '3 Seans!')).toBe(true);
		expect(calls.some((c) => c.url.includes(':batchUpdate'))).toBe(false); // tab already there
		expect(calls.some((c) => c.url.includes(':append'))).toBe(false); // row already there
	});

	it('sessionCount > 1, tab exists but its grid is narrower than SHEET_COLUMNS: grows the grid before writing', async () => {
		// Regression for the 2026-07-27 bug: SHEET_COLUMNS grew by one column, but an already-mirrored
		// tab's grid stayed at its old width. ensureHeaderRow's PUT past the grid edge doesn't
		// auto-expand it — Sheets 400s, which writeCellMirrored's isolation swallowed, so the mirror
		// row silently never got created/updated at all. ensureSheetTab must grow the grid first.
		const calls = stubSheets({ tabExists: true, mirrorRowExists: true, tabColumnCount: SHEET_COLUMNS.length - 1 });
		await writeCellMirrored(env, makeRow('3'), 5, 'cancelledAt', '2026-08-01T00:00:00.000Z');
		const resize = calls.find((c) => c.url.includes(':batchUpdate') && c.body.includes('updateSheetProperties'));
		expect(resize).toBeDefined();
		expect(resize!.body).toContain(`"columnCount":${SHEET_COLUMNS.length}`);
		// the mirror write itself still goes through, after the grid grows
		expect(has(calls, 'PUT', '3 Seans!')).toBe(true);
	});

	it('mirror failure never breaks the authoritative Sayfa1 write', async () => {
		const calls = stubSheets({ failMetadata: true });
		// must resolve, not reject, even though the mirror step throws internally
		await expect(writeCellMirrored(env, makeRow('3'), 5, 'cancelledAt', 'x')).resolves.toBeUndefined();
		expect(has(calls, 'PUT', 'Sayfa1!')).toBe(true); // Sayfa1 still written
		expect(has(calls, 'PUT', '3 Seans!')).toBe(false); // mirror never completed
	});
});
