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

// The real Stripe metadata value cap (source: https://docs.stripe.com/metadata) — Google Sheets
// must NEVER receive a summarized version of the client's note, only the full (grammar-corrected)
// text, regardless of length (2026-08-11, revised after a live test showed the Sheet getting an
// unwanted AI summary). Since a single metadata value can't hold more than this many characters,
// routes/booking.ts splits the summary across as many `summaryN` fields as needed (up to Stripe's
// 50-key cap) and routes/stripe-webhook.ts reassembles them — nothing is ever condensed here.
export const STRIPE_METADATA_VALUE_MAX = 500;

// ── Rakip Analizi & Strateji Altyapısı ──────────────────────────────────────────────────────────
// Sayfa1'den (randevu/müşteri verisi) TAMAMEN AYRI bir sekme — kullanıcının açık isteği, asla
// karışmamalı. Kendi kolon şeması var, SHEET_COLUMNS'a hiç dokunmuyor.

export const RAKIP_ANALIZI_TAB_NAME = 'RakipAnalizi';

export const RAKIP_ANALIZI_COLUMNS = [
	'id',
	'createdAtUtc',
	'kaynak', // 'manuel' | 'harita'
	'isim',
	'link',
	'adres',
	'not', // Çiğdem'in yazı/ses girişi (manuel kaynak) veya harita seçimine eklediği not
	'dal', // 'icerikStrateji' | 'aksiyonAnaliz'
	'raporMetni', // Claude'un ürettiği çıktı
	// Sona eklendi (2026-08-15) — kaynak='harita' satırlarının hangi arama sonucu bulunduğunu
	// kaydeder ("bu rakip hangi arama sonucu bulundu?" sorusuna cevap). kaynak='manuel' satırlarda
	// boş kalır. Mevcut satırlar/kod ile uyumluluk için sona eklendi, aradaki sütunlar kaymadı.
	'aramaAdres', // arama kutusuna girilen adres/semt
	'aramaSorgu', // arama terimi (ör. "avukat")
	'aramaRadiusMeters', // seçilen yarıçap
] as const;

export const RAKIP_ANALIZI_COLUMN_LABELS: Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string> = {
	id: 'ID',
	createdAtUtc: 'Oluşturulma (UTC)',
	kaynak: 'Kaynak',
	isim: 'Rakip İsmi',
	link: 'Link',
	adres: 'Adres',
	not: 'Not',
	dal: 'Dal',
	raporMetni: 'Rapor Metni',
	aramaAdres: 'Arama Adresi',
	aramaSorgu: 'Arama Terimi',
	aramaRadiusMeters: 'Arama Yarıçapı (m)',
};

// Rakip Analizi ekranının kullanım kotası/sayaç sistemi (2026-08-15, icerikStrateji/aksiyonAnaliz
// limitleri 2026-08-16 eklendi). Her API çağrısı burada bir "kategori" olarak loglanır — hem
// Sheet'te insan-okunur bir kayıt (hangi tarihte hangi işlem) hem de aylık kota kontrolü için tek
// kaynak. Tüm kategorilerde aylikLimit aşılınca istek reddedilir (bkz. kotaDolduMu).
// - adresBulma/rakipArama (Google Places/Geocoding): Google ücretsiz kotayı aşınca engellemiyor,
//   sessizce faturalandırmaya başlıyor — limit BİZİM kendi güvenlik sınırımız.
// - icerikStrateji/aksiyonAnaliz (Anthropic/Claude rapor üretimi): bu projenin Anthropic API
//   key'ine ayrılan aylık bütçe $5 (kullanıcı teyidi, 2026-08-16). Rapor başına maliyet ek
//   kaynak/PDF yokken ~$0.03-0.05, İçe Aktar ile eklenen metin kaynaklarının üst sınırında
//   (10 belge × 20.000 karakter) ~$0.15-0.17'ye çıkıyor (Sonnet 5: $2/M girdi, $10/M çıktı,
//   4096 token çıktı varsayımıyla) — PDF ekleri bunun da üstüne çıkabilir (sayfa sayısı
//   sınırlanmadığı için üst sınırı yok), o yüzden limit metin-ekli en kötü senaryo baz alınarak
//   ($0.20/rapor) hesaplandı: $5 / $0.20 ≈ 25 rapor, iki kategori arasında ~yarı yarıya
//   paylaştırıldı. Anthropic'in kendi bakiyesi (InsufficientCreditError) zaten son çare olarak
//   duruyor, bu limit ondan ÖNCE devreye giren ek bir güvenlik katmanı. Kullanım artarsa ya da
//   bütçe değişirse bu iki sayı elle güncellenmeli — otomatik/dinamik hesaplama yok.
export const KULLANIM_KAYDI_TAB_NAME = 'KullanimKaydi';

export const KULLANIM_KAYDI_COLUMNS = ['id', 'tarihUtc', 'kategori', 'detay'] as const;

export const KULLANIM_KAYDI_COLUMN_LABELS: Record<(typeof KULLANIM_KAYDI_COLUMNS)[number], string> = {
	id: 'ID',
	tarihUtc: 'Tarih (UTC)',
	kategori: 'Kategori',
	detay: 'Detay',
};

export const KULLANIM_KATEGORILERI = {
	adresBulma: { etiket: 'Adres Bulma', aylikLimit: 10000 as number | null },
	rakipArama: { etiket: 'Rakip Arama', aylikLimit: 5000 as number | null },
	icerikStrateji: { etiket: 'Görsel/Video Stratejisi', aylikLimit: 12 as number | null },
	aksiyonAnaliz: { etiket: 'Aksiyon/Hedef Analizi', aylikLimit: 13 as number | null },
} as const;

export type KullanimKategori = keyof typeof KULLANIM_KATEGORILERI;

// Limit Yükseltme (2026-08-16, kullanıcı isteği). Sadece Anthropic/Claude kategorileri (icerikStrateji,
// aksiyonAnaliz) buraya dahil — bunların limiti gerçek bir $ kredi bakiyesine karşılık geliyor,
// "yükleme yap → daha çok rapor hakkı" mantığı burada anlamlı. adresBulma/rakipArama BİLEREK dışarıda
// bırakıldı: onların limiti Google'ın kendi faturalandırmasına karşı BİZİM koyduğumuz kendi güvenlik
// sınırımız — karşılığında bir "kredi yükleme" işlemi yok, zaten çok cömert (10.000/5.000) ve
// kullanımın çok altında (6/6). Anthropic'in webhook/programatik bakiye API'si olmadığı için
// (2026-08-16'da araştırıldı, doğrulandı) bu akış tamamen manuel: Çiğdem sağlayıcıya gidip yükleme
// yapar, ne kadar yüklediğini kendisi girer, biz USD karşılığını hesaplayıp (bkz. lib/currency.ts)
// RAPOR_MALIYETI_USD'ye bölüp limite ekleriz.
export const KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER = ['icerikStrateji', 'aksiyonAnaliz'] as const;

// config.ts'deki KULLANIM_KATEGORILERI yorumunda hesaplanan "metin-ekli en kötü senaryo" rapor
// maliyeti — limit yükseltme hesaplamasında da AYNI rakam kullanılıyor, iki yerde ayrı ayrı
// tutulmuyor.
export const RAPOR_MALIYETI_USD = 0.2;

export const ANTHROPIC_BILLING_URL = 'https://console.anthropic.com/settings/billing';

export const KULLANIM_LIMIT_TAB_NAME = 'KullanimLimitleri';

export const KULLANIM_LIMIT_COLUMNS = ['kategori', 'limit', 'sonEklenenTutar', 'sonEklenenParaBirimi', 'guncellenmeUtc'] as const;

export const KULLANIM_LIMIT_COLUMN_LABELS: Record<(typeof KULLANIM_LIMIT_COLUMNS)[number], string> = {
	kategori: 'Kategori',
	limit: 'Limit',
	sonEklenenTutar: 'Son Eklenen Tutar',
	sonEklenenParaBirimi: 'Son Eklenen Para Birimi',
	guncellenmeUtc: 'Güncellenme (UTC)',
};

// Otomatik 10-rakip periyodik takip + OKR döngüsü (2026-08-15, Faz 1 — sadece veri modeli, henüz
// hiçbir route/UI bunu kullanmıyor). Kullanıcı kararı: raporlar Sheet'i satır satır büyütmesin
// (bkz. INTEGRASYON_TODO.md), o yüzden bu sekme klasik "her olayda append" değil, periyot türü
// başına TEK, SABİT bir satır tutuyor — döngü ilerledikçe o satır YERİNDE güncelleniyor (append
// değil). 10 rakip × 6 periyot türü × haftalarca/aylarca çalışan bir döngü satır-bazlı bir modelde
// çok hızlı devasa bir tabloya dönüşürdü, bu tasarım onu baştan engelliyor.
export const RAKIP_TAKIP_TAB_NAME = 'RakipTakip';

export const RAKIP_TAKIP_COLUMNS = [
	'periyotTuru', // RAKIP_TAKIP_PERIYOT_TURLERI'nden biri — sabit, hiç değişmez (satırın kimliği)
	'donemBaslangicUtc',
	'donemBitisUtc',
	'projeksiyon', // TODO/NOT-TODO içerikli, dönem başında üretilen projeksiyon metni
	'hedef',
	'realizasyon', // dönem bitince doldurulur — o dönemde gerçekte ne yapıldığı
	'fark', // hedef-realizasyon farkı + neden analizi (eksik/yanlış/zamanlama) — bir sonraki
	// projeksiyonun NOT-TODO girdisi olur
	'guncellenmeUtc',
] as const;

export const RAKIP_TAKIP_COLUMN_LABELS: Record<(typeof RAKIP_TAKIP_COLUMNS)[number], string> = {
	periyotTuru: 'Periyot Türü',
	donemBaslangicUtc: 'Dönem Başlangıç (UTC)',
	donemBitisUtc: 'Dönem Bitiş (UTC)',
	projeksiyon: 'Projeksiyon (TODO/NOT-TODO)',
	hedef: 'Hedef',
	realizasyon: 'Realizasyon',
	fark: 'Hedef-Realizasyon Farkı',
	guncellenmeUtc: 'Güncellenme (UTC)',
};

export const RAKIP_TAKIP_PERIYOT_TURLERI = ['haftalik', 'aylik', 'ucAylik', 'altiAylik', 'dokuzAylik', 'onikiAylik'] as const;

export type RakipTakipPeriyotTuru = (typeof RAKIP_TAKIP_PERIYOT_TURLERI)[number];

// Takvim ayı/çeyrek hesaplarının zaman dilimi/gün-sayısı tuzaklarına (bkz. CLAUDE.md'nin
// Europe/London varsayılanı) girmemek için sabit gün sayısı kullanılıyor — takvimsel değil,
// yaklaşık bir periyot uzunluğu yeterli (OKR döngüsü zaten kesin takvim hizalaması gerektirmiyor).
export const RAKIP_TAKIP_PERIYOT_GUN_SAYISI: Record<RakipTakipPeriyotTuru, number> = {
	haftalik: 7,
	aylik: 30,
	ucAylik: 90,
	altiAylik: 180,
	dokuzAylik: 270,
	onikiAylik: 365,
};

// Otomatik Rakip Takibi'nin başlat/durdur anahtarı (2026-08-15) — kullanıcı kararı: "sürekli analiz
// sağlayıcı tarafında ciddi fatura yaratabilir", o yüzden cron sweep varsayılan KAPALI ve sadece bu
// anahtar açıkken çalışır (bkz. scheduled.ts runRakipTakipSweep). Tek satırlık, sabit — RakipTakip
// ile aynı "asla append etme, yerinde güncelle" prensibi.
export const RAKIP_TAKIP_AYAR_TAB_NAME = 'RakipTakipAyar';

export const RAKIP_TAKIP_AYAR_COLUMNS = ['otomatikAcik', 'acildigiZamanUtc', 'kapandigiZamanUtc'] as const;

export const RAKIP_TAKIP_AYAR_COLUMN_LABELS: Record<(typeof RAKIP_TAKIP_AYAR_COLUMNS)[number], string> = {
	otomatikAcik: 'Otomatik Takip Açık mı',
	acildigiZamanUtc: 'Açıldığı Zaman (UTC)',
	kapandigiZamanUtc: 'Kapandığı Zaman (UTC)',
};

// Zaman-içi karşılaştırma/grafik raporu (2026-08-15) — her varlığın (Talk and Heal'in kendisi +
// takip edilen rakipler) periyot başına SNAPSHOT'ı. RakipTakip'in aksine bu tab append EDER (her
// kapanan dönem yeni bir satır), ama SINIRSIZ değil: (varlikId, periyotTuru) çifti başına en fazla
// RAKIP_TAKIP_GECMIS_MAX_KAYIT satır tutulur, dolunca en eski satır silinir (rotasyon). Bu, "hiç
// büyümesin" (RakipTakip) ile "trend grafiği için geçmiş lazım" ihtiyacı arasındaki, kullanıcıyla
// netleştirilmiş orta yol — sonsuz değil, ama son 12 periyotluk bir pencere var.
export const RAKIP_TAKIP_GECMIS_TAB_NAME = 'RakipTakipGecmis';

export const RAKIP_TAKIP_GECMIS_MAX_KAYIT = 12;

// varlikId: Talk and Heal'in kendisi için sabit 'talkAndHeal', rakipler için RakipAnalizi
// sekmesindeki row.id. varlikAdi ayrıca tutuluyor ki rakip ismi sonradan değişse/silinse bile
// geçmiş grafikte doğru etiketle görünsün (snapshot anındaki isim donuyor).
export const RAKIP_TAKIP_GECMIS_COLUMNS = [
	'id',
	'varlikId',
	'varlikAdi',
	'periyotTuru',
	'donemBaslangicUtc',
	'donemBitisUtc',
	'parametreSkorlariJson', // '{"fiyat": 7, "konum": null, ...}' — null: bu dönem için veri/kanıt yoktu
	'raporMetni',
	'eklenmeTarihUtc',
] as const;

export const RAKIP_TAKIP_GECMIS_COLUMN_LABELS: Record<(typeof RAKIP_TAKIP_GECMIS_COLUMNS)[number], string> = {
	id: 'ID',
	varlikId: 'Varlık ID',
	varlikAdi: 'Varlık Adı',
	periyotTuru: 'Periyot Türü',
	donemBaslangicUtc: 'Dönem Başlangıç (UTC)',
	donemBitisUtc: 'Dönem Bitiş (UTC)',
	parametreSkorlariJson: 'Parametre Skorları (JSON)',
	raporMetni: 'Rapor Metni',
	eklenmeTarihUtc: 'Eklenme Tarihi (UTC)',
};

// Talk and Heal'in kendi varlık kimliği — bir rakip id'siyle asla çakışmaz (crypto.randomUUID
// formatı değil, sabit okunabilir bir string).
export const TALK_AND_HEAL_VARLIK_ID = 'talkAndHeal';
