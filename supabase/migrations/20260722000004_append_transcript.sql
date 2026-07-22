-- ============================================================
-- Atomic transcript append. The encounter route appends one message at a
-- time (candidate turn, then patient turn) with a server-authored timestamp,
-- avoiding read-modify-write races and keeping `at` off the client clock.
-- Service-role only; the route proves attempt ownership before calling it.
-- Refuses to append to a completed attempt.
-- ============================================================

create or replace function public.append_transcript_message(
  p_attempt uuid,
  p_user uuid,
  p_role text,
  p_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed timestamptz;
  v_owner uuid;
begin
  if p_role not in ('candidate', 'patient') then
    raise exception 'invalid_role';
  end if;

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
    raise exception 'attempt_completed' using errcode = 'P0004';
  end if;

  update public.attempts
  set transcript = coalesce(transcript, '[]'::jsonb) || jsonb_build_object(
    'role', p_role,
    'text', p_text,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  where id = p_attempt;
end;
$$;

revoke execute on function public.append_transcript_message(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.append_transcript_message(uuid, uuid, text, text)
  to service_role;
