-- ============================================================
-- Attempt scoring (pillar 7 / plan 5.1-5.4). Server-authored: writes the
-- five domain scores, weighted aggregate, pass/fail via critical override,
-- and the bridge trigger — plus a rich `score_detail` (per-domain rationale,
-- triggered flags, bridge reasons, construct scores) for the Station Report.
--
-- The candidate can never write these: authenticated has no column grant on
-- them (see init_schema), and this RPC is service_role only. Re-scoring is
-- allowed and OVERWRITES (deterministic re-run), so no already-scored guard;
-- the attempt must, however, be COMPLETED first.
-- ============================================================

alter table public.attempts
  add column if not exists score_detail jsonb,
  add column if not exists scored_at timestamptz,
  add column if not exists scoring_model text;

create or replace function public.score_attempt(
  p_attempt uuid,
  p_user uuid,
  p_domain_scores jsonb,
  p_aggregate int,
  p_critical_failed boolean,
  p_bridge_triggered boolean,
  p_detail jsonb,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_completed timestamptz;
begin
  select user_id, completed_at into v_owner, v_completed
  from public.attempts
  where id = p_attempt
  for update;

  if v_owner is null then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_owner <> p_user then
    raise exception 'not_owner' using errcode = 'P0003';
  end if;
  if v_completed is null then
    raise exception 'not_completed' using errcode = 'P0005';
  end if;

  update public.attempts
  set domain_scores = p_domain_scores,
      aggregate = p_aggregate,
      critical_failed = p_critical_failed,
      bridge_triggered = p_bridge_triggered,
      score_detail = p_detail,
      scoring_model = p_model,
      scored_at = now()
  where id = p_attempt;
end;
$$;

revoke execute on function public.score_attempt(uuid, uuid, jsonb, int, boolean, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.score_attempt(uuid, uuid, jsonb, int, boolean, boolean, jsonb, text)
  to service_role;
