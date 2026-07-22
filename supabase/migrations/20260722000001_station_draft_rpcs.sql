-- ============================================================
-- Atomic draft-save RPCs. The admin UI previously issued 2-3 separate
-- PostgREST statements per save; a transient failure mid-sequence could
-- orphan a station row (permanently reserving its code) or leave a draft
-- with current_version NULL. Each function below is one transaction.
-- Service-role only — never callable by clients.
-- ============================================================

create or replace function public.create_station_draft(
  p_code text,
  p_title text,
  p_specialty uuid,
  p_levels public.training_level[],
  p_content jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station uuid;
begin
  insert into public.stations (code, title, specialty_id, training_levels, status, created_by)
  values (p_code, p_title, p_specialty, p_levels, 'draft', p_created_by)
  returning id into v_station;

  insert into public.station_versions (station_id, version, content)
  values (v_station, 1, p_content);

  update public.stations set current_version = 1 where id = v_station;

  return v_station;
end;
$$;

revoke execute on function public.create_station_draft(text, text, uuid, public.training_level[], jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_station_draft(text, text, uuid, public.training_level[], jsonb, uuid)
  to service_role;

-- Updates a DRAFT station's metadata + latest version content atomically.
-- Locks the station row, re-asserts draft status inside the transaction
-- (no TOCTOU with future lifecycle transitions), and verifies the caller
-- edited the version it thinks it edited.
create or replace function public.update_station_draft(
  p_station uuid,
  p_code text,
  p_title text,
  p_specialty uuid,
  p_levels public.training_level[],
  p_content jsonb,
  p_expected_version int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.station_status;
  v_latest int;
begin
  select status into v_status
  from public.stations
  where id = p_station
  for update;

  if v_status is null then
    raise exception 'station_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'station_not_draft' using errcode = 'P0003';
  end if;

  select max(version) into v_latest
  from public.station_versions
  where station_id = p_station;

  if v_latest is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0004';
  end if;

  update public.stations
  set code = p_code,
      title = p_title,
      specialty_id = p_specialty,
      training_levels = p_levels
  where id = p_station;

  update public.station_versions
  set content = p_content
  where station_id = p_station and version = v_latest;
end;
$$;

revoke execute on function public.update_station_draft(uuid, text, text, uuid, public.training_level[], jsonb, int)
  from public, anon, authenticated;
grant execute on function public.update_station_draft(uuid, text, text, uuid, public.training_level[], jsonb, int)
  to service_role;
