// UK (England & Wales) bank holidays from the free, public gov.uk feed — no auth. Used to blank
// out slot availability on public holidays (booking-system-expansion plan, Session 12).

const BANK_HOLIDAYS_URL = 'https://www.gov.uk/bank-holidays.json';
// This practice is Europe/London-based (see config.ts BUSINESS_HOURS.timeZone and
// lib/timezone.ts FALLBACK_TIMEZONE), so only the England & Wales division applies.
const DIVISION = 'england-and-wales';

interface GovUkEvent {
	title: string;
	date: string; // plain YYYY-MM-DD, no time/zone — a Europe/London calendar date
}
type GovUkResponse = Record<string, { events?: GovUkEvent[] }>;

// Module-scope cache, same rationale as google-auth.ts's cachedToken: a Workers isolate can be
// evicted anytime (then this just re-fetches) — not a durability guarantee, only avoids a fetch on
// every request within a warm isolate. The dataset changes only a few times a year, so a long TTL
// is fine.
let cache: { map: Map<string, string>; expiresAt: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

// Returns a map of YYYY-MM-DD (Europe/London calendar date) -> holiday title. Fail-safe: any
// network/parse/shape problem yields an EMPTY map (and isn't cached, so the next call retries) so a
// temporarily-unreachable gov.uk never takes slot booking down.
export async function getUkHolidays(): Promise<Map<string, string>> {
	const now = Date.now();
	if (cache && cache.expiresAt > now) return cache.map;

	const map = new Map<string, string>();
	try {
		const res = await fetch(BANK_HOLIDAYS_URL);
		if (!res.ok) throw new Error(`gov.uk bank-holidays fetch failed: ${res.status}`);
		const data = (await res.json()) as GovUkResponse;
		for (const ev of data[DIVISION]?.events ?? []) {
			if (ev?.date && ev?.title) map.set(ev.date, ev.title);
		}
	} catch (err) {
		console.error('UK bank holidays unavailable, treating as none:', err);
		return map; // don't cache the failure — retry on the next call rather than staying blank 24h
	}
	cache = { map, expiresAt: now + TTL_MS };
	return map;
}

// Holidays whose date falls within [startYmd, endYmd] inclusive. YYYY-MM-DD strings sort
// chronologically, so plain string comparison is the range check.
export async function listHolidaysInRange(startYmd: string, endYmd: string): Promise<Array<{ date: string; title: string }>> {
	const map = await getUkHolidays();
	return [...map.entries()]
		.filter(([date]) => date >= startYmd && date <= endYmd)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, title]) => ({ date, title }));
}
