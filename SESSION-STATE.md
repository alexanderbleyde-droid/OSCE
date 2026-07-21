# SESSION STATE — Plexus OSCE Simulator

Updated: 21 Jul 2026 · Phase 0 complete (tag `phase-0-complete`)

## Where we are

Phase 0 (Foundation) is done and approved at every checkpoint, per the
workflow in CLAUDE.md (implement → verify on localhost in both themes →
commit → push to `main`). The V3 design in `docs/design/` remains the binding
reference; `docs/plan/project-plan.csv` is the living plan (tasks 3.1–3.8
Done; 3.9–3.12 deployment tasks are next).

### Step 1 — Scaffold + design tokens (`d7947c0`)
- Next.js 16.2.10 (App Router, TypeScript, Tailwind v4, ESLint), npm.
- Deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod` (v4), `ai` (v7),
  `server-only`.
- V3 tokens ported into `app/globals.css` — dark default on
  `:root`/`[data-theme="dark"]`, light overrides on `[data-theme="light"]`.
  A scripted diff verified all 72 values match `docs/design/index.html`
  exactly. Later steps added the canonical glass/status/rail tokens from the
  V3 system pages. Tailwind mapping via `@theme inline`
  (`text-primary`, `bg-surface-2`, `border-border-default`, `font-display`…).
- Fonts: Inter, Geist, JetBrains Mono via `next/font/google`, wired into the
  exact V3 stacks.
- Theme toggle (`components/theme-toggle.tsx`): V3 pill,
  `localStorage["plexus-theme"]`, inline pre-paint script in
  `app/layout.tsx` → no flash.
- Brand mark: inline SVG (`components/BrandMark.tsx`), path data verbatim
  from `docs/design/system.html`. The raster PNGs were rejected at
  checkpoint (no alpha) — never reintroduce them.

### Step 2 — Database schema + RLS + contracts (`65b92db`)
- Supabase project `plexus-osce` (`efmdukkigevksnygjpnz`, eu-central-1),
  linked via CLI; migrations pushed:
  - `20260721000001_init_schema.sql` — specialties, profiles, stations,
    station_versions, attempts; enums; updated_at triggers; version
    immutability trigger; enable-guard trigger; composite FK making
    `stations.current_version` always point at a real version row;
    `is_admin()` / `has_attempted_station()` / `is_current_enabled_version()`
    security-definer helpers; `promote_to_admin()` (service-role-only);
    full RLS; anon fully revoked.
  - `20260721000002_seed_specialties.sql` — 8 specialties incl. PM&R.
- **Security model (deliberate deviations, approved at checkpoint):**
  - `station_versions` SELECT is **admin-only** — the content jsonb is the
    examiner pack (withheld facts, expected answers, rubric, MCQ keys) and
    RLS cannot mask jsonb sub-fields. Candidates get candidate-safe fields
    through server routes (Phase 1).
  - Attempt scoring columns (`domain_scores`, `aggregate`, `critical_failed`,
    `bridge_triggered`) are **server-authored** via column grants; clients
    may insert an attempt (`user_id`, `station_version_id`, `mode`,
    `transcript`) and update `transcript`/`completed_at` only.
  - Candidates keep reading the **metadata** of stations they attempted even
    after disable (spec: past attempts stay reportable); version content
    stays hidden.
- Contracts: `lib/contracts/station.ts` (Zod `stationContentSchema` for
  structure; `stationEnableSchema`/`validateForEnable` for the draft→enabled
  gates: ≥1 safety + ≥1 lifestyle question, weights sum 100, all five
  domains present, mustCover non-empty, ≥1 critical flag) and
  `lib/contracts/db.ts` (row types, `DomainScores`, bridge-trigger rule).
- `npm run rls:smoke` (`scripts/rls-smoke.ts`) — 18/18 checks pass against
  the live DB (anon lockout, draft invisibility, attempt isolation, grade
  tampering, answer-key + embedding leak, role escalation). Re-run after any
  RLS change.

### Step 3 — Auth (`bd15d53`)
- Passwordless email magic link (Supabase OTP, PKCE): `signInWithOtp` →
  `/auth/callback` exchanges the code, bootstraps a candidate profile on
  first sign-in (validates optional `specialty_id` from user metadata),
  redirects to `/app`; bad/expired links → `/signin?state=expired`.
- `@supabase/ssr` per current docs: `lib/supabase/client.ts`, `server.ts`,
  `admin.ts` (service role, `server-only`-guarded), root `proxy.ts`
  (Next 16 replaces middleware) → `lib/supabase/proxy.ts` `updateSession`
  with `getClaims()`.
- Route protection: `/app/**` session; `/admin/**` session + admin role read
  from `profiles` (never JWT metadata); unauthorized → `/signin`; signed-in
  visitors to `/signin` → `/app`. Layouts re-check server-side.
- `/signin` styled per V3 screen 04: split brand/auth layout, three states
  (form / link sent / expired), sign-up specialization select fed from the
  DB via service role.
- Admin: `13e9957f-bbbb-47f1-bdef-24a9459bb4e8` promoted via
  `scripts/promote-admin.ts` (UUID passed as arg — never hardcoded).
  OTP expiry set to 900s to match design copy.

### Step 4 — App shells (`cc5bac1`)
- Candidate: `components/app-topbar.tsx` — V3 system-page topbar (brand
  left, nav centered, toggle + sign-out right; active = teal on glass).
- Admin: `components/admin-rail.tsx` — screen-06 rail (240px, `--rail-bg`,
  section labels, glowing active bar, user chip). Toggle + sign-out sit
  top-right of admin main (mockup rail has no controls).
- Routes (all placeholder content): `/app`, `/app/stations`, `/app/profile`,
  `/admin`, `/admin/stations`, `/admin/users`, `/admin/settings`.
- Shared chrome CSS: `components/shell.css`.

## Deliberately deferred
- **Production deployment** (plan 3.9–3.12): no Vercel project yet; auth
  redirect URLs are localhost-only; deployment setup precedes Phase 1.
- **Mobile chrome**: topnav hides ≤880px, rail hides ≤1024px per the
  mockups; no mobile navigation alternative yet.
- **Bridge asset shapes**: the spec leaves miniCases/mcqs/pearls/frameworks
  element shapes open; minimal shapes were defined in
  `lib/contracts/station.ts` and approved, revisit when the Knowledge
  Bridge is built.
- **`supabase db reset` locally**: Docker not installed on the dev machine;
  migrations verified by clean apply to the fresh remote + smoke tests.

## Environment notes
- `.env.local` (gitignored) holds Supabase URL/keys + empty
  `ANTHROPIC_API_KEY`. `.env.example` documents required vars.
- Supabase CLI via `npx supabase` with `SUPABASE_ACCESS_TOKEN` env var.
- Windows dev machine; PowerShell 5.1; beware UTF-8 BOM when writing files
  outside the agent's Write tool.

## Next
Phase 1 (separate prompt) after deployment setup: station authoring against
the contract, encounter engine (Vercel AI SDK streaming route serving
candidate-safe content), scoring, Station Report, Knowledge Bridge.
