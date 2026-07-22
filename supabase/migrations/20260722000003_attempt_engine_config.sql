-- ============================================================
-- Server-authored engine state per attempt: the AI Dial tier and the
-- question set sampled at attempt creation (spec: 2-3 questions,
-- >=1 safety + >=1 lifestyle; a refresh must NEVER re-roll).
--
-- Kept OUT of transcript because transcript is candidate-writable by
-- design (plan 4.28) — engine parameters must not be tamperable.
-- Column grants: authenticated's INSERT/UPDATE grants enumerate columns
-- and do NOT include engine_config, so only the service role writes it.
-- ============================================================

alter table public.attempts
  add column engine_config jsonb;

comment on column public.attempts.engine_config is
  'Server-authored: { tier: 1|2|3, sampledQuestionIds: string[] }. Never client-writable.';
