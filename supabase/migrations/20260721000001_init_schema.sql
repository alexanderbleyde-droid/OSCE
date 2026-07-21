-- ============================================================
-- Plexus OSCE — initial schema
-- Implements docs/spec/station-schema.md
-- Tables: specialties, profiles, stations, station_versions, attempts
-- RLS: candidates read enabled stations' current version only,
--      read/write own attempts, read own profile.
--      Admins: full CRUD on stations/versions/specialties, read all attempts.
--      Anonymous: no access to anything.
-- ============================================================

-- ---------- enums ----------
create type public.user_role as enum ('admin', 'candidate');
create type public.training_level as enum ('student', 'resident', 'physician');
create type public.station_status as enum ('draft', 'enabled', 'disabled', 'archived');
create type public.attempt_mode as enum ('exam', 'tutor');

-- ---------- tables ----------
create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'candidate',
  training_level public.training_level,
  specialty_id uuid references public.specialties (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  training_levels public.training_level[] not null default '{}',
  status public.station_status not null default 'draft',
  current_version int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Immutable once any attempt references them (enforced by trigger below).
create table public.station_versions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade,
  version int not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (station_id, version)
);

-- current_version must always point at a real version row (or be null).
-- MATCH SIMPLE: rows with current_version null pass; a version row that is
-- the current_version of any station cannot be deleted (FK NO ACTION).
alter table public.stations
  add constraint stations_current_version_fkey
  foreign key (id, current_version)
  references public.station_versions (station_id, version);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  station_version_id uuid not null references public.station_versions (id) on delete restrict,
  mode public.attempt_mode not null,
  transcript jsonb not null default '[]'::jsonb,
  domain_scores jsonb,
  aggregate int check (aggregate between 0 and 100),
  critical_failed boolean not null default false,
  bridge_triggered boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index attempts_user_id_idx on public.attempts (user_id);
create index attempts_station_version_id_idx on public.attempts (station_version_id);
create index stations_specialty_id_idx on public.stations (specialty_id);
create index station_versions_station_id_idx on public.station_versions (station_id);

-- ---------- helper functions ----------

-- True when the calling user has an admin profile. SECURITY DEFINER so RLS
-- policies can consult profiles without recursing into profiles' own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- True when the calling user has an attempt against any version of the given
-- station. SECURITY DEFINER so the stations policy can consult attempts /
-- station_versions without recursing into their RLS.
create or replace function public.has_attempted_station(station uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts a
    join public.station_versions sv on sv.id = a.station_version_id
    where sv.station_id = station
      and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.has_attempted_station(uuid) from public, anon;
grant execute on function public.has_attempted_station(uuid) to authenticated, service_role;

-- True when the given version is the current version of an enabled station.
-- SECURITY DEFINER: station_versions SELECT is admin-only, so the attempts
-- insert policy must do this existence check with definer rights.
create or replace function public.is_current_enabled_version(version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.station_versions sv
    join public.stations s on s.id = sv.station_id
    where sv.id = version_id
      and s.status = 'enabled'
      and s.current_version = sv.version
  );
$$;

revoke execute on function public.is_current_enabled_version(uuid) from public, anon;
grant execute on function public.is_current_enabled_version(uuid) to authenticated, service_role;

-- Admin promotion is service-side only: callable by service_role/postgres,
-- never by anon or authenticated. This is the "admin profile hook" — run
-- `select public.promote_to_admin('<auth-user-uuid>');` with the UUID of the
-- manually created auth user.
create or replace function public.promote_to_admin(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (target_user, 'admin')
  on conflict (id) do update set role = 'admin';
end;
$$;

revoke execute on function public.promote_to_admin(uuid) from public, anon, authenticated;
grant execute on function public.promote_to_admin(uuid) to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_stations_updated_at
  before update on public.stations
  for each row execute function public.set_updated_at();

-- station_versions are immutable once any attempt references them.
-- New edits => new version row. (attempts.station_version_id is also
-- ON DELETE RESTRICT, so this trigger is the update guard + a clearer error.)
create or replace function public.station_versions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.attempts a where a.station_version_id = old.id
  ) then
    raise exception 'station_versions row % is referenced by attempts and is immutable', old.id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_station_versions_guard
  before update or delete on public.station_versions
  for each row execute function public.station_versions_guard();

-- draft -> enabled requires a publishable current_version at the DB level.
-- (Content-level gates — pool constraint, weights sum 100, mustCover non-empty,
-- >=1 critical flag — are enforced by the Zod enable gate in lib/contracts.)
create or replace function public.stations_enable_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'enabled' then
    if new.current_version is null then
      raise exception 'station % cannot be enabled without a current_version', new.id;
    end if;
    if not exists (
      select 1 from public.station_versions sv
      where sv.station_id = new.id and sv.version = new.current_version
    ) then
      raise exception 'station % current_version % has no station_versions row', new.id, new.current_version;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_stations_enable_guard
  before insert or update on public.stations
  for each row execute function public.stations_enable_guard();

-- ---------- row level security ----------
alter table public.specialties enable row level security;
alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.station_versions enable row level security;
alter table public.attempts enable row level security;

-- profiles: candidates read their own profile; admins read all.
-- No INSERT policy: profiles are bootstrapped server-side (service role).
-- UPDATE is limited to own row AND (via column grants below) to
-- training_level/specialty_id only — role can never be self-escalated.
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- specialties: readable by any signed-in user; admin CRUD.
create policy "specialties_select_authenticated"
  on public.specialties for select to authenticated
  using (true);

create policy "specialties_admin_insert"
  on public.specialties for insert to authenticated
  with check (public.is_admin());

create policy "specialties_admin_update"
  on public.specialties for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "specialties_admin_delete"
  on public.specialties for delete to authenticated
  using (public.is_admin());

-- stations: candidates see enabled stations, plus the METADATA of stations
-- they have attempted (titles for attempt history/reports stay renderable
-- after a station is disabled — spec: past attempts remain reportable);
-- admins full CRUD.
create policy "stations_select_enabled_attempted_or_admin"
  on public.stations for select to authenticated
  using (
    status = 'enabled'
    or public.is_admin()
    or public.has_attempted_station(id)
  );

create policy "stations_admin_insert"
  on public.stations for insert to authenticated
  with check (public.is_admin());

create policy "stations_admin_update"
  on public.stations for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "stations_admin_delete"
  on public.stations for delete to authenticated
  using (public.is_admin());

-- station_versions: ADMIN-ONLY, even for enabled stations. The content jsonb
-- is the examiner pack — withheldFacts, expectedElements, mustCover, scoring
-- weights, criticalFlags, MCQ answers. RLS cannot mask jsonb sub-fields, so
-- any candidate SELECT here would hand out the answer key. Candidates receive
-- only candidate-safe fields (patient, openingStatement, sampled questions)
-- through server routes using the service role.
create policy "station_versions_select_admin"
  on public.station_versions for select to authenticated
  using (public.is_admin());

create policy "station_versions_admin_insert"
  on public.station_versions for insert to authenticated
  with check (public.is_admin());

create policy "station_versions_admin_update"
  on public.station_versions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "station_versions_admin_delete"
  on public.station_versions for delete to authenticated
  using (public.is_admin());

-- attempts: candidates read/write their OWN attempts only; inserts must
-- target the current version of an enabled station; admins read all.
create policy "attempts_select_own_or_admin"
  on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "attempts_insert_own"
  on public.attempts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_current_enabled_version(station_version_id)
  );

create policy "attempts_update_own"
  on public.attempts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- privileges ----------
-- No anonymous access to anything: strip every grant from anon.
revoke all on all tables in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Authenticated: RLS is the row filter; column grants are the column filter.
-- profiles: role is never client-updatable (no self-promotion).
revoke insert, update, delete on public.profiles from authenticated;
grant update (training_level, specialty_id) on public.profiles to authenticated;

-- attempts: scoring fields (domain_scores, aggregate, critical_failed,
-- bridge_triggered) are SERVER-AUTHORED — a candidate must not be able to
-- self-certify a pass or suppress the Knowledge Bridge. Clients may start an
-- attempt and append to their transcript; everything else via service role.
revoke insert, update, delete on public.attempts from authenticated;
grant insert (user_id, station_version_id, mode, transcript) on public.attempts to authenticated;
grant update (transcript, completed_at) on public.attempts to authenticated;

-- Non-DML privileges are unreachable through PostgREST but cost nothing to
-- strip (TRUNCATE is not subject to RLS).
revoke truncate, references, trigger on all tables in schema public from authenticated;
