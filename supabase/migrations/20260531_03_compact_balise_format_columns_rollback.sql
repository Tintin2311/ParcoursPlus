-- Rollback for phase 3.
--
-- Removes only the compact columns added by
-- 20260531_03_compact_balise_format_columns.sql.
--
-- This does not touch public.balise_formats or public.balises.formats.

begin;

drop index if exists public.balises_format_types_gin_idx;

alter table public.balises
  drop column if exists format_types,
  drop column if exists poincon_rows,
  drop column if exists poincon_cols,
  drop column if exists poincon_cells,
  drop column if exists tableau_rows,
  drop column if exists tableau_cols,
  drop column if exists tableau_cells,
  drop column if exists qrcode_value;

create or replace function public.get_poincon_formats_by_balise_ids(p_balise_ids uuid[])
returns table(id uuid, balise_id uuid, user_id uuid, format_type text, payload jsonb)
language sql
security definer
set search_path to 'public'
as $$
  select
    nullif(b.formats #>> '{poincon,id}', '')::uuid as id,
    b.id as balise_id,
    b.user_id,
    'poincon'::text as format_type,
    coalesce(b.formats #> '{poincon,payload}', '{}'::jsonb) as payload
  from public.balises b
  where b.id = any(p_balise_ids)
    and b.formats ? 'poincon'

  union all

  select
    bf.id,
    bf.balise_id,
    bf.user_id,
    bf.format_type,
    bf.payload
  from public.balise_formats bf
  where bf.format_type = 'poincon'
    and bf.balise_id = any(p_balise_ids)
    and not exists (
      select 1
      from public.balises b
      where b.id = bf.balise_id
        and b.formats ? 'poincon'
    );
$$;

commit;
