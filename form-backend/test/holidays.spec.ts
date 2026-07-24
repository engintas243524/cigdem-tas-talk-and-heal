import { describe, it, expect, vi, afterEach } from 'vitest';
import { getUkHolidays, listHolidaysInRange } from '../src/lib/holidays';

// Small fixture mirroring the real gov.uk shape (england-and-wales.events[].{title,date}), with a
// made-up date (2099-12-25) for a clean, stable assertion that never collides with a real holiday.
const FIXTURE = {
	'england-and-wales': {
		division: 'england-and-wales',
		events: [
			{ title: 'New Year’s Day', date: '2026-01-01', notes: '', bunting: true },
			{ title: 'Summer bank holiday', date: '2026-08-31', notes: '', bunting: true },
			{ title: 'Made-Up Test Holiday', date: '2099-12-25', notes: '', bunting: false },
		],
	},
	scotland: { division: 'scotland', events: [{ title: 'St Andrew’s Day', date: '2026-11-30', notes: '', bunting: true }] },
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getUkHolidays', () => {
	it('parses only the england-and-wales division into a ymd -> title map', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 })),
		);
		const map = await getUkHolidays();
		expect(map.get('2026-08-31')).toBe('Summer bank holiday');
		expect(map.get('2099-12-25')).toBe('Made-Up Test Holiday');
		// Scotland-only holiday must NOT leak in (this practice is England & Wales).
		expect(map.has('2026-11-30')).toBe(false);
	});
});

describe('listHolidaysInRange', () => {
	it('returns holidays within [start, end] inclusive, sorted chronologically', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 })),
		);
		const result = await listHolidaysInRange('2026-01-01', '2026-12-31');
		expect(result).toEqual([
			{ date: '2026-01-01', title: 'New Year’s Day' },
			{ date: '2026-08-31', title: 'Summer bank holiday' },
		]);
		// The 2099 date is outside the range and must be excluded.
		expect(result.some((h) => h.date === '2099-12-25')).toBe(false);
	});

	it('is inclusive of both endpoints', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 })),
		);
		const only = await listHolidaysInRange('2026-08-31', '2026-08-31');
		expect(only).toEqual([{ date: '2026-08-31', title: 'Summer bank holiday' }]);
	});
});

describe('fail-safe', () => {
	it('returns no holidays (never throws) when the fetch fails, so availability stays up', async () => {
		// Fresh module state isn't guaranteed across the suite; force a stale cache miss by using a
		// non-200 AFTER stubbing — the cache only stores successes, so a prior success in this file
		// could mask this. Import fresh to be certain.
		vi.resetModules();
		const fresh = await import('../src/lib/holidays');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 503 })),
		);
		const map = await fresh.getUkHolidays();
		expect(map.size).toBe(0);
	});
});
