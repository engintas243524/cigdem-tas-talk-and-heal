import { WHATSAPP_TEMPLATES, MAX_SESSION_COUNT, locationFor, KULLANIM_KATEGORILERI, type KullanimKategori } from './config';
import { getAllRows, writeCellMirrored } from './lib/sheets';
import { sendTemplate } from './lib/whatsapp';
import { getLocalDateParts, localTimeToUtc } from './lib/timezone';
import { closeOutSessionNote, sessionFields, bookedSessionIndexes } from './lib/notes';
import { ensureRakipTakipTab, getAllRakipTakipRows } from './lib/rakipTakipSheets';
import { getRakipTakipAyar } from './lib/rakipTakipAyarSheets';
import { rakipTakipAdimUygula, gecerliPeriyotTuru } from './routes/rakipTakip';
import { ensureKullanimKaydiTab, getKullanimOzet } from './lib/kullanimKaydi';
import { ensureGiderTakipTab, upsertAylikKullanimKaydi } from './lib/giderTakipSheets';
import { sonMevzuatTakipTarihiGetir, appendMevzuatTakipKaydi } from './lib/mevzuatTakipSheets';
import { mevzuatTakipYap } from './lib/mevzuatTakip';
import { MEVZUAT_TAKIP_ARALIK_GUN } from './config';
import type { Env, SheetRow } from './types';

// Çiğdem's fixed local timezone (Madde 5 design assumption) — the "end of the session's own day" a
// note fallback is measured against.
const PANEL_TIMEZONE = 'Europe/London';

function formatAppointment(startUtc: string, timeZone: string): string {
	return new Date(startUtc).toLocaleString('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
}

interface SessionSlotFields {
	startUtcField: keyof SheetRow;
	reminderDueField: keyof SheetRow;
	reminderSentField: keyof SheetRow;
}

// Session 1 uses the original columns; sessions 2..MAX_SESSION_COUNT use the trailing
// sessionNStartUtc/sessionNReminderDueUtc/sessionNReminderSentAt columns reserved for recurring
// bookings (booking-system-expansion plan, Session 10). Checked every tick regardless of a given
// row's actual sessionCount — unused columns are just blank and skipped below.
const SESSION_SLOTS: SessionSlotFields[] = [
	{ startUtcField: 'appointmentStartUtc', reminderDueField: 'reminderDueUtc', reminderSentField: 'reminderSentAt' },
	...Array.from({ length: MAX_SESSION_COUNT - 1 }, (_, i) => {
		const n = i + 2;
		return {
			startUtcField: `session${n}StartUtc` as keyof SheetRow,
			reminderDueField: `session${n}ReminderDueUtc` as keyof SheetRow,
			reminderSentField: `session${n}ReminderSentAt` as keyof SheetRow,
		};
	}),
];

// Runs every 15 min (wrangler.jsonc cron trigger). Each session's reminder-due instant was
// computed once at booking time (config.ts REMINDER_LOCAL_HOUR), not recalculated here — this
// just checks which due sessions haven't been reminded yet, across every row and every session
// slot within a row (a recurring booking has up to MAX_SESSION_COUNT independent reminders).
export async function runReminderSweep(env: Env, now: Date = new Date()): Promise<void> {
	const rows = await getAllRows(env);

	for (const { rowNumber, row } of rows) {
		for (const slot of SESSION_SLOTS) {
			const startUtc = row[slot.startUtcField];
			const reminderDueUtc = row[slot.reminderDueField];
			if (!startUtc || row[slot.reminderSentField]) continue; // no session here, or already sent
			if (!reminderDueUtc || new Date(reminderDueUtc) > now) continue; // not due yet

			try {
				const appointment = formatAppointment(startUtc, row.clientTimeZone);
				await sendTemplate(env, row.phone, WHATSAPP_TEMPLATES.reminder, [row.name, appointment, locationFor(row.sessionMode)]);
				// Guarded before Selen's notification fires, same idempotency ordering as the Stripe
				// webhook cascade — a retried/overlapping sweep can at worst double-notify Selen.
				await writeCellMirrored(env, row, rowNumber, slot.reminderSentField, now.toISOString());
				await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.reminderSentNotice, [row.name, appointment]);
			} catch (err) {
				// A failed session slot is simply retried on the next 15-min tick (its
				// reminderSentAt cell stays empty) — no dead-letter tracking, add one if a
				// slot ever silently gets stuck.
				console.error(`Reminder sweep failed for row ${rowNumber} (${row.stripeSessionId}), slot ${slot.startUtcField}`, err);
			}
		}
	}
}

// Madde 5 fallback: once a session's own calendar day is over (past 23:59 London) and Çiğdem still
// hasn't pressed "Ekle" for it, close it out automatically — the exact same action as the manual
// button (default "Bu seansta not alınmadı." note + next-appointment WhatsApp if not the last
// session), routed through the same closeOutSessionNote guard so whichever fires first wins and the
// client is never notified twice. Runs on the same 15-min cron as the reminder sweep.
// Cancelled packages are skipped entirely: their remaining sessions were blanked at cancellation
// (so nothing to notify about), and an attended-but-cancelled package must not auto-fire either.
export async function runSessionNoteFallback(env: Env, now: Date = new Date()): Promise<void> {
	const rows = await getAllRows(env);

	for (const { rowNumber, row } of rows) {
		if (row.cancelledAt) continue;
		for (const index of bookedSessionIndexes(row)) {
			const { startUtcField, guardField, noteField } = sessionFields(index);
			if (row[guardField]) continue; // already closed (manual "Ekle" or an earlier tick)

			const { year, month, day } = getLocalDateParts(new Date(row[startUtcField]), PANEL_TIMEZONE);
			const endOfDay = new Date(localTimeToUtc(year, month, day, 23, PANEL_TIMEZONE).getTime() + 59 * 60_000);
			if (now <= endOfDay) continue; // the session's day (London) isn't over yet

			try {
				// BE-40: pass the CELL'S OWN current text, not '' — Çiğdem may already have saved a
				// note via the panel's unguarded "replace" mode and simply never clicked "Ekle". '' here
				// would blow that already-persisted note away with DEFAULT_NOTE inside closeOutSessionNote
				// (text.trim() || DEFAULT_NOTE). Passing row[noteField] preserves it when present, and
				// still falls through to DEFAULT_NOTE when the cell was genuinely never touched.
				await closeOutSessionNote(env, rowNumber, row, index, row[noteField]);
			} catch (err) {
				console.error(`Note fallback failed for row ${rowNumber} (${row.stripeSessionId}), session ${index}`, err);
			}
		}
	}
}

// Otomatik Rakip Takibi'nin cron tarafı (2026-08-15 kullanıcı kararı). İLK KONTROL, her şeyden
// önce, en ucuz olanı: anahtar kapalıysa (varsayılan) hiçbir Sheets/Claude çağrısı yapmadan çık —
// "sürekli analiz sağlayıcı tarafında ciddi fatura yaratabilir" endişesi tam olarak bunun için.
// Anahtar açıksa bile her periyot satırı için sadece dönemi GERÇEKTEN bitmişse (ya da hiç
// başlamamışsa/kapanmışsa) bir adım atılır — açık ve süresi dolmamış bir dönem için 15 dakikada
// bir gereksiz Claude çağrısı yapılmaz.
export async function runRakipTakipSweep(env: Env, now: Date = new Date()): Promise<void> {
	const ayar = await getRakipTakipAyar(env);
	if (ayar.otomatikAcik !== 'true') return;

	await ensureRakipTakipTab(env);
	const satirlar = await getAllRakipTakipRows(env);
	for (const { row } of satirlar) {
		const periyotTuru = row.periyotTuru;
		if (!gecerliPeriyotTuru(periyotTuru)) continue;
		const acikVeSuresiDolmamis = row.projeksiyon && !row.realizasyon && new Date(row.donemBitisUtc) > now;
		if (acikVeSuresiDolmamis) continue;

		try {
			// Faz 3 (otomatik 5+5 yerel/genel sınıflandırma) henüz yok — boş rakipIds,
			// rakipTakipAdimUygula'nın "boşsa tüm kayıtlı rakipler" varsayılan davranışını kullanır.
			await rakipTakipAdimUygula(env, periyotTuru, []);
		} catch (err) {
			console.error(`RakipTakip sweep failed for periyotTuru=${periyotTuru}`, err);
		}
	}
}

// Gider Takibi'nin aylık kullanım-özeti tarafı (2026-08-16, kullanıcı isteği — "kullanım
// adetlerinin sayıları da ayrı bir sayfada tutulsun"). Google/Anthropic çağrısı YAPMIYOR, sadece
// KullanimKaydi'nin zaten hesapladığı bu ayki sayımı (getKullanimOzet) GiderTakibi'ne kopyalıyor —
// maliyet riski yok, her 15 dakikada bir çalışması güvenli. Kategori başına ayda TEK satır (yerinde
// güncellenir, bkz. lib/giderTakipSheets.ts#upsertAylikKullanimKaydi) — ay değişince yeni satır.
export async function runGiderTakipAylikOzetSweep(env: Env, now: Date = new Date()): Promise<void> {
	const yilAyBaslangicUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

	await ensureKullanimKaydiTab(env);
	const ozet = await getKullanimOzet(env);

	await ensureGiderTakipTab(env);
	for (const kategori of Object.keys(KULLANIM_KATEGORILERI) as KullanimKategori[]) {
		try {
			await upsertAylikKullanimKaydi(env, {
				yilAyBaslangicUtc,
				kategori,
				kullanilanSayisi: ozet[kategori].kullanilan,
				aylikLimit: ozet[kategori].aylikLimit,
			});
		} catch (err) {
			console.error(`Gider Takibi aylık özet sweep başarısız oldu, kategori=${kategori}`, err);
		}
	}
}

// Yayın-öncesi etik/yasal gate — Faz 3 sürekli mevzuat takibi (2026-08-17). AYRI bir cron trigger
// YERİNE mevcut 15-dk cron'un içinde çalışır — kendi "süresi doldu mu" kontrolünü yapar (RakipTakip
// sweep'iyle AYNI desen, bkz. runRakipTakipSweep). Ayda ~1 kez gerçekten Anthropic'e web-arama
// çağrısı yapar (maliyeti ölçülü, bkz. MALIYET_ANALIZI_GORSEL_VIDEO_STRATEJISI.md), diğer 15-dk
// tiklerinde sadece MevzuatTakip'in son kaydını okuyup hemen çıkar. Kural listesini (lib/
// etikKurallari.ts) OTOMATİK değiştirmez — sadece bulguyu kaydeder, insan onayı bekler.
export async function runMevzuatTakipSweep(env: Env, now: Date = new Date()): Promise<void> {
	const sonTarih = await sonMevzuatTakipTarihiGetir(env);
	const suresiDoldu = !sonTarih || now.getTime() - sonTarih.getTime() >= MEVZUAT_TAKIP_ARALIK_GUN * 24 * 60 * 60 * 1000;
	if (!suresiDoldu) return;

	try {
		const { degisiklikVar, metin } = await mevzuatTakipYap(env, sonTarih);
		await appendMevzuatTakipKaydi(env, degisiklikVar, metin);
	} catch (err) {
		console.error('Mevzuat takip sweep başarısız oldu', err);
	}
}
