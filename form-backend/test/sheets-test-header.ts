import { SHEET_COLUMNS, SHEET_COLUMN_LABELS } from '../src/config';

// The real header row every live tab (Sayfa1 + every mirror) carries, in SHEET_COLUMNS order.
// Test fetch stubs return this for the `!1:1` header-row read every lib/sheets.ts operation now
// does before resolving a column — keeping it in canonical order means every column-letter
// assertion already in the test suite (e.g. "B2", "T2") stays valid unchanged.
export const CANONICAL_HEADER_ROW = SHEET_COLUMNS.map((key) => SHEET_COLUMN_LABELS[key]);

// True for the header-row GET (`{tab}!1:1`) every lib/sheets.ts read/write issues first. Check
// this before any other URL matcher in a test's fetch stub — it fires for every tab.
export function isHeaderRequest(url: string): boolean {
	return decodeURIComponent(url).includes('!1:1');
}

export function headerResponse(): Response {
	return new Response(JSON.stringify({ values: [CANONICAL_HEADER_ROW] }), { status: 200 });
}
