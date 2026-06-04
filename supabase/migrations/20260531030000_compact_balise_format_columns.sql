-- Phase 3: add compact format columns to public.balises.
--
-- This migration is intentionally non-destructive:
-- - it keeps public.balise_formats intact
-- - it keeps public.balises.formats intact
-- - it adds compact columns for the information the app really needs
-- - it copies existing JSON/table data into those compact columns
--
-- Do not drop public.balise_formats or public.balises.formats in this phase.

begin;

alter table public.balises
  add column if not exists formats jsonb not null default '{}'::jsonb,
  add column if not exists format_types text[] not null default array['code']::text[],
  add column if not exists poincon_rows integer,
  add column if not exists poincon_cols integer,
  add column if not exists poincon_cells jsonb,
  add column if not exists tableau_rows integer,
  add column if not exists tableau_cols integer,
  add column if not exists tableau_cells jsonb,
  add column if not exists qrcode_value text;

comment on column public.balises.format_types is
  'Compact list of available formats for this balise: code, poincon, tableau, qrcode.';
comment on column public.balises.poincon_cells is
  'Compact poincon grid. true means a visible point, false means an empty cell.';
comment on column public.balises.tableau_cells is
  'Compact tableau cell values, keyed by row-col.';
comment on column public.balises.qrcode_value is
  'Compact QR code value.';

create temp table if not exists balise_compact_source_formats (
  balise_id uuid primary key,
  formats jsonb not null
) on commit drop;

truncate table pg_temp.balise_compact_source_formats;

insert into pg_temp.balise_compact_source_formats (balise_id, formats)
select b.id, coalesce(nullif(b.formats, '{}'::jsonb), '{}'::jsonb)
from public.balises b;

do $$
begin
  if to_regclass('public.balise_formats') is not null then
    execute $sql$
      with legacy_formats as (
        select
          bf.balise_id,
          jsonb_object_agg(
            bf.format_type,
            jsonb_build_object('payload', coalesce(bf.payload, '{}'::jsonb))
            order by bf.created_at
          ) as formats
        from public.balise_formats bf
        where bf.format_type in ('code', 'poincon', 'tableau', 'qrcode')
        group by bf.balise_id
      )
      update pg_temp.balise_compact_source_formats sf
      set formats = lf.formats
      from legacy_formats lf
      where lf.balise_id = sf.balise_id
        and sf.formats = '{}'::jsonb
    $sql$;
  end if;
end;
$$;

with source_formats as (
  select balise_id, formats
  from pg_temp.balise_compact_source_formats
),
normalized as (
  select
    balise_id,
    true as has_code,
    formats ? 'poincon' as has_poincon,
    formats ? 'tableau' as has_tableau,
    formats ? 'qrcode' as has_qrcode,
    greatest(2, least(6, coalesce(nullif(formats #>> '{poincon,payload,rows}', '')::integer, 4))) as poincon_rows,
    greatest(2, least(6, coalesce(nullif(formats #>> '{poincon,payload,cols}', '')::integer, 4))) as poincon_cols,
    case
      when jsonb_typeof(formats #> '{poincon,payload,cells}') = 'array'
        then formats #> '{poincon,payload,cells}'
      else null
    end as poincon_cells,
    greatest(2, least(6, coalesce(nullif(formats #>> '{tableau,payload,rows}', '')::integer, 4))) as tableau_rows,
    greatest(2, least(6, coalesce(nullif(formats #>> '{tableau,payload,cols}', '')::integer, 4))) as tableau_cols,
    case
      when jsonb_typeof(formats #> '{tableau,payload,cells}') = 'object'
        then formats #> '{tableau,payload,cells}'
      else '{}'::jsonb
    end as tableau_cells,
    nullif(formats #>> '{qrcode,payload,value}', '') as qrcode_value
  from source_formats
)
update public.balises b
set
  format_types = array_remove(array[
    case when n.has_code then 'code' end,
    case when n.has_poincon then 'poincon' end,
    case when n.has_tableau then 'tableau' end,
    case when n.has_qrcode then 'qrcode' end
  ]::text[], null::text),
  poincon_rows = case when n.has_poincon then n.poincon_rows else null end,
  poincon_cols = case when n.has_poincon then n.poincon_cols else null end,
  poincon_cells = case when n.has_poincon then coalesce(n.poincon_cells, '[]'::jsonb) else null end,
  tableau_rows = case when n.has_tableau then n.tableau_rows else null end,
  tableau_cols = case when n.has_tableau then n.tableau_cols else null end,
  tableau_cells = case when n.has_tableau then n.tableau_cells else null end,
  qrcode_value = case when n.has_qrcode then n.qrcode_value else null end
from normalized n
where n.balise_id = b.id;

create index if not exists balises_format_types_gin_idx
  on public.balises using gin (format_types);

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
    and b.poincon_cells is not null

  union all

  select
    nullif(b.formats #>> '{poincon,id}', '')::uuid as id,
    b.id as balise_id,
    b.user_id,
    'poincon'::text as format_type,
    coalesce(b.formats #> '{poincon,payload}', '{}'::jsonb) as payload
  from public.balises b
  where b.id = any(p_balise_ids)
    and b.formats ? 'poincon'
    and not (
      'poincon' = any(b.format_types)
      and b.poincon_cells is not null
    );

$$;

-- Verification queries to run manually after the migration:
--
-- 1. Compare poincon rows:
-- select
--   (select count(*) from public.balises where formats ? 'poincon') as json_poincons,
--   (select count(*) from public.balises where 'poincon' = any(format_types)) as compact_poincons;
--
-- 2. Check compact values:
-- select numero_balise, format_types, poincon_rows, poincon_cols, poincon_cells
-- from public.balises
-- where 'poincon' = any(format_types)
-- order by numero_balise
-- limit 5;

commit;
