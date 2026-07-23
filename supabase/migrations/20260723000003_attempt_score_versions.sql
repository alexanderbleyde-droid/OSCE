-- ============================================================
-- Versioned score persistence (pillar 7 / plan 5.4).
--
-- The score of record is the one computed at Finish and must never be silently
-- overwritten. Each scoring run is a versioned row in attempt_scores; the FIRST
-- score (Finish) is is_of_record = true and is mirrored onto the attempt's flat
-- columns (what the Station Report / dashboard read cheaply). A re-score inserts
-- a NEW non-record version and leaves the record untouched. Promoting a re-score
-- to the record is an EXPLICIT flag that re-points the record and re-mirrors.
--
-- attempt_scores is fully server-authored: candidates cannot touch it (no write,
-- and RLS SELECT is admin-only). Candidates read their result via the mirrored
-- columns on their own attempt.
-- ============================================================

create table public.attempt_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  version int not null,
  is_of_record boolean not null default false,
  domain_scores jsonb,
  aggregate int check (aggregate between 0 and 100),
  critical_failed boolean not null default false,
  bridge_triggered boolean not null default false,
  score_detail jsonb,
  scoring_model text,
  scored_at timestamptz not null default now(),
  unique (attempt_id, version)
);
create index attempt_scores_attempt_id_idx on public.attempt_scores (attempt_id);
-- At most one of-record row per attempt.
create unique index attempt_scores_one_of_record
  on public.attempt_scores (attempt_id) where is_of_record;

alter table public.attempt_scores enable row level security;

-- Read is admin-only; candidates never read this table directly (they read the
-- mirrored score off their own attempt row). No candidate write path exists.
create policy "attempt_scores_select_admin"
  on public.attempt_scores for select to authenticated
  using (public.is_admin());

revoke all on public.attempt_scores from anon, authenticated;
grant select on public.attempt_scores to authenticated; -- gated to admins by RLS
grant all on public.attempt_scores to service_role;

-- Backfill: existing scored attempts become version 1, is_of_record = true.
insert into public.attempt_scores
  (attempt_id, version, is_of_record, domain_scores, aggregate, critical_failed,
   bridge_triggered, score_detail, scoring_model, scored_at)
select id, 1, true, domain_scores, aggregate, critical_failed,
       bridge_triggered, score_detail, scoring_model, coalesce(scored_at, now())
from public.attempts
where scored_at is not null;

-- Version-aware scoring RPC replaces the unconditional-overwrite score_attempt.
drop function if exists public.score_attempt(uuid, uuid, jsonb, int, boolean, boolean, jsonb, text);

create or replace function public.record_attempt_score(
  p_attempt uuid,
  p_user uuid,
  p_domain_scores jsonb,
  p_aggregate int,
  p_critical_failed boolean,
  p_bridge_triggered boolean,
  p_detail jsonb,
  p_model text,
  p_promote boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_completed timestamptz;
  v_next int;
  v_has_record boolean;
  v_is_record boolean;
begin
  select user_id, completed_at into v_owner, v_completed
  from public.attempts where id = p_attempt for update;

  if v_owner is null then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;
  if v_owner <> p_user then raise exception 'not_owner' using errcode = 'P0003'; end if;
  if v_completed is null then raise exception 'not_completed' using errcode = 'P0005'; end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.attempt_scores where attempt_id = p_attempt;

  select exists(
    select 1 from public.attempt_scores where attempt_id = p_attempt and is_of_record
  ) into v_has_record;

  -- The first score is the record; a later score becomes the record only when
  -- explicitly promoted.
  v_is_record := (not v_has_record) or p_promote;

  if v_is_record and v_has_record then
    update public.attempt_scores set is_of_record = false
    where attempt_id = p_attempt and is_of_record;
  end if;

  insert into public.attempt_scores
    (attempt_id, version, is_of_record, domain_scores, aggregate, critical_failed,
     bridge_triggered, score_detail, scoring_model)
  values
    (p_attempt, v_next, v_is_record, p_domain_scores, p_aggregate, p_critical_failed,
     p_bridge_triggered, p_detail, p_model);

  -- Mirror ONLY the of-record score onto the attempt for cheap report reads.
  if v_is_record then
    update public.attempts
    set domain_scores = p_domain_scores,
        aggregate = p_aggregate,
        critical_failed = p_critical_failed,
        bridge_triggered = p_bridge_triggered,
        score_detail = p_detail,
        scoring_model = p_model,
        scored_at = now()
    where id = p_attempt;
  end if;

  return jsonb_build_object('version', v_next, 'ofRecord', v_is_record);
end;
$$;

revoke execute on function public.record_attempt_score(uuid, uuid, jsonb, int, boolean, boolean, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_attempt_score(uuid, uuid, jsonb, int, boolean, boolean, jsonb, text, boolean)
  to service_role;
