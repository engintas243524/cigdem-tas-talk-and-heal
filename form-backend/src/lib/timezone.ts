import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { REMINDER_LOCAL_HOUR } from '../config';

// Conscious simplification (INTEGRASYON_TODO.md Phase 0): countries spanning multiple timezones
// map to a single representative zone (most populous, or capital) rather than resolving the
// caller's actual region. ponytail: revisit with per-area-code detail if this ever causes a
// visibly wrong reminder time for a real client.
const COUNTRY_TO_TIMEZONE: Record<string, string> = {
	GB: 'Europe/London',
	TR: 'Europe/Istanbul',
	US: 'America/New_York',
	RU: 'Europe/Moscow',
	CA: 'America/Toronto',
	AU: 'Australia/Sydney',
	DE: 'Europe/Berlin',
	FR: 'Europe/Paris',
	ES: 'Europe/Madrid',
	IT: 'Europe/Rome',
	NL: 'Europe/Amsterdam',
	PT: 'Europe/Lisbon',
	IE: 'Europe/Dublin',
	CH: 'Europe/Zurich',
	AT: 'Europe/Vienna',
	BE: 'Europe/Brussels',
	SE: 'Europe/Stockholm',
	NO: 'Europe/Oslo',
	DK: 'Europe/Copenhagen',
	PL: 'Europe/Warsaw',
	GR: 'Europe/Athens',
	AE: 'Asia/Dubai',
	SA: 'Asia/Riyadh',
	IN: 'Asia/Kolkata',
	CN: 'Asia/Shanghai',
	JP: 'Asia/Tokyo',
	SG: 'Asia/Singapore',
	NZ: 'Pacific/Auckland',
	ZA: 'Africa/Johannesburg',
	BR: 'America/Sao_Paulo',
	MX: 'America/Mexico_City',
};

// Fallback matches the practice's own timezone (Europe/London) when the number can't be parsed.
const FALLBACK_TIMEZONE = 'Europe/London';

export function detectTimezoneFromPhone(phoneNumber: string): string {
	const parsed = parsePhoneNumberFromString(phoneNumber);
	if (!parsed?.country) return FALLBACK_TIMEZONE;
	return COUNTRY_TO_TIMEZONE[parsed.country] ?? FALLBACK_TIMEZONE;
}

const ISO_WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface LocalDateParts {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number; // 0-23, local hour in timeZone
	isoWeekday: number; // 1 (Monday) - 7 (Sunday)
}

// Reads the calendar date + local hour + ISO weekday that `date` falls on when viewed in
// `timeZone` — native Intl, no timezone library needed for this.
export function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
	const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
	const [year, month, day] = dateStr.split('-').map(Number);
	const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
	const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
	return { year, month, day, hour, isoWeekday: ISO_WEEKDAY[weekdayStr] };
}

// Converts a Y-M-D calendar date + local hour, as experienced in `timeZone`, to the
// corresponding UTC instant. Uses the Intl.DateTimeFormat offset trick (native, no timezone
// library) rather than adding a dependency just for this one calculation.
export function localTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
	const pad = (n: number) => String(n).padStart(2, '0');
	const naiveUtc = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:00:00Z`);
	const asIfLocal = new Date(naiveUtc.toLocaleString('en-US', { timeZone }));
	const asIfUtc = new Date(naiveUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
	const offsetMs = asIfLocal.getTime() - asIfUtc.getTime();
	return new Date(naiveUtc.getTime() - offsetMs);
}

// "Randevu tarihi - 1 gün, danışanın yerel saatiyle 13:00" (INTEGRASYON_TODO.md message flow).
// The appointment's calendar date is read in the client's own local timezone first, since a UTC
// instant near midnight can land on a different calendar day locally.
export function computeReminderDueUtc(appointmentStartUtc: Date, timeZone: string): Date {
	const { year, month, day } = getLocalDateParts(appointmentStartUtc, timeZone);
	const dayBefore = new Date(Date.UTC(year, month - 1, day - 1));
	return localTimeToUtc(dayBefore.getUTCFullYear(), dayBefore.getUTCMonth() + 1, dayBefore.getUTCDate(), REMINDER_LOCAL_HOUR, timeZone);
}
