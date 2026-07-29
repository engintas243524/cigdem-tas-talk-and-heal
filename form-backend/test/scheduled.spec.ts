import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runReminderSweep } from '../src/scheduled';
import { SHEET_COLUMNS } from '../src/config';
import { emptySheetRow } from '../src/lib/sheets';
import { isHeaderRequest, headerResponse } from './sheets-test-header';
import type { SheetRow } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

const BASE_ROW: SheetRow = {
	...emptySheetRow(),
	stripeSessionId: 'cs_test_1',
	name: 'Ada Test',
	email: 'ada@example.com',
	phone: '447911123456',
	summary: 'summary',
	sessionType: 'standard',
	therapyMode: 'individual',
	sessionMode: 'online',
	priceGBP: '120',
	sessionCount: '1',
	policyTier: '72',
	appointmentStartUtc: '2026-08-03T09:00:00.000Z',
	clientTimeZone: 'Europe/London',
	reminderDueUtc: '2026-08-02T13:00:00.000Z',
	confirmationSentAt: '2026-08-01T00:00:00.000Z',
	reminderSentAt: '',
};

function stubSheetsAndWhatsapp(rows: SheetRow[], opts: { failOn?: string } = {}) {
	const writes: { range: string; value: string }[] = [];
	const whatsappCalls: string[] = [];
	const whatsappBodies: string[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('oauth2.googleapis.com'))
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		if (url.includes('graph.facebook.com')) {
			const body = JSON.parse(init!.body as string);
			whatsappCalls.push(body.to);
			if (body.template) whatsappBodies.push(body.template.components[0].parameters.map((p: { text: string }) => p.text).join(' | '));
			if (opts.failOn && body.to === opts.failOn) return new Response('rate limited', { status: 429 });
			return new Response('{}', { status: 200 });
		}
		if (url.includes('sheets.googleapis.com')) {
			// Madde 7 mirror: spreadsheet metadata probe (ensureSheetTab). Report the "{N} Seans" tabs
			// as already present so the mirror path just finds the row and writes it.
			if (url.includes('fields=sheets.properties')) {
				const titles = ['Sayfa1', ...Array.from({ length: 9 }, (_, i) => `${i + 2} Seans`)];
				const sheets = titles.map((title, i) => ({
					properties: { sheetId: i, title, gridProperties: { columnCount: SHEET_COLUMNS.length } },
				}));
				return new Response(JSON.stringify({ sheets }), { status: 200 });
			}
			if (isHeaderRequest(url)) return headerResponse();
			if (init?.method === 'PUT') {
				const range = decodeURIComponent(new URL(url).pathname.split('/values/')[1] ?? '');
				const value = JSON.parse(init.body as string).values[0][0];
				writes.push({ range, value });
				return new Response('{}', { status: 200 });
			}
			// getAllRows: A2:<lastColumn> read
			const values = rows.map((r) => SHEET_COLUMNS.map((key) => r[key]));
			return new Response(JSON.stringify({ values }), { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { writes, whatsappCalls, whatsappBodies };
}

describe('runReminderSweep', () => {
	it('sends the reminder + Selen notice for a due, not-yet-reminded row, and marks it sent', async () => {
		const { writes, whatsappCalls } = stubSheetsAndWhatsapp([BASE_ROW]);
		const now = new Date('2026-08-02T13:05:00.000Z'); // 5 min past the due instant

		await runReminderSweep(env, now);

		expect(whatsappCalls).toEqual(['447911123456', env.SELEN_WHATSAPP_NUMBER]);
		expect(writes).toHaveLength(1);
		expect(writes[0].value).toBe(now.toISOString());
	});

	it('skips a row whose reminder is not due yet', async () => {
		const { whatsappCalls } = stubSheetsAndWhatsapp([BASE_ROW]);
		const now = new Date('2026-08-02T12:00:00.000Z'); // before the due instant

		await runReminderSweep(env, now);

		expect(whatsappCalls).toEqual([]);
	});

	it('skips a row whose reminder was already sent', async () => {
		const { whatsappCalls } = stubSheetsAndWhatsapp([{ ...BASE_ROW, reminderSentAt: '2026-08-02T13:00:00.000Z' }]);
		const now = new Date('2026-08-02T13:05:00.000Z');

		await runReminderSweep(env, now);

		expect(whatsappCalls).toEqual([]);
	});

	it('a failure on one row does not stop the sweep from processing the next row', async () => {
		const rowA = { ...BASE_ROW, stripeSessionId: 'cs_test_a', phone: 'FAIL_NUMBER' };
		const rowB = { ...BASE_ROW, stripeSessionId: 'cs_test_b', phone: '447900000000' };
		const { writes, whatsappCalls } = stubSheetsAndWhatsapp([rowA, rowB], { failOn: 'FAIL_NUMBER' });
		const now = new Date('2026-08-02T13:05:00.000Z');

		await runReminderSweep(env, now);

		expect(whatsappCalls).toContain('FAIL_NUMBER');
		expect(whatsappCalls).toContain('447900000000');
		// Only row B's reminder should have been marked sent — row A's send failed before the guard write.
		expect(writes).toHaveLength(1);
	});

	it('handles a recurring/multi-session row: each session slot reminds independently', async () => {
		const multiRow: SheetRow = {
			...BASE_ROW,
			stripeSessionId: 'cs_test_multi',
			sessionCount: '3',
			// Session 1 already reminded — must NOT fire again.
			reminderDueUtc: '2026-08-02T13:00:00.000Z',
			reminderSentAt: '2026-08-02T13:00:00.000Z',
			// Session 2 due now.
			session2StartUtc: '2026-08-10T09:00:00.000Z',
			session2ReminderDueUtc: '2026-08-09T13:00:00.000Z',
			session2ReminderSentAt: '',
			// Session 3 not due yet.
			session3StartUtc: '2026-08-17T09:00:00.000Z',
			session3ReminderDueUtc: '2026-08-16T13:00:00.000Z',
			session3ReminderSentAt: '',
		};
		const { writes, whatsappCalls, whatsappBodies } = stubSheetsAndWhatsapp([multiRow]);
		const now = new Date('2026-08-09T13:05:00.000Z'); // just past session 2's due instant

		await runReminderSweep(env, now);

		expect(whatsappCalls).toEqual(['447911123456', env.SELEN_WHATSAPP_NUMBER]); // only session 2 fired
		// Confirms it's genuinely session 2's own date in the message, not session 1's (3 Aug) or
		// session 3's (17 Aug) — phone number alone can't distinguish this, since it's the same
		// client for every session in the row.
		expect(whatsappBodies[0]).toContain('10 Aug 2026');
		// Session 2's sent-stamp lands on Sayfa1 AND — because this is a 3-session booking (Madde 7) —
		// is mirrored to the "3 Seans" tab, same cell, same value.
		const sayfa1Writes = writes.filter((w) => w.range.startsWith('Sayfa1!'));
		const mirrorWrites = writes.filter((w) => w.range.startsWith('3 Seans!'));
		expect(sayfa1Writes).toEqual([{ range: 'Sayfa1!T2', value: now.toISOString() }]);
		expect(mirrorWrites).toEqual([{ range: '3 Seans!T2', value: now.toISOString() }]);
	});
});
