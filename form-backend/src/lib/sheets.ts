import { SHEET_COLUMNS, SHEET_COLUMN_LABELS, SHEET_TAB_NAME } from '../config';
import { getGoogleAccessToken } from './google-auth';
import type { Env, SheetRow } from '../types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// A1-style column letter for a 0-indexed column (0 -> 'A', 25 -> 'Z', 26 -> 'AA', ...). The sheet
// now has ~70+ columns (booking-system-expansion plan), well past 'Z', so a single
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
// hand-listing all ~70 columns (booking-system-expansion plan) on every SheetRow they construct.
export function emptySheetRow(): SheetRow {
	const row = {} as SheetRow;
	for (const key of SHEET_COLUMNS) row[key] = '';
	return row;
}

type ColumnPositions = Map<(typeof SHEET_COLUMNS)[number], number>;

// The single place every read/write resolves "which column is this field in" — by matching the
// tab's ACTUAL header row text against SHEET_COLUMN_LABELS, never by trusting SHEET_COLUMNS'
// array position. This is what makes the sheet safe against a human manually inserting, deleting,
// moving, or copy/pasting a column in Sayfa1 or a mirror tab: as long as the header cell's text is
// still there somewhere, every read/write keeps finding the right cell regardless of where it
// moved to. (This replaces the old position-based scheme, which silently wrote/read the wrong
// column after any manual reorder — see BE-18, caused by exactly that assumption.)
//
// Self-healing: a key whose label isn't found anywhere in the header (a column that was deleted,
// or a brand-new key from a schema change) gets its label appended to the end of that tab's
// current header — same "extend-only" philosophy the old ensureHeaderRow used, just keyed by
// label presence instead of array position, so a column that drifted to a new position is never
// mistaken for a missing one.
async function resolveHeaderPositions(env: Env, tab: string): Promise<ColumnPositions> {
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(`${tab}!1:1`)}`);
	const data = (await response.json()) as { values?: string[][] };
	const existing = data.values?.[0] ?? [];

	const indexByLabel = new Map<string, number>();
	existing.forEach((label, i) => {
		if (label && !indexByLabel.has(label)) indexByLabel.set(label, i);
	});

	const positions: ColumnPositions = new Map();
	const missing: (typeof SHEET_COLUMNS)[number][] = [];
	for (const key of SHEET_COLUMNS) {
		const index = indexByLabel.get(SHEET_COLUMN_LABELS[key]);
		if (index === undefined) missing.push(key);
		else positions.set(key, index);
	}

	if (missing.length) {
		const startIndex = existing.length;
		const missingRange = `${tab}!${columnLetter(startIndex)}1:${columnLetter(startIndex + missing.length - 1)}1`;
		await sheetsFetch(env, `/values/${encodeURIComponent(missingRange)}?valueInputOption=RAW`, {
			method: 'PUT',
			body: JSON.stringify({ values: [missing.map((key) => SHEET_COLUMN_LABELS[key])] }),
		});
		missing.forEach((key, i) => positions.set(key, startIndex + i));
	}

	return positions;
}

// Kept as its own export (stripe-webhook.ts calls it explicitly before appendBookingRow) — every
// other read/write below resolves the header itself anyway, so this is just a way to warm/repair
// the header ahead of time. Safe to call any time, on any tab.
export async function ensureHeaderRow(env: Env, tab: string = SHEET_TAB_NAME): Promise<void> {
	await resolveHeaderPositions(env, tab);
}

function rowFromValues(values: string[], positions: ColumnPositions): SheetRow {
	const row = {} as SheetRow;
	for (const key of SHEET_COLUMNS) row[key] = String(values[positions.get(key)!] ?? '');
	return row;
}

// 1-indexed sheet row number (row 1 is the header), or null if not found. Idempotency check for
// the Stripe webhook cascade. Scans whichever column stripeSessionId's header currently resolves
// to — not hardcoded column A, since a manual reorder can move it.
export async function findRowBySessionId(env: Env, stripeSessionId: string, tab: string = SHEET_TAB_NAME): Promise<number | null> {
	const positions = await resolveHeaderPositions(env, tab);
	const idColumn = columnLetter(positions.get('stripeSessionId')!);
	const range = `${tab}!${idColumn}2:${idColumn}`;
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
// 2. Appending the full row in one `values:append` call lets Google's "detect the existing table,
//    then continue it" heuristic anchor to whatever contiguous data block it finds ANYWHERE in the
//    search range — including stray leftover test data sitting in far-right columns from an
//    earlier session — silently writing new bookings into the wrong columns entirely (confirmed
//    live: a clean booking landed at AM:CH instead of A:AV).
//
// Fix for both: append ONLY stripeSessionId to its resolved column first — a single-column range
// Google's table-detection can't misalign — which atomically reserves the next row number (read
// straight from that call's own `updates.updatedRange`), then write the remaining fields each to
// their own resolved column via one values:batchUpdate call (not a single contiguous PUT — after a
// manual reorder the fields' real columns may no longer be contiguous or in SHEET_COLUMNS' order).
export async function appendBookingRow(env: Env, row: SheetRow, tab: string = SHEET_TAB_NAME): Promise<number> {
	const positions = await resolveHeaderPositions(env, tab);

	const idColumn = columnLetter(positions.get('stripeSessionId')!);
	const idRange = `${tab}!${idColumn}:${idColumn}`;
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

	// Concurrency guard (found live 2026-08-10, BE-43): two bookings appended within moments of
	// each other can both have this `:append` call report the SAME rowNumber back — observed with
	// an active sheet filter, but nothing about Sheets' table-detection heuristic guarantees it
	// can't also happen under genuine simultaneous webhook deliveries with no filter involved. The
	// single-column append itself is cheap to re-verify: read back the cell we just claimed and
	// confirm it's still OUR id before writing 15+ more fields into what might now be someone
	// else's row. A mismatch means we lost the race — fail loudly (502, Stripe retries the whole
	// webhook) rather than silently overwriting another booking's data.
	const verifyResponse = await sheetsFetch(env, `/values/${encodeURIComponent(`${tab}!${idColumn}${rowNumber}`)}`);
	const verifyData = (await verifyResponse.json()) as { values?: string[][] };
	const actualId = verifyData.values?.[0]?.[0];
	if (actualId !== row.stripeSessionId) {
		throw new Error(
			`appendBookingRow lost a concurrent write race: row ${rowNumber} holds "${actualId}", expected "${row.stripeSessionId}"`,
		);
	}

	const data = SHEET_COLUMNS.filter((key) => key !== 'stripeSessionId').map((key) => ({
		range: `${tab}!${columnLetter(positions.get(key)!)}${rowNumber}`,
		values: [[String(row[key] ?? '')]],
	}));
	await sheetsFetch(env, '/values:batchUpdate', {
		method: 'POST',
		body: JSON.stringify({ valueInputOption: 'RAW', data }),
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
	const positions = await resolveHeaderPositions(env, tab);
	const range = `${tab}!${columnLetter(positions.get(column)!)}${rowNumber}`;
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
	const positions = await resolveHeaderPositions(env, tab);
	const maxIndex = Math.max(...positions.values());
	const range = `${tab}!A${rowNumber}:${columnLetter(maxIndex)}${rowNumber}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return rowFromValues(data.values?.[0] ?? [], positions);
}

// Used by the cron sweep — every data row (excludes the header). Header resolved once for the
// whole scan, not per row — cheap and correct, since the header doesn't change mid-scan.
export async function getAllRows(env: Env, tab: string = SHEET_TAB_NAME): Promise<{ rowNumber: number; row: SheetRow }[]> {
	const positions = await resolveHeaderPositions(env, tab);
	const maxIndex = Math.max(...positions.values());
	const range = `${tab}!A2:${columnLetter(maxIndex)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? []).map((values, i) => ({ rowNumber: i + 2, row: rowFromValues(values, positions) }));
}

// ── Madde 7: multi-session mirror ────────────────────────────────────────────────────────────────
// Bookings with sessionCount > 1 are logged to Sayfa1 as usual AND mirrored, cell-for-cell, into a
// per-count tab named "{N} Seans" (same schema). Sayfa1 stays the single source of truth for
// reads; only writes are mirrored. Every mirror step is isolated (BE-19 pattern) — a mirror
// failure is logged and never touches the authoritative Sayfa1 write. Each tab resolves its own
// header independently (see resolveHeaderPositions), so a mirror tab whose columns have drifted
// from Sayfa1's layout still gets every field written under its own correct header.

// The tab a row mirrors to, or null for single-session bookings (which never mirror).
function mirrorTabName(row: SheetRow): string | null {
	const n = Number(row.sessionCount);
	return n > 1 ? `${n} Seans` : null;
}

// Create the tab if it isn't there yet (checked against live spreadsheet metadata). Only tabs a
// real multi-session booking actually uses are created — not all of "2 Seans".."20 Seans" up front.
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
//
// ponytail: each writeCell call here re-resolves the header from scratch (1 Sheets API read), so a
// handler doing several sequential writeCellMirrored calls (e.g. cancellation.ts) re-reads the same
// header several times over. Fine at this app's traffic (one therapist, no bulk operations) — if it
// ever needs to be cheaper, add a per-request header cache keyed by tab, passed through instead of
// re-resolved.
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
