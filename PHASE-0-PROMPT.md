# PHASE 0 — Foundation (paste this into Claude Code)

Read CLAUDE.md and docs/spec/station-schema.md fully before writing anything.
Follow the workflow rules in CLAUDE.md exactly: after each STEP below, show me
the result on the local dev server, WAIT for my approval, then commit and push
to main before starting the next step.

## STEP 1 — Scaffold
- Next.js (App Router, TypeScript, Tailwind, ESLint) in the repo root.
- Install: @supabase/supabase-js, @supabase/ssr, zod, ai (Vercel AI SDK).
- Set up the V3 design tokens as CSS custom properties + Tailwind theme
  mapping. Port values EXACTLY from docs/design/index.html :root (dark
  default + [data-theme="light"] overrides). Add the theme toggle
  (localStorage persists; no flash on load).
- Fonts: Inter, Geist, JetBrains Mono via next/font.
- Build a placeholder home page using the tokens: brand mark + "Plexus /
  OSCE · V3" wordmark centered, theme toggle top-right. This proves the
  token port visually.
- .env.example with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (values empty).
CHECKPOINT: I verify tokens/toggle on localhost in both themes.

## STEP 2 — Database schema + RLS
- Supabase CLI: init, link to my project (I will provide the project ref),
  first migration implementing docs/spec/station-schema.md:
  profiles (id fk auth.users, role: admin|candidate, training_level,
  specialty_id), specialties, stations, station_versions, attempts.
- RLS on every table:
  - candidates: read enabled stations' current version only; read/write own
    attempts only; read own profile.
  - admins: full CRUD on stations/versions/specialties; read all attempts.
  - no anonymous access to anything.
- Zod schema lib/contracts/station.ts mirroring StationContent exactly, plus
  shared TS types for all tables (lib/contracts/db.ts).
- Seed migration: specialties list incl. PM&R; one admin profile hook
  (I will create the auth user manually and give you its UUID).
CHECKPOINT: migration applied, `supabase db reset` clean, RLS smoke-tested
via two scripted queries (candidate blocked from draft station; candidate
blocked from another user's attempt). Show me the test output.

## STEP 3 — Auth
- Passwordless email OTP via Supabase Auth (@supabase/ssr pattern:
  middleware + server client).
- /signin page styled per V3 screen docs/design/osce-screen-04-signin.html.
- Auth callback -> profile bootstrap (first sign-in creates candidate
  profile; admin role only ever set server-side).
- Route protection: /admin/** requires admin role; /app/** requires session.
  Unauthorized -> redirect /signin.
CHECKPOINT: I sign in with a real email on localhost, land on a stub
dashboard, /admin blocked for candidate role. Both themes.

## STEP 4 — App shell
- Two layout shells using V3 chrome:
  - /app (candidate): topbar per V3 system pages (brand left, nav center,
    theme toggle right — see docs/design/system.html patched header).
  - /admin: sidebar layout per docs/design/osce-screen-06-admin-overview.html.
- Empty routed pages: /app (dashboard), /app/stations, /app/profile,
  /admin (overview), /admin/stations, /admin/users, /admin/settings.
CHECKPOINT: I click through every route in both themes. Then commit, push,
and STOP. Phase 1 comes as a separate prompt.

## Hard constraints (repeat of CLAUDE.md — they apply to every step)
- No commit before my localhost approval. No branches. No new colors.
- English only, no i18n scaffolding.
- If anything in this prompt conflicts with CLAUDE.md or the V3 design,
  stop and ask me instead of choosing silently.
