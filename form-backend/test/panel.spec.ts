import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { handlePanelNotePost, handlePanelPending } from '../src/routes/panel';
import { runSessionNoteFallback } from '../src/scheduled';
import { signPanelToken } from '../src/lib/panel-auth';
import { SHEET_COLUMNS } from '../src/config';
import type { SheetRow } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

// The panel secrets aren't in .dev.vars (the human adds real ones); tests inject their own so no
// production value is invented here.
const testEnv = { ...env, PANEL_PASSWORD: 'correct-horse', PANEL_TOKEN_SECRET: 'panel-test-secret' } as typeof env;

const DAY = 86_400_000;
const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function makeRow(overrides: Partial<Record<keyof SheetRow, string>>): SheetRow {
	const row = {} as SheetRow;
	for (const key of SHEET_COLUMNS) row[key] = '';
	Object.assign(row, overrides);
	return row;
}

function letterToIndex(letters: string): number {
	let n = 0;
	for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
}

// Stateful Google Sheets + WhatsApp fake. `store[0]` is sheet row 2. writeCell PUTs mutate the
// in-memory row, so a re-read (getRow) sees the just-written guard — that's what makes the "Ekle"
// lock (409) and the cron guard-sharing testable end to end.
function stubApis(rows: SheetRow[]) {
	const store = rows;
	const whatsapp: { to: string }[] = [];
	const puts: { column: string; rowNumber: number; value: string }[] = [];

	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';

		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('graph.facebook.com')) {
			whatsapp.push({ to: JSON.parse(init!.body as string).to });
			return new Response('{}', { status: 200 });
		}
		if (url.includes('sheets.googleapis.com')) {
			const range = decodeURIComponent(url.split('/values/')[1].split('?')[0]);
			if (method === 'PUT') {
				const m = range.match(/!([A-Z]+)(\d+)$/)!;
				const colIdx = letterToIndex(m[1]);
				const rowNumber = Number(m[2]);
				const value = JSON.parse(init!.body as string).values[0][0];
				store[rowNumber - 2][SHEET_COLUMNS[colIdx]] = value;
				puts.push({ column: SHEET_COLUMNS[colIdx], rowNumber, value });
				return new Response('{}', { status: 200 });
			}
			if (/!A2:A$/.test(range)) {
				return new Response(JSON.stringify({ values: store.map((r) => [r.stripeSessionId]) }), { status: 200 });
			}
			if (/!A2:[A-Z]+$/.test(range)) {
				return new Response(JSON.stringify({ values: store.map((r) => SHEET_COLUMNS.map((k) => r[k])) }), { status: 200 });
			}
			const rn = Number(range.match(/!A(\d+):/)![1]);
			return new Response(JSON.stringify({ values: [SHEET_COLUMNS.map((k) => store[rn - 2][k])] }), { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { store, whatsapp, puts };
}

function notePost(body: Record<string, unknown>) {
	return handlePanelNotePost(
		new Request('http://example.com/panel/note', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		testEnv,
	);
}

// --- Login + auth guard (through the real router) -----------------------------------------

describe('panel login + auth guard', () => {
	async function fetchWorker(request: Request) {
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		return response;
	}

	it('rejects a wrong password with 401', async () => {
		stubApis([]);
		const response = await fetchWorker(
			new Request('http://example.com/panel/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'wrong' }),
			}),
		);
		expect(response.status).toBe(401);
	});

	it('returns a token for the correct password', async () => {
		stubApis([]);
		const response = await fetchWorker(
			new Request('http://example.com/panel/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'correct-horse' }),
			}),
		);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { token: string };
		expect(data.token).toMatch(/^\d+\.[0-9a-f]+$/);
	});

	it('blocks a protected route with no Bearer token (401)', async () => {
		stubApis([]);
		const response = await fetchWorker(new Request('http://example.com/panel/pending'));
		expect(response.status).toBe(401);
	});

	it('allows a protected route with a valid token', async () => {
		stubApis([]);
		const token = await signPanelToken(testEnv);
		const response = await fetchWorker(new Request('http://example.com/panel/pending', { headers: { Authorization: `Bearer ${token}` } }));
		expect(response.status).toBe(200);
	});

	it('rejects an expired token', async () => {
		stubApis([]);
		const expired = await signPanelToken(testEnv, new Date(Date.now() - 13 * 60 * 60 * 1000)); // signed 13h ago, 12h TTL
		const response = await fetchWorker(
			new Request('http://example.com/panel/pending', { headers: { Authorization: `Bearer ${expired}` } }),
		);
		expect(response.status).toBe(401);
	});
});

// --- "Ekle" (add) guard + append/replace ---------------------------------------------------

describe('POST /panel/note', () => {
	it('add-mode closes out the session and notifies the client when it is not the last session', async () => {
		const { whatsapp, store } = stubApis([
			makeRow({
				stripeSessionId: 'cs_1',
				name: 'Ada',
				phone: '447911123456',
				sessionType: 'standard',
				sessionMode: 'online',
				clientTimeZone: 'Europe/London',
				sessionCount: '2',
				appointmentStartUtc: past(1),
				session2StartUtc: future(6),
			}),
		]);

		const response = await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'add', text: 'Went well.' });
		expect(response.status).toBe(200);
		expect((await response.json()) as { notified: boolean }).toMatchObject({ closed: true, notified: true });
		expect(store[0].sessionNote).toBe('Went well.');
		expect(store[0].sessionNoteSubmittedAt).not.toBe('');
		expect(whatsapp.map((w) => w.to)).toEqual(['447911123456']); // next-appointment message to the client
	});

	it('add-mode is locked after first use: a second add returns 409 and does not re-notify', async () => {
		const { whatsapp } = stubApis([
			makeRow({
				stripeSessionId: 'cs_1',
				name: 'Ada',
				phone: '447911123456',
				sessionType: 'standard',
				sessionMode: 'online',
				clientTimeZone: 'Europe/London',
				sessionCount: '2',
				appointmentStartUtc: past(1),
				session2StartUtc: future(6),
			}),
		]);

		expect((await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'add', text: 'first' })).status).toBe(200);
		const second = await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'add', text: 'again' });
		expect(second.status).toBe(409);
		expect(whatsapp).toHaveLength(1); // only the first add notified
	});

	it('add-mode writes the default note when the box is empty, and last session never notifies', async () => {
		const { whatsapp, store } = stubApis([
			makeRow({
				stripeSessionId: 'cs_1',
				name: 'Ada',
				phone: '447911123456',
				sessionType: 'standard',
				sessionMode: 'online',
				clientTimeZone: 'Europe/London',
				sessionCount: '1',
				appointmentStartUtc: past(1),
			}),
		]);

		const response = await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'add', text: '   ' });
		expect(response.status).toBe(200);
		expect(store[0].sessionNote).toBe('Bu seansta not alınmadı.');
		expect(whatsapp).toHaveLength(0); // single session = last session, no next-appointment message
	});

	it('append/replace never touch the guard and never send WhatsApp', async () => {
		const { whatsapp, store } = stubApis([
			makeRow({
				stripeSessionId: 'cs_1',
				name: 'Ada',
				phone: '447911123456',
				sessionType: 'standard',
				appointmentStartUtc: past(1),
				sessionNote: 'Original.',
			}),
		]);

		await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'append', text: 'More.' });
		expect(store[0].sessionNote).toBe('Original.\nMore.');
		expect(store[0].sessionNoteSubmittedAt).toBe(''); // guard untouched -> "Ekle" stays available

		await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'replace', text: 'Rewritten.' });
		expect(store[0].sessionNote).toBe('Rewritten.');
		expect(store[0].sessionNoteSubmittedAt).toBe('');

		expect(whatsapp).toHaveLength(0);
	});

	it('rejects an unknown mode with 400', async () => {
		stubApis([makeRow({ stripeSessionId: 'cs_1', appointmentStartUtc: past(1) })]);
		expect((await notePost({ stripeSessionId: 'cs_1', sessionIndex: 1, mode: 'delete', text: 'x' })).status).toBe(400);
	});
});

// --- Default pending context ---------------------------------------------------------------

describe('GET /panel/pending', () => {
	async function pending(rows: SheetRow[]) {
		stubApis(rows);
		const response = await handlePanelPending(new Request('http://example.com/panel/pending'), testEnv);
		return (await response.json()) as { pending: { stripeSessionId: string; sessionIndex: number } | null };
	}

	it('surfaces the most recent finished-but-unclosed session', async () => {
		const data = await pending([
			makeRow({ stripeSessionId: 'cs_old', name: 'Old', sessionType: 'standard', appointmentStartUtc: past(10) }),
			makeRow({ stripeSessionId: 'cs_new', name: 'New', sessionType: 'standard', appointmentStartUtc: past(1) }),
		]);
		expect(data.pending).toMatchObject({ stripeSessionId: 'cs_new', sessionIndex: 1 });
	});

	it('ignores sessions that are already closed or still in the future', async () => {
		const data = await pending([
			makeRow({ stripeSessionId: 'cs_done', sessionType: 'standard', appointmentStartUtc: past(2), sessionNoteSubmittedAt: past(1) }),
			makeRow({ stripeSessionId: 'cs_future', sessionType: 'standard', appointmentStartUtc: future(3) }),
		]);
		expect(data.pending).toBeNull();
	});
});

// --- 23:59 cron fallback shares the same guard --------------------------------------------

describe('runSessionNoteFallback', () => {
	// A session whose London day is long over.
	const finishedRow = () =>
		makeRow({
			stripeSessionId: 'cs_1',
			name: 'Ada',
			phone: '447911123456',
			sessionType: 'standard',
			sessionMode: 'online',
			clientTimeZone: 'Europe/London',
			sessionCount: '2',
			appointmentStartUtc: '2026-08-03T09:00:00.000Z',
			session2StartUtc: future(30),
		});

	it('closes out an unclosed session past its day-end: default note + guard + next-appointment WhatsApp', async () => {
		const { store, whatsapp } = stubApis([finishedRow()]);
		await runSessionNoteFallback(testEnv, new Date('2026-08-04T05:00:00.000Z')); // well past 23:59 London on 3 Aug

		expect(store[0].sessionNote).toBe('Bu seansta not alınmadı.');
		expect(store[0].sessionNoteSubmittedAt).not.toBe('');
		expect(whatsapp.map((w) => w.to)).toEqual(['447911123456']);
	});

	it('does nothing before the session day is over', async () => {
		const { store, whatsapp } = stubApis([finishedRow()]);
		await runSessionNoteFallback(testEnv, new Date('2026-08-03T15:00:00.000Z')); // same day, 16:00 London

		expect(store[0].sessionNote).toBe('');
		expect(whatsapp).toHaveLength(0);
	});

	it('shares the guard with the manual button: an already-closed session is skipped', async () => {
		const row = finishedRow();
		row.sessionNoteSubmittedAt = '2026-08-03T20:00:00.000Z'; // manual "Ekle" already closed it
		const { whatsapp, puts } = stubApis([row]);
		await runSessionNoteFallback(testEnv, new Date('2026-08-04T05:00:00.000Z'));

		expect(puts).toHaveLength(0); // no writes at all
		expect(whatsapp).toHaveLength(0); // no double client message
	});

	it('skips cancelled packages entirely', async () => {
		const row = finishedRow();
		row.cancelledAt = past(1);
		const { puts, whatsapp } = stubApis([row]);
		await runSessionNoteFallback(testEnv, new Date('2026-08-04T05:00:00.000Z'));

		expect(puts).toHaveLength(0);
		expect(whatsapp).toHaveLength(0);
	});
});
