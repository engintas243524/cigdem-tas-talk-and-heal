# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing site + booking backend for **Talk and Heal**, Çiğdem Taş's therapy practice.
Two independent halves that must both be understood before touching either:

- **Root** — plain HTML/CSS/JS, no build step. `index.html`, `hakkimda.html`, `services.html`,
  `approach.html`, `blog.html`, `iletisim.html`, `booking.html`, `cancel.html` + `style.css`. Every
  page is bilingual via `data-en`/`data-tr` attributes toggled by a flag switcher — never hardcode
  user-facing copy in only one language.
- **`form-backend/`** — a Cloudflare Worker (Wrangler, TypeScript) that is the entire backend:
  booking, Stripe payments/refunds, Google Calendar, Google Sheets as the database, WhatsApp
  Cloud API messaging, Resend email, and a password-gated internal notes panel for Çiğdem.

Both halves currently run **against real third-party test accounts**, not mocks — Google
Calendar/Sheets, Stripe test mode, a WhatsApp test WABA, Resend sandbox. There is no staging
environment; "testing" in this repo means live API calls against those accounts, cleaned up after.

## Commands

Backend (`cd form-backend` first):
```bash
npm test                       # vitest, full suite (runs against wrangler.test.jsonc, no AI/live binding needed)
npx vitest run test/cancel.spec.ts   # single file
npx tsc --noEmit                # typecheck — run after every change, code is not considered done without this passing
npx prettier --check .          # formatting check (project convention: check before calling anything finished)
npx wrangler dev --port 8787     # local dev server, hits REAL external services using form-backend/.dev.vars
```

`form-backend/.dev.vars` (gitignored, never print its contents or put values in chat/memory) holds
all live credentials: Google service-account key, Stripe test keys, WhatsApp token, Resend key,
`CANCEL_LINK_SECRET`, `PANEL_PASSWORD`/`PANEL_TOKEN_SECRET`. `wrangler.jsonc` uses a real Workers AI
binding (`AI`, for note summarization) — this requires `npx wrangler login` to have been run once;
without it the dev server won't start. Tests use a separate `wrangler.test.jsonc` (no AI binding,
`env.AI` is stubbed in tests) so `npm test` never needs a login.

Frontend preview (repo root, no build):
```bash
python3 -m http.server 5173
```
Then open `http://localhost:5173/index.html`. `booking.html`/`cancel.html`/`iletisim.html`'s
`API_BASE` is derived from `window.location.hostname` — LAN/tunnel testing works without editing
code, but `lib/http.ts`'s `ALLOWED_ORIGINS` allowlist must include whatever origin the frontend is
served from or the Worker will reject the browser's CORS preflight.

Standing habit before starting a fresh `wrangler dev`: `pkill -f "wrangler dev"; pkill -f "workerd serve"` —
long sessions accumulate orphaned processes.

## Backend architecture

`src/index.ts` is a flat `METHOD /path` switch — no framework/router library. Each route handler
lives in `src/routes/*.ts`; each handler is one function taking `(request, env)`. Auth-gated routes
(the `/panel/*` group) call `requirePanelAuth(request, env)` first and short-circuit on a non-null
response — that's the only middleware pattern in use, don't introduce another one.

**Google Sheets is the database.** There is no SQL/KV store. `src/config.ts`'s `SHEET_COLUMNS`
array is the single source of truth for column order — `types.ts`'s `SheetRow` type derives from
it automatically (`Record<(typeof SHEET_COLUMNS)[number], string>`), and `config.ts`'s
`SHEET_COLUMN_LABELS` maps each key to the Turkish header text actually written to row 1. **Never
hand-edit the header row's meaning without updating both `SHEET_COLUMNS` and
`SHEET_COLUMN_LABELS` together** — they must stay in lockstep or the visible Sheet and the code's
idea of column order silently diverge (this has happened once, see the error log's BE-18).
`lib/sheets.ts` has the only column-letter-arithmetic (A, B, ... Z, AA, AB, ...) — do not
reimplement it elsewhere.

**A new column may be inserted next to the data it's related to — it does not have to be appended
at the end.** (Decided 2026-07-27 after a second incident: appending-only avoids a migration, but
scatters related columns and defeats readable statistics later.) Inserting mid-array shifts the
live Sheet's column letter for every key after the insertion point, so the ONLY safe order is: (1)
run the Sheets API's native `insertDimension` (batchUpdate) on the live tab FIRST — every affected
tab, Sayfa1 and every mirror — which shifts existing data/formatting for you, no manual cell
copying; (2) verify cell-by-cell that the shifted tab now matches what you expect; (3) only then
update `SHEET_COLUMNS`/`SHEET_COLUMN_LABELS` to match. Never reorder the code first and assume
`ensureHeaderRow`'s extend-only self-healing will catch up — it only ever appends a label for a
column that has none, it never rewrites a header cell that already holds something, so a stale
label left at an old position never fixes itself (this exact mistake caused BE-18 twice).

Every session slot (1..`MAX_SESSION_COUNT`) gets its own trio/quad of
columns following one naming convention: session 1's fields are unprefixed
(`appointmentStartUtc`, `reminderDueUtc`, `reminderSentAt`, `sessionNote`,
`sessionNoteSubmittedAt`), sessions 2-10 are `session2StartUtc`...`session10NoteSubmittedAt`. Match
this exact prefix pattern for any new per-session field.

**Guard-timestamp pattern for anything that sends an outbound message.** `confirmationSentAt`,
`reminderSentAt`, `sessionNoteSubmittedAt`, etc. are all "have we already done this" guards checked
before every WhatsApp/email send. This exists because Stripe retries webhooks and the cron sweep
re-scans every row every 15 minutes — without the guard, clients get duplicate messages. Any new
outbound-message code path needs the same guard-then-send-then-stamp shape, and the guard write
must happen in its own try/catch separate from other sends in the same handler (a failed send for
one channel must never prevent the guard/Sheets write for another — see error log BE-19 for the
bug this caused before the isolation was added).

**Shared logic used by both a manual endpoint and a cron sweep belongs in `lib/`, not duplicated.**
E.g. `lib/notes.ts`'s session-close action (write note-or-default, stamp guard, notify client if
not the last session) is called identically from the manual `/panel/note` endpoint and from
`scheduled.ts`'s 23:59 fallback sweep — one implementation, two triggers.

**Money/calendar/messaging side effects always go through `lib/`, never inline in a route.**
`lib/stripe.ts` (Checkout + refunds), `lib/calendar.ts` (freebusy + event create/cancel,
deterministic event IDs derived from the Stripe session ID), `lib/whatsapp.ts`, `lib/email.ts`,
`lib/policy.ts` (cancellation refund-tier math), `lib/holidays.ts` (gov.uk bank holidays, cached,
fails open to an empty list rather than blocking booking).

**Secrets are Worker secrets, IDs/keys are never hardcoded** — the whole point is that migrating
from Selen's test accounts to Çiğdem's real accounts (Phase 5, not started) is a secrets/env swap,
not a code change. Don't add a Google Calendar ID, Sheet ID, or API key as a literal anywhere.

**Timezone default is `Europe/London`** everywhere in this codebase (business hours, cancellation
policy windows, the panel's 23:59 fallback) — Çiğdem is London-based. Don't default to Turkey time
even though the developer/user are in Turkey.

## Frontend conventions

- Design system: "Jost" typeface, sage/brand color tokens in `style.css` custom properties,
  `.field`/`.btn` class patterns — reuse these, don't invent new component classes for
  already-covered UI (buttons, form fields, cards).
- Every visible string needs both `data-en` and `data-tr` — check both languages render correctly
  before calling a frontend change done.
- `cancel.html` and the notes panel (`panel.html`) are intentionally **not linked from any public
  nav** — reachable only by direct URL (a signed link, or a bookmarked password-gated page). Don't
  add nav entries for them.
- Cache-busting: `style.css` is referenced with a `?v=NN` query param across every HTML page: bump
  it on every CSS change and update it in all pages that reference it, or returning visitors get
  stale cached CSS.

## Documentation map (read before assuming something isn't decided yet)

- `INTEGRASYON_TODO.md` — the authoritative, continuously-updated build log/spec for the backend
  integration: full build order, what's done vs. pending, and verbatim records of every
  multi-part user request (kept verbatim on purpose — summaries lose exact numbered lists across
  context compaction, the raw file doesn't). Check here first for "why does this code do X."
  Session 13 (cancellation/refunds) and Madde 5 (notes panel) are done as of the latest entries.
  **Archiving (2026-08-10):** this file was ballooning (~111K tokens, auto-loaded every session) —
  fully-closed 2026-07-22→07-31 session records were moved verbatim (nothing deleted/shortened)
  to `INTEGRASYON_TODO_ARSIV.md`, with a pointer table left in this file's place. Only grep the
  archive when you need an old record's exact text; don't read it by default. When this file
  grows large again with a clearly-closed date range, repeat the same move — pick the range,
  confirm every `[ ]` in it is actually resolved (grep for stray `- [ ]`), cut with `sed`, and
  leave a pointer table (see `git log -- INTEGRASYON_TODO.md` around 2026-08-10 for the exact
  method).
- `talk-and-heal-hata-gunlugu/` — the bug/QA log, one file per phase of
  `AI_DESTEKLI_WEB_GELISTIRME_REHBERI.md`'s 10-stage process (`04-Frontend` = frontend bugs only,
  `05-Backend-Entegrasyon` = backend-only, etc.). File a bug in the phase it actually belongs to,
  not whichever phase happened to be active when it was found. Regenerate the paired `.docx` with
  `pandoc <file>.md -o <file>.docx` after editing any `.md` here.
- `NOTES.md` — open placeholders (real WhatsApp number, real photo, pricing copy) and the
  **critical pre-launch gate**: every test-account integration (WhatsApp, Calendar, email) must be
  swapped to Çiğdem's own real accounts before any deploy/push/customer-facing release.
- `AI_DESTEKLI_WEB_GELISTIRME_REHBERI.md` — the 10-stage development framework this whole project
  follows; `INTEGRASYON_TODO.md`'s phases map onto stage 5 (backend), with stages 6/10 to be
  updated once new endpoints exist.
- `MALIYET_ANALIZI_GORSEL_VIDEO_STRATEJISI.md` (2026-08-16) — real, measured (not estimated) cost
  of the `icerikStrateji` web search feature (4 live API calls), the reasoning for picking
  `web_search_20250305` over the newer dynamic-filtering version, and the budget-margin risk this
  creates against the existing $5/month Anthropic cap in `config.ts`'s `KULLANIM_KATEGORILERI`.
- `CIGDEM_AYLIK_YILLIK_GIDERLER.md` (2026-08-16) — the same cost data, reformatted as a simple
  itemized monthly/annual table for Çiğdem (non-technical reader) to review.
- `RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md` (2026-08-17) — research report for the still-unbuilt
  "Faz 3" (5 local + 5 general auto-classified competitors, see `INTEGRASYON_TODO.md`): how Google
  Text Search's 60-result cap actually ranks results, WASK/academic sourcing for measurable
  local-vs-general competitor criteria, the Turkish psychologist/psychiatrist advertising-ethics
  constraint, and the two-layer "Parameter Set 1 (find/rank) + Parameter Set 2 (analyze/report)"
  architecture — Set 1 is now implemented in `lib/rakipBulmaSiralama.ts` (grid search in
  `lib/places.ts`), Set 2's 4 groups are wired into `AKSIYON_ANALIZ_SYSTEM_PROMPT`.
- `GORSEL_VIDEO_STRATEJISI_KRITERLERI_ARASTIRMASI.md` (2026-08-17) — the same two-layer
  architecture applied to Görsel/Video Stratejisi (icerikStrateji): research only, not yet coded —
  Set 1 (content/trend find-rank) can't be a real numeric formula until YouTube Data API is
  integrated (confirmed $0 cost, not yet built), so it's proposed as a prompt-guide for now; Set 2's
  4 groups include a hard pre-publish ethics gate with concrete banned-phrase examples for the
  Turkish psychologist/psychiatrist advertising-ethics constraint.
- `BACP_INGILTERE_MEVZUAT_ARASTIRMASI.md` (2026-08-17) — Faz 0 of the full "sector/branch/profession
  ethics gate" roadmap (plan file: see `~/.claude-hesap2/plans/harmonic-tumbling-toast.md` for the
  full phased plan). Researches the UK regime (BACP Ethical Framework + CAP Code) since `index.html`
  advertises Çiğdem as "BACP Registered Psychotherapist" but prior ethics research only covered
  Turkish TPD/TTB rules. Key correction: BACP/CAP applies to ALL of Çiğdem's content regardless of
  language (membership condition), TPD/TTB applies additionally only for Turkey-targeted content —
  NOT a simple EN/TR language split as originally assumed. Includes concrete banned-phrase table
  (outcome-guarantee claims, false accreditation-status claims — real 2025 ASA precedent, competitor
  denigration) feeding Faz 1 (`YAYINCI_PROFILLERI` config) and Faz 2 (deterministic `etikGate.ts`).

## Mimari Yaklaşım Notu (2026-08-09 analizi — herhangi bir yeni aşama/entegrasyona geçmeden önce oku)

Bu proje **canlıda**, gerçek müşteri (Çiğdem Taş) + ödeme + randevu + kişisel veri işliyor —
Çoklu Ajan Mimarisi'ne (kalıcı paralel domain-ajanları) GEÇME. Mevcut 10-aşama +
`INTEGRASYON_TODO.md` kademeli-onay disiplinini sürdür; bu, canlı/riskli/zincirleme-bağımlı
(ödeme→bildirim→log gibi) projeler için doğru kalıp. Sadece gerçekten bağımsız iki iş varsa
(ör. DNS devri ile WhatsApp şablon onayı bekleme) ayrı promptlarda ele al — kalıcı ajan mimarisi
kurmaya gerek yok. Detaylı gerekçe ve alternatif seçenekler:
`/Users/selencelik/Desktop/10 AŞAMALI ÜRÜN DÖNGÜSÜ/10 AŞAMALI ÜRÜN DÖNGÜSÜ-1/hibrit_10_asama_ajan_takimi_rehberi.md`
