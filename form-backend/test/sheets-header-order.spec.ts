import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SHEET_COLUMNS, SHEET_COLUMN_LABELS } from '../src/config';
import { appendBookingRow, emptySheetRow, getRow, writeCell } from '../src/lib/sheets';

afterEach(() => vi.unstubAllGlobals());

// Proves the core guarantee this rewrite exists for: a human manually reordering (or deleting) a
// column in the live Sheet must not make lib/sheets.ts write/read the wrong field. These tests
// serve a header row that does NOT match SHEET_COLUMNS' array order — simulating exactly that kind
// of manual edit — and assert every read/write still lands on the field whose LABEL TEXT matches,
// regardless of where that label now sits.

function columnLetter(index: number): string {
	let n = index + 1;
	let letters = '';
	while (n > 0) {
		const remainder = (n - 1) % 26;
		letters = String.fromCharCode(65 + remainder) + letters;
		n = Math.floor((n - 1) / 26);
	}
	return letters;
}

// Header in the exact REVERSE of SHEET_COLUMNS' array order — about as scrambled as a real reorder
// gets, and cheap to reason about: every key's real position is (N-1-originalIndex).
const REVERSED_HEADER = [...SHEET_COLUMNS].reverse().map((key) => SHEET_COLUMN_LABELS[key]);
const N = SHEET_COLUMNS.length;
function reversedPosition(key: (typeof SHEET_COLUMNS)[number]): number {
	return N - 1 - SHEET_COLUMNS.indexOf(key);
}

function stubReversedHeader(appendedSessionId?: string) {
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
			if (url.includes('!1:1')) return new Response(JSON.stringify({ values: [REVERSED_HEADER] }), { status: 200 });
			if (url.includes(':append')) return new Response(JSON.stringify({ updates: { updatedRange: 'Sayfa1!A2' } }), { status: 200 });
			// The post-append concurrency-guard read-back (see appendBookingRow) — echo the id
			// back so this test isn't mistaken for hitting the race it's not exercising.
			if (method === 'GET' && appendedSessionId) return new Response(JSON.stringify({ values: [[appendedSessionId]] }), { status: 200 });
			return new Response('{}', { status: 200 });
		}),
	);
	return calls;
}

describe('lib/sheets.ts column resolution survives a manually reordered header', () => {
	it('writeCell targets the column the label actually sits in, not its SHEET_COLUMNS array index', async () => {
		const calls = stubReversedHeader();
		await writeCell(env, 5, 'name', 'Ada');
		const expectedCol = columnLetter(reversedPosition('name'));
		expect(calls.some((c) => c.method === 'PUT' && c.url.includes(`Sayfa1!${expectedCol}5`))).toBe(true);
	});

	it('getRow reads each field back from its real (reordered) column, not array position', async () => {
		// Raw row values in the SAME reversed order the header declares.
		const reversedValues = [...SHEET_COLUMNS].reverse().map((key) => (key === 'name' ? 'Ada' : key === 'stripeSessionId' ? 'cs_x' : ''));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = decodeURIComponent(String(input));
				if (url.includes('oauth2.googleapis.com'))
					return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
				if (url.includes('!1:1')) return new Response(JSON.stringify({ values: [REVERSED_HEADER] }), { status: 200 });
				return new Response(JSON.stringify({ values: [reversedValues] }), { status: 200 }); // getRow's A5:<last>5 read
			}),
		);
		const row = await getRow(env, 5);
		expect(row.name).toBe('Ada');
		expect(row.stripeSessionId).toBe('cs_x');
	});

	it("appendBookingRow reserves the row via the ID column's real (last, post-reversal) position, then batch-writes every other field to its own real column", async () => {
		const calls = stubReversedHeader('cs_test_reorder');
		await appendBookingRow(env, { ...emptySheetRow(), stripeSessionId: 'cs_test_reorder', name: 'Ada' });

		const idCol = columnLetter(reversedPosition('stripeSessionId'));
		const appendCall = calls.find((c) => c.method === 'POST' && c.url.includes(':append'));
		expect(appendCall?.url).toContain(`Sayfa1!${idCol}:${idCol}`);

		const nameCol = columnLetter(reversedPosition('name'));
		const batch = calls.find((c) => c.method === 'POST' && c.url.includes(':batchUpdate'));
		expect(batch?.body).toContain(`"range":"Sayfa1!${nameCol}2"`);
	});

	it('self-heals a column whose label is entirely missing from the header by appending it at the end', async () => {
		const shortHeader = REVERSED_HEADER.filter((label) => label !== SHEET_COLUMN_LABELS.cancelledAt);
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
				if (url.includes('!1:1')) return new Response(JSON.stringify({ values: [shortHeader] }), { status: 200 });
				return new Response('{}', { status: 200 });
			}),
		);

		await writeCell(env, 5, 'cancelledAt', '2026-08-01T00:00:00.000Z');

		// The missing label gets appended right after the header's current end (shortHeader.length),
		// and the actual write must target that exact same newly-appended column.
		const expectedCol = columnLetter(shortHeader.length);
		const headerHeal = calls.find((c) => c.method === 'PUT' && c.url.includes(`${expectedCol}1`));
		expect(headerHeal?.body).toContain(SHEET_COLUMN_LABELS.cancelledAt);
		const cellWrite = calls.find((c) => c.method === 'PUT' && c.url.includes(`Sayfa1!${expectedCol}5`));
		expect(cellWrite).toBeDefined();
	});
});
