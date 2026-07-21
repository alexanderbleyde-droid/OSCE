-- ============================================================
-- Seed: specialties (names taken from the V3 design screens;
-- PM&R is the specialty of both reference stations).
-- ============================================================

insert into public.specialties (name) values
  ('Physical Medicine & Rehabilitation'),
  ('Internal Medicine'),
  ('Family Medicine'),
  ('Emergency Medicine'),
  ('General Surgery'),
  ('Paediatrics'),
  ('Obstetrics & Gynaecology'),
  ('Psychiatry')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- Admin profile hook
-- The first admin is created manually in Supabase Auth; promote it by
-- running (as service_role / postgres — the function is not callable by
-- clients):
--
--   select public.promote_to_admin('<auth-user-uuid>');
--
-- A follow-up migration will call this once the real UUID is provided.
-- ------------------------------------------------------------
