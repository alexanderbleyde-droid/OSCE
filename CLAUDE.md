# CLAUDE.md — Plexus OSCE Simulator

## What this is
AI-powered OSCE (clinical exam) simulator. Candidates run chat-based encounters
with an AI standardized patient; the system scores them across five domains and
remediates gaps through a Knowledge Bridge. Admins create and manage stations
from a dashboard.

## Binding reference
The approved V3 design in `docs/design/` is the single source of truth for
look, behavior, and scope. Its `docs/requirements-map.html` traces every
client requirement. Do not deviate from it. If an instruction conflicts with
the V3 design, STOP and flag it instead of executing.

## Stack (decided — do not substitute)
- Next.js (App Router, TypeScript) on Vercel
- Supabase: Postgres + Auth (passwordless email OTP) + RLS + Storage
- Tailwind CSS mapped to the V3 token system (below)
- Vercel AI SDK for the encounter streaming route
- Zod for all runtime validation; types shared from `lib/contracts/`

## Workflow rules (non-negotiable)
1. Work on `main`. No branches, no PRs at this stage.
2. NEVER commit before the user has verified the running result on the local
   dev server. Sequence per task: implement → `npm run dev` → tell the user
   what to check at http://localhost:3000 → WAIT for explicit approval →
   commit with a clear message → push to `main`.
3. One task at a time. Finish, verify, push. No drive-by refactors.
4. Never hardcode secrets. All keys live in `.env.local` (gitignored) and
   Vercel env vars. `.env.example` documents required vars without values.
5. Migrations are files in `supabase/migrations/`, never ad-hoc SQL in the
   dashboard.

## Design system (from V3 — never invent new colors)
- Brand teal: `#14B8A6` · bright `#2DD4BF` · deep `#0D9488`
- Dark theme default, light theme via `data-theme="light"` on <html>
- Dark canvas `#060B14`; light text-primary `#0F172A`
- Fonts: Inter (sans), Geist (display), JetBrains Mono (mono)
- Status colors (requirements/reporting): teal = spec+prototype,
  blue `#60A5FA`, gold `#D4A574`, green `#34D399`
- Every screen must be checked in BOTH themes before it counts as done.
- Full token set: read `docs/design/index.html` :root block and
  `docs/design/osce-design-system-v1.html`. Port values exactly.

## Domain rules (the engine contract — see docs/spec/)
- Stations are DATA, never code. Schema in `docs/spec/station-schema.md`.
- Five scoring domains, 0–100%, pass threshold 65%, critical-fail overrides
  aggregate regardless of score.
- Every station enforces: randomized question pool (≥1 safety, ≥1 lifestyle),
  progressive disclosure of withheld facts, closing & teach-back before end.
- Knowledge Bridge is a separate post-encounter remediation flow, NOT the
  station report. Triggers: any domain < 50%, critical fail, construct = 0.
- Exam mode vs Tutor mode (Socratic) are distinct encounter behaviors.
- English only. No i18n scaffolding (client BRD is explicit).

## Project plan
`docs/plan/project-plan.csv` is the living project plan (IDs, milestones,
dependencies, acceptance criteria). Rules:
1. Whenever a commit completes a task from the plan, update that task's
   Status in the SAME commit. Keep edits surgical (plain-text line edits,
   never a CSV-library rewrite of the whole file).
2. Every commit that updates plan task statuses must end its report with
   "Plan progress: X/Y tasks Done (Z%)".

## Definition of done (every task)
- Type-checks, lints, and builds cleanly
- Verified by the user on localhost in dark AND light themes
- No console errors
- RLS verified for any new table (candidate cannot read/write admin data;
  tenant isolation holds)
- Committed and pushed to `main`
