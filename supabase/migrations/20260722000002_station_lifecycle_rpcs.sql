-- ============================================================
-- Versioned saves + lifecycle transitions (atomic, service-role only).
--
-- Versioning model (docs/spec/station-schema.md):
--   - draft station: its single line of versions is mutable in place;
--   - enabled/disabled station: editing creates a NEW version row when the
--     latest version is the published one; if an unpublished (draft)
--     version already exists (latest > current_version), that draft
--     version is updated in place — it can never be referenced by attempts;
--   - enabling always publishes the LATEST version (bumps current_version);
--     prior versions are never touched;
--   - archived stations are read-only.
-- ============================================================

drop function if exists public.update_station_draft(uuid, text, text, uuid, public.training_level[], jsonb, int);

create or replace function public.save_station_version(
  p_station uuid,
  p_code text,
  p_title text,
  p_specialty uuid,
  p_levels public.training_level[],
  p_content jsonb,
  p_expected_version int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.station_status;
  v_current int;
  v_latest int;
begin
  select status, current_version into v_status, v_current
  from public.stations
  where id = p_station
  for update;

  if v_status is null then
    raise exception 'station_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'station_archived' using errcode = 'P0003';
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

  if v_status = 'draft' or (v_current is not null and v_latest > v_current) then
    -- Mutable line: a draft station's latest, or an existing unpublished
    -- draft version of a published station. Never attempt-referenced
    -- (and the immutability trigger guards regardless).
    update public.station_versions
    set content = p_content
    where station_id = p_station and version = v_latest;
    return v_latest;
  else
    insert into public.station_versions (station_id, version, content)
    values (p_station, v_latest + 1, p_content);
    return v_latest + 1;
  end if;
end;
$$;

revoke execute on function public.save_station_version(uuid, text, text, uuid, public.training_level[], jsonb, int)
  from public, anon, authenticated;
grant execute on function public.save_station_version(uuid, text, text, uuid, public.training_level[], jsonb, int)
  to service_role;

-- Lifecycle transitions. Content-level enable gates (Zod) run in the app
-- BEFORE calling this; the DB enable-guard trigger still enforces pointer
-- integrity as the last line of defense.
create or replace function public.set_station_status(
  p_station uuid,
  p_next public.station_status
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.station_status;
  v_latest int;
  v_current int;
begin
  select status, current_version into v_status, v_current
  from public.stations
  where id = p_station
  for update;

  if v_status is null then
    raise exception 'station_not_found' using errcode = 'P0002';
  end if;

  if p_next = 'enabled' then
    -- draft/disabled -> enable; enabled -> publish the latest draft version.
    if v_status = 'archived' then
      raise exception 'invalid_transition' using errcode = 'P0005';
    end if;
    select max(version) into v_latest
    from public.station_versions
    where station_id = p_station;
    if v_latest is null then
      raise exception 'no_version_to_publish' using errcode = 'P0006';
    end if;
    update public.stations
    set status = 'enabled', current_version = v_latest
    where id = p_station;
    return v_latest;

  elsif p_next = 'disabled' then
    if v_status <> 'enabled' then
      raise exception 'invalid_transition' using errcode = 'P0005';
    end if;
    update public.stations set status = 'disabled' where id = p_station;
    return v_current;

  elsif p_next = 'archived' then
    if v_status = 'archived' then
      raise exception 'invalid_transition' using errcode = 'P0005';
    end if;
    update public.stations set status = 'archived' where id = p_station;
    return v_current;

  else
    -- returning to 'draft' is not a lifecycle transition
    raise exception 'invalid_transition' using errcode = 'P0005';
  end if;
end;
$$;

revoke execute on function public.set_station_status(uuid, public.station_status)
  from public, anon, authenticated;
grant execute on function public.set_station_status(uuid, public.station_status)
  to service_role;
