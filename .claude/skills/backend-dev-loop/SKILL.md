---
name: backend-dev-loop
description: Start the Talk & Heal form-backend local dev environment (wrangler dev + static frontend server) and run the pre-completion verification checklist (typecheck, format, tests) before calling any form-backend/booking.html/cancel.html/panel.html change done. Use this whenever you're about to run the app locally, or right before reporting a backend change as finished — do not skip the checklist just because the change looks small.
---

# Backend dev loop

Two things this project needs constantly and gets wrong if skipped: a clean local
dev server, and a pre-completion check. Both are cheap; skipping either has already
caused real bugs in this repo (see `CLAUDE.md`, `talk-and-heal-hata-gunlugu/`).

## Starting local dev

Long sessions accumulate orphaned `wrangler dev` processes that hold port 8787 —
always clear them before starting a fresh one:

```bash
pkill -f "wrangler dev"; pkill -f "workerd serve"
```

Then, from `form-backend/`:

```bash
npx wrangler dev --port 8787
```

This hits **real** external services (Google Sheets/Calendar, Stripe test mode,
WhatsApp test WABA, Resend sandbox) using `form-backend/.dev.vars` — there is no
staging environment. `wrangler.jsonc` has a real Workers AI binding, which needs
`npx wrangler login` to have been run once on this machine; without it the dev
server won't start.

For the frontend, from the repo root:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/index.html` (or `booking.html` / `cancel.html` /
`panel.html` directly). `API_BASE` in those pages is derived from
`window.location.hostname`, so LAN/tunnel testing works without editing code — but
`form-backend/src/lib/http.ts`'s `ALLOWED_ORIGINS` allowlist must include whatever
origin the frontend is actually served from, or the Worker rejects the browser's
CORS preflight. If you change the frontend's port/host/tunnel, check that file too.

Never print the contents of `.dev.vars`/`.dev.vars.*` to the transcript (use
`open -e` if the user needs to see a value themselves).

## Before calling a change done

From `form-backend/`, run all three — a form-backend change is not finished until
these pass, not just "the one file I touched compiles":

```bash
npx tsc --noEmit        # typecheck
npx prettier --check .  # formatting
npm test                # full vitest suite, no login needed (uses wrangler.test.jsonc)
```

If a single spec file is enough while iterating, `npx vitest run test/<file>.spec.ts`
is faster, but run the full three before reporting the task complete.

If any of the three fail, fix the actual problem — don't reach for `--no-verify`,
skip flags, or silence the checker.

## If this drifts

`CLAUDE.md`'s "Commands" section is the source of truth for this project. If a
command here stops working, that file (not this skill) is what changed — update
both together.
