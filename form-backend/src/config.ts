// Session length only depends on sessionType — unaffected by sessionMode/therapyMode below.
export const SESSION_DURATIONS = {
	standard: 50,
	// Duration is a TBD default (only the £150 online-individual price was originally specified)
	// — same "TBD" convention pricing.html already uses.
	extended: 80,
} as const;

export type SessionType = keyof typeof SESSION_DURATIONS;
export type SessionMode = 'online' | 'inPerson';
export type TherapyMode = 'individual' | 'couple';

// Full pricing matrix, confirmed 2026-07-22 (previously only online/individual existed).
export const PRICING: Record<SessionMode, Record<TherapyMode, Record<SessionType, number>>> = {
	online: {
		individual: { standard: 120, extended: 150 },
		couple: { standard: 200, extended: 250 },
	},
	inPerson: {
		individual: { standard: 140, extended: 175 },
		couple: { standard: 350, extended: 425 },
	},
};

export function getPriceGBP(sessionMode: SessionMode, therapyMode: TherapyMode, sessionType: SessionType): number {
	return PRICING[sessionMode][therapyMode][sessionType];
}

export function getSessionMinutes(sessionType: SessionType): number {
	return SESSION_DURATIONS[sessionType];
}

// Confirmed 2026-07-22: bookable slots must always start on the hour (9, 10, 11, 14, 15, 16 in
// London local time), not back-to-back by session duration — see lib/calendar.ts's SLOT_STEP_MS.
// A lunch break (12:00-14:00) is excluded, so no session may start at 12 or 13.
export const BUSINESS_HOURS = {
	timeZone: 'Europe/London',
	// 1 = Monday ... 5 = Friday (ISO weekday)
	days: [1, 2, 3, 4, 5],
	startHour: 9,
	endHour: 17,
	// A candidate slot-start whose local hour (in timeZone) is >= startHour and < endHour of this
	// window is never offered — i.e. no session starts at 12:00 or 13:00.
	lunchBreak: { startHour: 12, endHour: 14 },
} as const;

// Exact template names as submitted to Meta (INTEGRASYON_TODO.md). Re-check variable order
// against WhatsApp Manager before wiring lib/whatsapp.ts — two of these were already corrected
// once after Meta's initial rejection.
export const WHATSAPP_TEMPLATES = {
	bookingConfirmation: 'randevu_onay_danisan',
	reminder: 'randevu_hatirlatma_danisan',
	newBookingNotice: 'yeni_randevu_bildirimi',
	reminderSentNotice: 'hatirlatma_gonderildi_bildirimi',
	// Created and approved on Meta's side 2026-07-22 (confirmed live in WhatsApp Manager
	// 2026-07-27) — this comment used to say "not yet drafted/submitted", which was stale.
	cancellationConfirmed: 'iptal_onay_danisan',
	cancellationNotice: 'iptal_bildirimi_selen',
	// Submitted to Meta 2026-08-10 (Madde 11) — status PENDING, awaiting approval before it can
	// actually send. Single {{1}} variable holds Çiğdem's own freeform note (condolence/no-show/
	// general concern), wrapped in enough static text to pass Meta's "not variable-only" body rule.
	cancellationPersonalNote: 'iptal_kisisel_not_danisan',
} as const;

// Confirmed against the real WABA via the Graph API message_templates endpoint (2026-07-22):
// Meta registered all 4 of our templates under plain 'en', not 'en_US' — a mismatch here fails
// the send outright (found via a real Session 6 webhook test).
export const WHATSAPP_TEMPLATE_LANGUAGE = 'en';

// Sandbox default: an unverified Resend account can only send from its shared onboarding address,
// and only to the account owner's own (Selen's) verified email. Phase 5 switches this to
// `help@talkandheal.co.uk` once Çiğdem's own Resend account has that domain DNS-verified.
export const EMAIL_FROM = 'Talk and Heal <onboarding@resend.dev>';

// Default tab name — confirmed against the real sheet (2026-07-21): Turkish-locale Google
// accounts name the default tab "Sayfa1", not "Sheet1".
export const SHEET_TAB_NAME = 'Sayfa1';

// Maximum sessions in one recurring/multi-session purchase (booking-system-expansion plan).
// Raised 10 -> 20 (2026-07-28, INTEGRASYON_TODO.md) — the Sheet's per-session fixed-column layout
// can't go truly unlimited, 20 is the agreed practical cap.
export const MAX_SESSION_COUNT = 20;

// Column layout for the "Talk and Heal – Danışan Kayıtları" Google Sheet.
// lib/sheets.ts is the only module that should need to know this order.
// Session 1's own start/reminder-due/reminder-sent columns are unchanged (appointmentStartUtc /
// reminderDueUtc / reminderSentAt below) — sessions 2..MAX_SESSION_COUNT get their own trailing
// triplet each, always reserved up front (simpler than a variable column count per row; unused
// ones are just left blank for shorter/single-session bookings).
const SESSION_NUMBER_COLUMNS = Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => i + 2).flatMap((n) => [
	`session${n}StartUtc`,
	`session${n}ReminderDueUtc`,
	`session${n}ReminderSentAt`,
]);

// Madde 5 (kontrol paneli): per-session therapist note + a guard timestamp ("işlendi") that both
// the manual "Ekle" button and the 23:59 cron fallback share, so a session is closed out exactly
// once. Session 1 is prefix-less (sessionNote/sessionNoteSubmittedAt), sessions 2..N carry the
// sessionN prefix — the same scheme as the start/reminder columns above. Appended at the very END
// of SHEET_COLUMNS (below), never inserted mid-list: the live sheet already holds real data laid
// out by this exact column order, so new columns must only ever grow the right edge.
const SESSION_NOTE_COLUMNS = [
	'sessionNote',
	'sessionNoteSubmittedAt',
	...Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => i + 2).flatMap((n) => [`session${n}Note`, `session${n}NoteSubmittedAt`]),
];

export const SHEET_COLUMNS = [
	'stripeSessionId',
	'name',
	'email',
	'phone',
	'summary',
	'sessionType',
	'sessionDurationMinutes',
	'therapyMode',
	'sessionMode',
	'priceGBP',
	'sessionCount',
	'policyTier',
	'appointmentStartUtc',
	'clientTimeZone',
	'reminderDueUtc',
	'confirmationSentAt',
	'reminderSentAt',
	...SESSION_NUMBER_COLUMNS,
	'cancelledAt',
	'cancellationReason',
	'cancelledBy',
	'stripeRefundId',
	'refundPercent',
	'refundAmount',
	// A column CAN be inserted next to the data it's related to, not just appended at the end —
	// but doing so means the array index (and therefore the live Sheet's column letter) of every
	// column after the insertion point shifts by one. That only stays safe if the live Sheet's
	// already-written columns are migrated to match, in the same move: use the Sheets API's native
	// `insertDimension` (shifts existing data/formatting for you, no manual cell copying) on every
	// affected tab (Sayfa1 + every "{N} Seans" mirror), THEN update this array — never the other way
	// around, and never just reorder the array and hope ensureHeaderRow's extend-only self-healing
	// catches up (it only ever appends missing labels, it never rewrites a header cell that already
	// has something in it, so a stale label left behind by an old insertion never fixes itself).
	'activeSessionCount',
	...SESSION_NOTE_COLUMNS,
	// Appended (not inserted next to the other cancellation columns above) — 2026-08-10, Madde 11:
	// deliberately safe-but-scattered rather than risking a live insertDimension migration on the
	// production Sheet under time pressure (see the BE-18 warning above; this project has corrupted
	// header rows from a mid-array insert twice already). Move it next to cancellationReason later
	// if it's ever worth the migration.
	'cancellationClientMessage',
] as const;

// Human-readable Turkish header text for the real Google Sheet — Selen reads this sheet directly,
// the internal camelCase keys above are only for the code. Record<...> forces every SHEET_COLUMNS
// key to have a label at compile time (TypeScript error if one is ever added without the other).
// Verified 2026-07-22 against the real live sheet: rewrote row 1 with exactly this labeling and
// confirmed a real test booking's every populated cell landed under the matching header.
const SESSION_NUMBER_LABELS = Object.fromEntries(
	Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => i + 2).flatMap((n) => [
		[`session${n}StartUtc`, `${n}. Seans Tarihi/Saati (UTC)`],
		[`session${n}ReminderDueUtc`, `${n}. Seans Hatırlatma Zamanı (UTC)`],
		[`session${n}ReminderSentAt`, `${n}. Seans Hatırlatma Mesajı Gönderildi (Zaman)`],
	]),
);

const SESSION_NOTE_LABELS = {
	sessionNote: '1. Seans Notu',
	sessionNoteSubmittedAt: '1. Seans Notu İşlendi',
	...Object.fromEntries(
		Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => i + 2).flatMap((n) => [
			[`session${n}Note`, `${n}. Seans Notu`],
			[`session${n}NoteSubmittedAt`, `${n}. Seans Notu İşlendi`],
		]),
	),
};

export const SHEET_COLUMN_LABELS: Record<(typeof SHEET_COLUMNS)[number], string> = {
	stripeSessionId: 'Stripe İşlem No (İlk Ödeme)',
	name: 'Ad Soyad',
	email: 'E-posta',
	phone: 'Telefon',
	summary: 'Sorun Özeti',
	sessionType: 'Seans Türü (Standart/Uzatılmış)',
	sessionDurationMinutes: 'Seans Süresi',
	therapyMode: 'Terapi Türü (Bireysel/Çift)',
	sessionMode: 'Seans Şekli (Online/Yüz Yüze)',
	priceGBP: 'Toplam Ücret (GBP)',
	sessionCount: 'Toplam Seans Sayısı',
	policyTier: 'İptal Politikası Kademesi',
	appointmentStartUtc: '1. Seans Tarihi/Saati (UTC)',
	clientTimeZone: 'Danışan Saat Dilimi',
	reminderDueUtc: '1. Seans Hatırlatma Zamanı (UTC)',
	confirmationSentAt: 'Onay Mesajı Gönderildi (Zaman)',
	reminderSentAt: '1. Seans Hatırlatma Mesajı Gönderildi (Zaman)',
	...SESSION_NUMBER_LABELS,
	cancelledAt: 'İptal Edilme Zamanı',
	cancellationReason: 'İptal Nedeni',
	cancelledBy: 'İptal Eden (Danışan/Çiğdem)',
	stripeRefundId: 'Stripe İşlem No (İade)',
	refundPercent: 'İade Oranı (%)',
	refundAmount: 'İade Tutarı (GBP)',
	activeSessionCount: 'İptal Sonrası Kalan Seans Sayısı',
	...SESSION_NOTE_LABELS,
	cancellationClientMessage: 'Danışana Giden Kişisel İptal Notu',
};

// Reminder is sent the day before the appointment, at this local hour in the client's
// detected timezone (INTEGRASYON_TODO.md message flow spec).
export const REMINDER_LOCAL_HOUR = 13;

// TBD: the booking page (Phase 3) doesn't exist yet. Placeholder pages on the real domain —
// update once Phase 3 ships the actual success/cancel routes.
export const STRIPE_SUCCESS_URL = 'https://talkandheal.co.uk/booking-success';
export const STRIPE_CANCEL_URL = 'https://talkandheal.co.uk/booking-cancelled';
// Same TBD placeholder convention — used by the WhatsApp welcome message (Session 5).
export const BOOKING_PAGE_URL = 'https://talkandheal.co.uk/booking';
// Client-facing cancellation page (Session 13). The HMAC-signed cancel link in the confirmation
// email points here: `${CANCEL_PAGE_URL}?session=<id>&token=<hmac>`.
export const CANCEL_PAGE_URL = 'https://talkandheal.co.uk/cancel';

// Fixed dropdown options for Çiğdem's manual/override cancellation in the panel (2026-07-26) — the
// override exists for extreme circumstances where the automatic <72h-forfeits-everything policy
// shouldn't apply. 'Diğer' requires a typed detail (panel.html shows a text field for it); every
// other value is used as-is as the Sheets `cancellationReason` cell.
export const CANCELLATION_OVERRIDE_REASONS = [
	'Ağır hastalık',
	'Vefat',
	'Doğum',
	'Kaza / Hastane yatışı',
	'Ailevi acil durum',
	'Habersiz gelmedi',
	'Diğer',
] as const;

// Used in the WhatsApp {{3}} Location field for online bookings.
export const SESSION_LOCATION = 'Online — a video call link will be shared separately';
// TBD: real in-person address not yet provided by Çiğdem — placeholder until confirmed, same
// convention as the other TBD constants above. Used in {{3}} for in-person bookings instead.
export const IN_PERSON_ADDRESS = '[In-person address to be confirmed]';

// The two approved-pending templates share one generic {{3}} "Location" variable — no separate
// online/in-person template needed, just a different value for the same slot. Used by both the
// Stripe webhook cascade and the cron reminder sweep.
export function locationFor(sessionMode: string): string {
	return sessionMode === 'inPerson' ? IN_PERSON_ADDRESS : SESSION_LOCATION;
}

// Stripe Checkout metadata values cap at 500 chars — truncate defensively at the trust boundary
// even though the frontend form also caps "Sorun Özeti" client-side.
export const SUMMARY_MAX_LENGTH = 450;

// The real Stripe metadata value cap (source: https://docs.stripe.com/metadata) — used as the
// decision boundary for the booking summary's full-text-vs-AI-summary rule (2026-08-11, Madde
// 500): at or under this many characters (checked at submit time, AFTER any Translate/Metni
// Düzelt edit — not frozen at whatever the visitor first typed), the summary fits Stripe metadata
// as-is and the Sheet gets the FULL text; over it, metadata can't hold the raw text at all, so
// it's AI-summarized before Checkout is even created (see routes/booking.ts).
export const SUMMARY_SUMMARIZE_THRESHOLD = 500;
