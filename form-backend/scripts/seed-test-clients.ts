// One-off: seed ~100 synthetic bookings straight into the live test Google Sheet for statistics,
// bypassing Stripe/WhatsApp/Calendar entirely (reuses appendBookingRow/mirrorBookingRow from
// lib/sheets.ts, so header-resolution and mirror-tab routing stay identical to the real app).
// Run: npx tsx scripts/seed-test-clients.ts [count]
import { readFileSync } from 'node:fs';
import { appendBookingRow, mirrorBookingRow, emptySheetRow } from '../src/lib/sheets';
import { getPriceGBP, getSessionMinutes, MAX_SESSION_COUNT } from '../src/config';
import { computePolicyTier } from '../src/lib/policy';
import type { Env, SheetRow } from '../src/types';

function loadDevVars(path: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of readFileSync(path, 'utf-8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		const quoted = value.startsWith('"') && value.endsWith('"');
		if (quoted) value = value.slice(1, -1).replace(/\\n/g, '\n');
		out[key] = value;
	}
	return out;
}

const env = loadDevVars(new URL('../.dev.vars', import.meta.url).pathname) as unknown as Env;

type Country = { name: string; tz: string; phoneCode: string; first: string[]; last: string[] };
const COUNTRIES: Country[] = [
	{ name: 'UK', tz: 'Europe/London', phoneCode: '+44', first: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry'], last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson'] },
	{ name: 'Turkey', tz: 'Europe/Istanbul', phoneCode: '+90', first: ['Mehmet', 'Ayşe', 'Ahmet', 'Elif', 'Can'], last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik'] },
	{ name: 'USA', tz: 'America/New_York', phoneCode: '+1', first: ['James', 'Emma', 'Michael', 'Olivia', 'Daniel'], last: ['Johnson', 'Williams', 'Miller', 'Davis', 'Garcia'] },
	{ name: 'France', tz: 'Europe/Paris', phoneCode: '+33', first: ['Lucas', 'Camille', 'Hugo', 'Chloé', 'Louis'], last: ['Martin', 'Bernard', 'Dubois', 'Robert', 'Petit'] },
	{ name: 'Germany', tz: 'Europe/Berlin', phoneCode: '+49', first: ['Lukas', 'Anna', 'Felix', 'Lea', 'Paul'], last: ['Müller', 'Schmidt', 'Fischer', 'Weber', 'Wagner'] },
	{ name: 'Spain', tz: 'Europe/Madrid', phoneCode: '+34', first: ['Pablo', 'Lucía', 'Hugo', 'Martina', 'Mateo'], last: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez'] },
	{ name: 'Brazil', tz: 'America/Sao_Paulo', phoneCode: '+55', first: ['Miguel', 'Sophia', 'Arthur', 'Helena', 'Davi'], last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira'] },
	{ name: 'India', tz: 'Asia/Kolkata', phoneCode: '+91', first: ['Arjun', 'Priya', 'Rohan', 'Ananya', 'Vikram'], last: ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta'] },
	{ name: 'Japan', tz: 'Asia/Tokyo', phoneCode: '+81', first: ['Haruto', 'Yui', 'Sota', 'Aoi', 'Ren'], last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe'] },
	{ name: 'Nigeria', tz: 'Africa/Lagos', phoneCode: '+234', first: ['Chinedu', 'Amara', 'Emeka', 'Ngozi', 'Tunde'], last: ['Okafor', 'Eze', 'Okonkwo', 'Balogun', 'Adeyemi'] },
];

const SUMMARIES = [
	'Anxiety and work stress',
	'Relationship difficulties',
	'Grief and loss',
	'Burnout and overwhelm',
	'Low mood and motivation',
	'Life transition support',
	'Family conflict',
	'Self-esteem and confidence',
];

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(n: number): string {
	return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
}

function buildRow(i: number): SheetRow {
	const country = COUNTRIES[i % COUNTRIES.length];
	const first = pick(country.first);
	const last = pick(country.last);
	const sessionType = pick(['standard', 'extended'] as const);
	const therapyMode = pick(['individual', 'couple'] as const);
	const sessionMode = pick(['online', 'inPerson'] as const);
	// 40% single-session, 60% multi (2..MAX_SESSION_COUNT), per the requested tekli/çoklu mix.
	const sessionCount = Math.random() < 0.4 ? 1 : 2 + Math.floor(Math.random() * (MAX_SESSION_COUNT - 1));

	// Spread appointments across the last 14 days and next 14 days, on the hour.
	const dayOffset = Math.floor(Math.random() * 28) - 14;
	const hour = [9, 10, 11, 14, 15, 16][Math.floor(Math.random() * 6)];
	const start = new Date();
	start.setUTCDate(start.getUTCDate() + dayOffset);
	start.setUTCHours(hour, 0, 0, 0);

	const hoursUntilFirstSession = (start.getTime() - Date.now()) / 3_600_000;
	const reminderDue = new Date(start.getTime() - 24 * 3_600_000);

	const row = emptySheetRow();
	Object.assign(row, {
		stripeSessionId: `seed_${String(i).padStart(3, '0')}_${randomDigits(6)}`,
		name: `${first} ${last}`,
		email: `${first}.${last}.${i}@example.com`.toLowerCase(),
		phone: `${country.phoneCode}${randomDigits(9)}`,
		summary: pick(SUMMARIES),
		sessionType,
		sessionDurationMinutes: String(getSessionMinutes(sessionType)),
		therapyMode,
		sessionMode,
		priceGBP: String(getPriceGBP(sessionMode, therapyMode, sessionType)),
		sessionCount: String(sessionCount),
		policyTier: String(computePolicyTier(hoursUntilFirstSession)),
		appointmentStartUtc: start.toISOString(),
		clientTimeZone: country.tz,
		reminderDueUtc: reminderDue.toISOString(),
	});

	// Weekly-spaced follow-up sessions for multi-session bookings, matching the real booking flow.
	for (let n = 2; n <= sessionCount; n++) {
		const sessionStart = new Date(start.getTime() + (n - 1) * 7 * 24 * 3_600_000);
		(row as Record<string, string>)[`session${n}StartUtc`] = sessionStart.toISOString();
		(row as Record<string, string>)[`session${n}ReminderDueUtc`] = new Date(sessionStart.getTime() - 24 * 3_600_000).toISOString();
	}

	return row;
}

async function main() {
	const count = Number(process.argv[2] ?? 100);
	let ok = 0;
	let failed = 0;
	for (let i = 1; i <= count; i++) {
		const row = buildRow(i);
		try {
			await appendBookingRow(env, row);
			await mirrorBookingRow(env, row);
			ok++;
		} catch (err) {
			failed++;
			console.error(`Row ${i} (${row.name}) failed:`, err);
		}
		if (i % 10 === 0) console.log(`${i}/${count} done (${ok} ok, ${failed} failed)`);
	}
	console.log(`Finished: ${ok} ok, ${failed} failed.`);
}

main();
