-- Phase 2: drop empty unused parcours tables.
--
-- Tables targeted:
-- - public.parcours_bareme_tentatives
-- - public.parcours_bareme_tentatives_pages
-- - public.parcours_bonus_personnalises
-- - public.partages_parcours
--
-- Verified before creation of this migration:
-- all four tables had 0 rows.
--
-- This migration is guarded: it raises an exception if any table is no longer empty.

begin;

do $$
declare
  has_rows boolean;
begin
  if to_regclass('public.parcours_bareme_tentatives') is not null then
    execute 'select exists (select 1 from public.parcours_bareme_tentatives limit 1)' into has_rows;
    if has_rows then
      raise exception 'Refusing to drop public.parcours_bareme_tentatives because it is not empty';
    end if;
  end if;

  if to_regclass('public.parcours_bareme_tentatives_pages') is not null then
    execute 'select exists (select 1 from public.parcours_bareme_tentatives_pages limit 1)' into has_rows;
    if has_rows then
      raise exception 'Refusing to drop public.parcours_bareme_tentatives_pages because it is not empty';
    end if;
  end if;

  if to_regclass('public.parcours_bonus_personnalises') is not null then
    execute 'select exists (select 1 from public.parcours_bonus_personnalises limit 1)' into has_rows;
    if has_rows then
      raise exception 'Refusing to drop public.parcours_bonus_personnalises because it is not empty';
    end if;
  end if;

  if to_regclass('public.partages_parcours') is not null then
    execute 'select exists (select 1 from public.partages_parcours limit 1)' into has_rows;
    if has_rows then
      raise exception 'Refusing to drop public.partages_parcours because it is not empty';
    end if;
  end if;
end;
$$;

-- This function only manipulates parcours_bareme_tentatives and
-- parcours_bareme_tentatives_pages, so it must be removed before those tables.
drop function if exists public.delete_tentatives_page_and_shift(uuid, integer);

drop table if exists public.parcours_bareme_tentatives;
drop table if exists public.parcours_bareme_tentatives_pages;
drop table if exists public.parcours_bonus_personnalises;
drop table if exists public.partages_parcours;

commit;

-- Verification query after migration:
--
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'parcours_bareme_tentatives',
--     'parcours_bareme_tentatives_pages',
--     'parcours_bonus_personnalises',
--     'partages_parcours'
--   );
--
-- Expected result: 0 rows.
