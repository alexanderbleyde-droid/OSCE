-- ============================================================
-- Security hardening: attempts are fully SERVER-AUTHORED on write.
--
-- `transcript` and `completed_at` are written ONLY by the service-role RPCs
-- (append_transcript_message, complete_attempt). The residual candidate
-- column-UPDATE grant (from init_schema, a Phase-0 assumption) let a candidate
-- PATCH their OWN transcript directly via PostgREST before finishing —
-- rewriting it to strip unexplained jargon or fake a teach-back and thereby
-- EVADE the deterministic critical-fail facts (jargon count, teach-back miss)
-- that scoring derives from the transcript. Revoke it.
--
-- Candidates keep SELECT on their own attempts (for the Station Report) and the
-- INSERT grant (used only in tests; real creation is service-role); they now
-- have NO direct UPDATE path to attempts.
-- ============================================================

revoke update (transcript, completed_at) on public.attempts from authenticated;
