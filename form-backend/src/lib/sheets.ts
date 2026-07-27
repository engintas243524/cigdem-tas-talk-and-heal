import { SHEET_COLUMNS, SHEET_COLUMN_LABELS, SHEET_TAB_NAME } from '../config';
import { getGoogleAccessToken } from './google-auth';
import type { Env, SheetRow } from '../types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// A1-style column letter for a 0-indexed column (0 -> 'A', 25 -> 'Z', 26 -> 'AA', ...). The sheet
// now has ~48 columns (booking-system-expansion plan), well past 'Z', so a single
// `String.fromCharCode` no longer works.
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

const LAST_COLUMN_LETTER = columnLetter(SHEET_COLUMNS.length - 1);

async function sheetsFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
	const token = await getGoogleAccessToken(env);
	const response = await fetch(`${SHEETS_API}/${env.GOOGLE_SHEET_ID}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
	});
	if (!response.ok) {
		throw new Error(`Sheets API call failed (${path}): ${response.status} ${await response.text()}`);
	}
	return response;
}

// Every column defaulted to '' — callers overlay only the fields they actually have, instead of
// hand-listing all ~48 columns (booking-system-expansion plan) on every SheetRow they construct.
export function emptySheetRow(): SheetRow {
	const row = {} as SheetRow;
	for (const key of SHEET_COLUMNS) row[key] = '';
	return row;
}

function rowToArray(row: SheetRow): string[] {
	return SHEET_COLUMNS.map((key) => String(row[key] ?? ''));
}

function arrayToRow(values: string[]): SheetRow {
	const row: Record<string, string> = {};
	SHEET_COLUMNS.forEach((key, i) => (row[key] = values[i] ?? ''));
	return row as unknown as SheetRow;
}

// Extend-only: writes labels for whatever columns don't have a header yet, leaving every existing
// header cell untouched. Safe to call on every request that's about to write a row — cheap (one
// read, and a write only when SHEET_COLUMNS has actually grown since the header was last touched).
// This is what makes a schema growing (a new session-note column, say) self-healing: the next
// booking fixes the header automatically instead of leaving new columns permanently unlabeled
// (found live, 2026-07-23 — Madde 5's 20 new columns had no header because this function used to
// no-op entirely once ANY header existed, so it never grew past whatever it was written with).
export async function ensureHeaderRow(env: Env, tab: string = SHEET_TAB_NAME): Promise<void> {
	const range = `${tab}!A1:${LAST_COLUMN_LETTER}1`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	const existing = data.values?.[0] ?? [];
	if (existing.length >= SHEET_COLUMNS.length) return; // header already covers every column

	const missingKeys = SHEET_COLUMNS.slice(existing.length);
	const missingRange = `${tab}!${columnLetter(existing.length)}1:${LAST_COLUMN_LETTER}1`;
	await sheetsFetch(env, `/values/${encodeURIComponent(missingRange)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values: [missingKeys.map((key) => SHEET_COLUMN_LABELS[key])] }),
	});
}

// 1-indexed sheet row number (row 1 is the header), or null if not found. Idempotency check for
// the Stripe webhook cascade — column A holds stripeSessionId.
export async function findRowBySessionId(env: Env, stripeSessionId: string, tab: string = SHEET_TAB_NAME): Promise<number | null> {
	const range = `${tab}!A2:A`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	const rows = data.values ?? [];
	const index = rows.findIndex((r) => r[0] === stripeSessionId);
	return index === -1 ? null : index + 2; // +2: 1-indexed, plus header row
}

// Two real bugs found via live testing (booking-system-expansion plan), both fixed here:
//
// 1. Originally this re-queried findRowBySessionId right after appending, which raced Sheets' own
//    read-after-write consistency and sometimes came back null, crashing the webhook cascade with
//    a literal "Anull:AVnull" range.
// 2. Appending the full ~48-column row in one `values:append` call lets Google's "detect the
//    existing table, then continue it" heuristic anchor to whatever contiguous data block it finds
//    ANYWHERE in the A:AV search range — including stray leftover test data sitting in far-right
//    columns from an earlier session — silently writing new bookings into the wrong columns
//    entirely (confirmed live: a clean booking landed at AM:CH instead of A:AV).
//
// Fix for both: append ONLY the stripeSessionId to column A first — a single-column range Google's
// table-detection can't misalign — which atomically reserves the next row number (read straight
// from that call's own `updates.updatedRange`), then PUT the remaining columns to that exact row.
export async function appendBookingRow(env: Env, row: SheetRow, tab: string = SHEET_TAB_NAME): Promise<number> {
	const idRange = `${tab}!A:A`;
	const idResponse = await sheetsFetch(env, `/values/${encodeURIComponent(idRange)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values: [[row.stripeSessionId]] }),
	});
	const idData = (await idResponse.json()) as { updates?: { updatedRange?: string } };
	// No trailing ":" required — a single-cell update (e.g. the very first data row) collapses to
	// "Sayfa1!A2" with no range colon at all, unlike a multi-cell "Sayfa1!A2:AV2".
	const match = idData.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
	if (!match) {
		throw new Error(`Could not parse row number from append response: ${JSON.stringify(idData)}`);
	}
	const rowNumber = Number(match[1]);

	const restRange = `${tab}!B${rowNumber}:${LAST_COLUMN_LETTER}${rowNumber}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(restRange)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values: [rowToArray(row).slice(1)] }),
	});
	return rowNumber;
}

// Exported (not just used via the two convenience wrappers below) — Session 10's per-session
// reminder columns and Session 13's cancellation columns both need to write arbitrary named
// cells, not just the original confirmation/reminder pair.
export async function writeCell(
	env: Env,
	rowNumber: number,
	column: (typeof SHEET_COLUMNS)[number],
	value: string,
	tab: string = SHEET_TAB_NAME,
): Promise<void> {
	const columnIndex = SHEET_COLUMNS.indexOf(column);
	const range = `${tab}!${columnLetter(columnIndex)}${rowNumber}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values: [[value]] }),
	});
}

export const markConfirmationSent = (env: Env, rowNumber: number, timestampIso: string) =>
	writeCell(env, rowNumber, 'confirmationSentAt', timestampIso);

export const markReminderSent = (env: Env, rowNumber: number, timestampIso: string) =>
	writeCell(env, rowNumber, 'reminderSentAt', timestampIso);

export async function getRow(env: Env, rowNumber: number, tab: string = SHEET_TAB_NAME): Promise<SheetRow> {
	const range = `${tab}!A${rowNumber}:${LAST_COLUMN_LETTER}${rowNumber}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return arrayToRow(data.values?.[0] ?? []);
}

// Used by the cron sweep — every data row (excludes the header).
export async function getAllRows(env: Env, tab: string = SHEET_TAB_NAME): Promise<{ rowNumber: number; row: SheetRow }[]> {
	const range = `${tab}!A2:${LAST_COLUMN_LETTER}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? []).map((values, i) => ({ rowNumber: i + 2, row: arrayToRow(values) }));
}

// ── Madde 7: multi-session mirror ────────────────────────────────────────────────────────────────
// Bookings with sessionCount > 1 are logged to Sayfa1 as usual AND mirrored, cell-for-cell, into a
// per-count tab named "{N} Seans" (same 69-column schema). Sayfa1 stays the single source of truth
// for reads; only writes are mirrored. Every mirror step is isolated (BE-19 pattern) — a mirror
// failure is logged and never touches the authoritative Sayfa1 write.

// The tab a row mirrors to, or null for single-session bookings (which never mirror).
function mirrorTabName(row: SheetRow): string | null {
	const n = Number(row.sessionCount);
	return n > 1 ? `${n} Seans` : null;
}

// Create the tab if it isn't there yet (checked against live spreadsheet metadata). Only tabs a
// real multi-session booking actually uses are created — not all of "2 Seans".."10 Seans" up front.
//
// Also grows the tab's grid to fit SHEET_COLUMNS.length, for both a brand-new tab and one that
// already existed with fewer grid columns than the schema currently has (found live, 2026-07-27:
// SHEET_COLUMNS grew by one column, but an already-mirrored tab's grid stayed at its old width —
// ensureHeaderRow's PUT past the grid edge doesn't auto-expand it, Sheets just 400s. That throw was
// swallowed by writeCellMirrored's/mirrorBookingRow's isolation, so a mirror row silently never got
// created/updated at all — this had gone unnoticed because failures there only ever log, never
// surface). Same fix covers the same class of bug the next time SHEET_COLUMNS grows.
async function ensureSheetTab(env: Env, tab: string): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === tab);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [{ addSheet: { properties: { title: tab, gridProperties: { columnCount: SHEET_COLUMNS.length } } } }],
			}),
		});
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < SHEET_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: { sheetId: existing.properties.sheetId, gridProperties: { columnCount: SHEET_COLUMNS.length } },
							fields: 'gridProperties.columnCount',
						},
					},
				],
			}),
		});
	}
}

// Ensure the mirror tab exists + is headered + holds a row for this stripeSessionId (appending a
// full copy of `row` if missing), and return that row's 1-indexed number in the mirror tab.
async function ensureMirrorRow(env: Env, tab: string, row: SheetRow): Promise<number> {
	await ensureSheetTab(env, tab);
	await ensureHeaderRow(env, tab);
	const existing = await findRowBySessionId(env, row.stripeSessionId, tab);
	return existing ?? (await appendBookingRow(env, row, tab));
}

// Initial mirror of a freshly-appended booking row. No-op for single-session bookings. Isolated:
// call it right after the Sayfa1 appendBookingRow — a mirror failure never fails the booking.
export async function mirrorBookingRow(env: Env, row: SheetRow): Promise<void> {
	const tab = mirrorTabName(row);
	if (!tab) return;
	try {
		await ensureMirrorRow(env, tab, row);
	} catch (err) {
		console.error(`Sheet mirror booking-row create failed (${tab}, ${row.stripeSessionId}):`, err);
	}
}

// Write-through cell write: always writes Sayfa1 (the authoritative write, un-guarded), then — only
// for multi-session bookings — mirrors the same cell to the "{N} Seans" tab in its own try/catch.
// Every existing writeCell(env, rowNumber, field, value) that has the row in scope becomes this.
export async function writeCellMirrored(
	env: Env,
	row: SheetRow,
	rowNumber: number,
	column: (typeof SHEET_COLUMNS)[number],
	value: string,
): Promise<void> {
	await writeCell(env, rowNumber, column, value);
	const tab = mirrorTabName(row);
	if (!tab) return;
	try {
		const mirrorRowNumber = await ensureMirrorRow(env, tab, row);
		await writeCell(env, mirrorRowNumber, column, value, tab);
	} catch (err) {
		console.error(`Sheet mirror write failed (${tab}, ${row.stripeSessionId}, ${column}):`, err);
	}
}
