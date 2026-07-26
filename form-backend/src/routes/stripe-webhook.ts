import type Stripe from 'stripe';
import { WHATSAPP_TEMPLATES, SUMMARY_MAX_LENGTH, getSessionMinutes, locationFor, type SessionType } from '../config';
import { constructStripeEvent } from '../lib/stripe';
import { createCalendarEvent } from '../lib/calendar';
import { computeReminderDueUtc } from '../lib/timezone';
import {
	findRowBySessionId,
	appendBookingRow,
	writeCellMirrored,
	getRow,
	emptySheetRow,
	ensureHeaderRow,
	mirrorBookingRow,
} from '../lib/sheets';
import { sendTemplate } from '../lib/whatsapp';
import { sendEmail } from '../lib/email';
import { buildCancelUrl } from '../lib/cancel-link';
import { summarizeNote } from '../lib/summarize';
import { errorResponse } from '../lib/http';
import type { Env, SheetRow } from '../types';

function formatAppointment(startUtc: string, timeZone: string): string {
	return new Date(startUtc).toLocaleString('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
}

interface SessionPlan {
	index: number; // 1-based (1 = the original single-session columns, 2..N = trailing columns)
	startUtc: string;
	endUtc: string;
	reminderDueUtc: string;
}

function buildSessionPlan(slotStartUtcs: string[], sessionType: SessionType, clientTimeZone: string): SessionPlan[] {
	const durationMs = getSessionMinutes(sessionType) * 60_000;
	return slotStartUtcs.map((startUtc, i) => ({
		index: i + 1,
		startUtc,
		endUtc: new Date(new Date(startUtc).getTime() + durationMs).toISOString(),
		reminderDueUtc: computeReminderDueUtc(new Date(startUtc), clientTimeZone).toISOString(),
	}));
}

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
	const signature = request.headers.get('stripe-signature');
	if (!signature) return errorResponse(request, 400, 'Missing stripe-signature header');

	const rawBody = await request.text(); // read exactly once — a second read throws in Workers
	let event: Stripe.Event;
	try {
		event = await constructStripeEvent(env, rawBody, signature);
	} catch (err) {
		return errorResponse(request, 400, 'Invalid webhook signature', err);
	}

	if (event.type !== 'checkout.session.completed') {
		return new Response('OK', { status: 200 }); // nothing else in our flow acts on other events
	}

	const session = event.data.object as Stripe.Checkout.Session;
	const md = session.metadata ?? {};
	const stripeSessionId = session.id;
	const slotStartUtcs: string[] = JSON.parse(md.slotStartUtcsJson ?? '[]');
	const plan = buildSessionPlan(slotStartUtcs, md.sessionType as SessionType, md.clientTimeZone);
	const firstSession = plan[0];
	const appointment = formatAppointment(firstSession.startUtc, md.clientTimeZone);
	const sessionCount = plan.length;
	const appointmentLabel = sessionCount > 1 ? `${appointment} (first of ${sessionCount} weekly sessions)` : appointment;
	// A real (AI-condensed) summary, not the client's raw note verbatim — this is what the field
	// is actually named ("Sorun Özeti"/Summary) everywhere it's stored or sent. Falls back to the
	// raw text on any Workers AI hiccup (see summarize.ts), so this never blocks the booking.
	const summary = await summarizeNote(env, md.summary ?? '');

	try {
		// 1. Calendar events — idempotent (deterministic id per session index derived from the
		// Stripe session id, a retried delivery 409s instead of double-booking). Session 1 keeps
		// the original unsuffixed id scheme for continuity with rows created before this session).
		for (const s of plan) {
			await createCalendarEvent(env, {
				stripeSessionId: s.index === 1 ? stripeSessionId : `${stripeSessionId}_s${s.index}`,
				summary: `Talk and Heal — ${md.name}`,
				description: summary,
				startUtc: s.startUtc,
				endUtc: s.endUtc,
			});
		}

		// 2. Sheets row — idempotent (skip the append if this session id is already logged). One
		// row per purchase: session 1 uses the original columns, sessions 2..N use the trailing
		// sessionNStartUtc/sessionNReminderDueUtc/sessionNReminderSentAt columns reserved for them.
		let rowNumber = await findRowBySessionId(env, stripeSessionId);
		if (rowNumber === null) {
			const row: SheetRow = {
				...emptySheetRow(),
				stripeSessionId,
				name: md.name ?? '',
				email: md.email ?? '',
				phone: md.phone ?? '',
				summary: summary.slice(0, SUMMARY_MAX_LENGTH),
				sessionType: md.sessionType ?? '',
				// Human-readable minutes for Selen's sheet, derived from the existing SESSION_DURATIONS
				// (via getSessionMinutes) — no new mapping. e.g. "50 dk" / "80 dk".
				sessionDurationMinutes: `${getSessionMinutes(md.sessionType as SessionType)} dk`,
				therapyMode: md.therapyMode ?? '',
				sessionMode: md.sessionMode ?? '',
				priceGBP: md.priceGBP ?? '',
				sessionCount: md.sessionCount ?? '1',
				policyTier: md.policyTier ?? '',
				appointmentStartUtc: firstSession.startUtc,
				clientTimeZone: md.clientTimeZone ?? '',
				reminderDueUtc: firstSession.reminderDueUtc,
			};
			for (const s of plan.slice(1)) {
				row[`session${s.index}StartUtc` as keyof SheetRow] = s.startUtc;
				row[`session${s.index}ReminderDueUtc` as keyof SheetRow] = s.reminderDueUtc;
			}
			await ensureHeaderRow(env); // extend-only — backfills any column SHEET_COLUMNS grew since the header was last written
			rowNumber = await appendBookingRow(env, row);
			// Madde 7: sessionCount > 1 also gets a full copy in its "{N} Seans" tab. Self-isolated —
			// a mirror failure never fails the booking cascade (this returns 200 as usual).
			await mirrorBookingRow(env, row);
		}

		// 3+4. Client confirmation (covers session 1 only — sessions 2..N are each covered by
		// their own day-before reminder, see scheduled.ts), guarded by the row's
		// confirmationSentAt cell — written immediately after send, before Selen's notifications
		// fire below. A crash/retry after this point can at worst double-notify Selen, never
		// double-message the client (see plan doc idempotency ordering).
		const existingRow = await getRow(env, rowNumber!);
		if (!existingRow.confirmationSentAt) {
			// Isolated in its own try/catch — same reasoning as the email isolation just below: an
			// uncaught failure here (e.g. the WhatsApp API/WABA rejecting the send) would throw all the
			// way to the outer catch, turning the whole cascade into a 500 even though Calendar/Sheets
			// already succeeded above. That 500 makes Stripe retry the same webhook forever, and since
			// the guard below is never reached, steps 5/6 (notifying Selen of the new booking) never
			// fire either — Selen would never learn about a booking just because the client's own
			// WhatsApp channel is broken. Swallow + log instead, matching the email isolation's guard
			// semantics: attempted, not necessarily delivered.
			try {
				await sendTemplate(env, md.phone, WHATSAPP_TEMPLATES.bookingConfirmation, [md.name, appointment, locationFor(md.sessionMode)]);
			} catch (err) {
				console.error(`Client confirmation WhatsApp failed for ${stripeSessionId}:`, err);
			}
			// Client email carries the HMAC-signed cancel link. Deliberately isolated in its own
			// try/catch: while Resend stays in sandbox mode (EMAIL_FROM's onboarding address can only
			// send to Selen's own verified address, see config.ts), this WILL fail for any real
			// client's email. If it threw uncaught here, the guard below would never be written, and
			// every Stripe webhook retry would re-send the WhatsApp confirmation above to the client —
			// exactly the double-message-the-client bug Session 6 guarded against. Swallow + log
			// instead, so a broken email channel never blocks the guard or repeats the WhatsApp send.
			try {
				const cancelUrl = await buildCancelUrl(env, stripeSessionId);
				await sendEmail(
					env,
					md.email,
					'Your Talk and Heal booking is confirmed',
					`Hi ${md.name},\n\nYour booking is confirmed.\nAppointment: ${appointmentLabel}\n${locationFor(md.sessionMode)}\n\nIf you need to cancel, use this secure link (any refund is calculated automatically from our cancellation policy):\n${cancelUrl}\n\nWarm wishes,\nTalk and Heal`,
				);
			} catch (err) {
				console.error(`Client confirmation email failed for ${stripeSessionId}:`, err);
			}
			await writeCellMirrored(env, existingRow, rowNumber!, 'confirmationSentAt', new Date().toISOString());
		}

		// 5. Notify Selen — new booking (WhatsApp + email). Each channel isolated (same reasoning as
		// the client-confirmation isolation above): a broken WhatsApp channel must never swallow the
		// email notification, or vice versa, and neither should turn an already-successful
		// Calendar/Sheets booking into a 500 that Stripe retries forever.
		try {
			await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.newBookingNotice, [
				md.name ?? '',
				`${md.email ?? ''} / ${md.phone ?? ''}`,
				appointmentLabel,
				summary,
			]);
		} catch (err) {
			console.error(`Selen new-booking WhatsApp failed for ${stripeSessionId}:`, err);
		}
		try {
			await sendEmail(
				env,
				env.SELEN_NOTIFICATION_EMAIL,
				'New Talk and Heal booking',
				`New booking from ${md.name}.\nContact: ${md.email} / ${md.phone}\nAppointment: ${appointmentLabel}\nSummary: ${summary}`,
			);
		} catch (err) {
			console.error(`Selen new-booking email failed for ${stripeSessionId}:`, err);
		}

		// 6. Notify Selen — client confirmation was sent (reuses the same template as the cron
		// reminder-sent notice, per INTEGRASYON_TODO.md's "Varsayım" note — the user grouped both
		// the post-payment and day-before messages under one "WhatsApp hatırlatma" notification).
		try {
			await sendTemplate(env, env.SELEN_WHATSAPP_NUMBER, WHATSAPP_TEMPLATES.reminderSentNotice, [md.name ?? '', appointmentLabel]);
		} catch (err) {
			console.error(`Selen confirmation-sent WhatsApp failed for ${stripeSessionId}:`, err);
		}

		return new Response('OK', { status: 200 });
	} catch (err) {
		return errorResponse(request, 500, 'Booking cascade failed', err);
	}
}
