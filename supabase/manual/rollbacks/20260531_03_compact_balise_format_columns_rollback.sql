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
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'balises'
      and column_name = 'formats'
  ) then
    return query execute $sql$
      select
        nullif(b.formats #>> '{poincon,id}', '')::uuid as id,
        b.id as balise_id,
        b.user_id,
        'poincon'::text as format_type,
        coalesce(b.formats #> '{poincon,payload}', '{}'::jsonb) as payload
      from public.balises b
      where b.id = any($1)
        and b.formats ? 'poincon'
    $sql$ using p_balise_ids;
  end if;

  if to_regclass('public.balise_formats') is not null then
    return query execute $sql$
      select
        bf.id,
        bf.balise_id,
        bf.user_id,
        bf.format_type,
        bf.payload
      from public.balise_formats bf
      where bf.format_type = 'poincon'
        and bf.balise_id = any($1)
    $sql$ using p_balise_ids;
  end if;
end;
$$;

commit;
