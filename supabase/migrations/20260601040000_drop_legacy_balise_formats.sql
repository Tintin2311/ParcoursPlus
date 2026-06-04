-- Phase 4: drop legacy balise format storage.
--
-- This migration removes the old duplicated storage:
-- - public.balises.formats
-- - public.balise_formats
--
-- The app now reads and writes the compact columns on public.balises:
-- - format_types
-- - poincon_rows / poincon_cols / poincon_cells
-- - tableau_rows / tableau_cols / tableau_cells
-- - qrcode_value

begin;

do $$
declare
  old_poincons integer := 0;
  compact_poincons integer := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'balises'
      and column_name = 'formats'
  ) then
    select count(*)
    into old_poincons
    from public.balises
    where formats ? 'poincon';
  end if;

  select count(*)
  into compact_poincons
  from public.balises
  where 'poincon' = any(format_types)
    and poincon_cells is not null;

  if old_poincons > 0 and old_poincons <> compact_poincons then
    raise exception
      'Refusing to drop legacy balise formats: old poincons %, compact poincons %',
      old_poincons,
      compact_poincons;
  end if;
end;
$$;

create or replace function public.get_poincon_formats_by_balise_ids(p_balise_ids uuid[])
returns table(id uuid, balise_id uuid, user_id uuid, format_type text, payload jsonb)
language sql
security definer
set search_path to 'public'
as $$
  select
    null::uuid as id,
    b.id as balise_id,
    b.user_id,
    'poincon'::text as format_type,
    jsonb_build_object(
      'rows', coalesce(b.poincon_rows, 4),
      'cols', coalesce(b.poincon_cols, 4),
      'cells', coalesce(b.poincon_cells, '[]'::jsonb)
    ) as payload
  from public.balises b
  where b.id = any(p_balise_ids)
    and 'poincon' = any(b.format_types)
    and b.poincon_cells is not null;
$$;

drop index if exists public.balises_formats_gin_idx;

alter table public.balises
  drop column if exists formats;

drop table if exists public.balise_formats;

commit;

-- Verification queries to run manually after the migration:
--
-- 1. Confirm old storage is gone:
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name = 'balise_formats';
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'balises'
--   and column_name = 'formats';
--
-- Expected result for both queries: 0 rows.
--
-- 2. Confirm compact poincons remain:
-- select count(*) as compact_poincons
-- from public.balises
-- where 'poincon' = any(format_types)
--   and poincon_cells is not null;
--
-- Expected result: 14.
