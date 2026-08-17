import type { SessionType, SessionMode, TherapyMode, SHEET_COLUMNS } from './config';

export interface Env {
	GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
	GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
	GOOGLE_CALENDAR_ID: string;
	GOOGLE_SHEET_ID: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	WHATSAPP_ACCESS_TOKEN: string;
	WHATSAPP_PHONE_NUMBER_ID: string;
	WHATSAPP_VERIFY_TOKEN: string;
	SELEN_WHATSAPP_NUMBER: string;
	SELEN_NOTIFICATION_EMAIL: string;
	RESEND_API_KEY: string;
	// HMAC key for signing/verifying cancellation links (Session 13).
	CANCEL_LINK_SECRET: string;
	// Madde 5 control panel: single shared login password (plain compare, one user) + HMAC key for
	// the signed, time-limited session token minted on login.
	PANEL_PASSWORD: string;
	PANEL_TOKEN_SECRET: string;
	// Rakip Analizi & Strateji Altyapısı: Claude Sonnet 5 (rapor üretimi) + Google Places (konum
	// bazlı rakip arama). Her ikisi de yalnızca /panel/rakip-analizi/* route'larında kullanılır.
	ANTHROPIC_API_KEY: string;
	GOOGLE_PLACES_API_KEY: string;
	// Görsel/Video Stratejisi Set 1 (2026-08-17): YouTube Data API v3, konu/trend bulma-sıralama.
	YOUTUBE_API_KEY: string;
	// Workers AI binding — summarizes the client's free-text note (lib/summarize.ts).
	AI: Ai;
}

export interface BookingRequest {
	name: string;
	email: string;
	phone: string;
	summary: string;
	sessionType: SessionType;
	therapyMode: TherapyMode;
	sessionMode: SessionMode;
	// ISO instants, must each match a slot returned by /availability. Length 1 for a normal
	// booking; 2-MAX_SESSION_COUNT for a recurring/weekly package (booking-system-expansion plan,
	// Session 10) — one slot per consecutive week, earliest first.
	slotStartUtcs: string[];
	cancellationAck: boolean;
}

// Every Sheets cell is read/written as a string (Sheets API v4 values are always strings) — this
// mirrors SHEET_COLUMNS exactly via `typeof`, so the two can never drift out of sync even as the
// column list grows (booking-system-expansion plan added ~37 columns in one pass).
export type SheetRow = Record<(typeof SHEET_COLUMNS)[number], string>;
