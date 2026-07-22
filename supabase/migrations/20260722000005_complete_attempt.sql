-- ============================================================
-- Attempt completion (end-of-station transition, pillar 6 / plan 4.18).
-- Server-authored: sets completed_at and records the engine-computed
-- end state (closing coverage, teach-back detection, silent-fail flag) into
-- engine_config. Candidates can set completed_at via their column grant, but
-- the END-STATE metadata must be authoritative, so this runs service-role.
-- Idempotent-safe: refuses to re-complete an already-completed attempt.
-- ============================================================

create or replace function public.complete_attempt(
  p_attempt uuid,
  p_user uuid,
  p_end_state jsonb
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
  if v_completed is not null then
    raise exception 'already_completed' using errcode = 'P0004';
  end if;

  update public.attempts
  set completed_at = now(),
      engine_config = coalesce(engine_config, '{}'::jsonb)
        || jsonb_build_object('endState', p_end_state)
  where id = p_attempt;
end;
$$;

revoke execute on function public.complete_attempt(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_attempt(uuid, uuid, jsonb)
  to service_role;
