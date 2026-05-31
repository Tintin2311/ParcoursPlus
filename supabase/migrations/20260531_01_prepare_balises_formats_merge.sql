-- Phase 1: prepare a safe merge of public.balise_formats into public.balises.
--
-- This migration is intentionally non-destructive:
-- - it keeps public.balise_formats intact
-- - it adds public.balises.formats as a jsonb cache/canonical target
-- - it copies existing formats into that new column
-- - it keeps the existing poincon RPC compatible
--
-- Do not drop public.balise_formats in this phase.

begin;

alter table public.balises
  add column if not exists formats jsonb not null default '{}'::jsonb;

comment on column public.balises.formats is
  'Formats attached to this balise, keyed by format type: code, poincon, tableau, qrcode. Prepared from balise_formats before full merge.';

with aggregated_formats as (
  select
    bf.balise_id,
    jsonb_object_agg(
      bf.format_type,
      jsonb_build_object(
        'id', bf.id,
        'label', bf.label,
        'is_default', bf.is_default,
        'payload', coalesce(bf.payload, '{}'::jsonb),
        'created_at', bf.created_at
      )
      order by bf.created_at
    ) as formats
  from public.balise_formats bf
  where bf.format_type in ('code', 'poincon', 'tableau', 'qrcode')
  group by bf.balise_id
)
update public.balises b
set formats = coalesce(af.formats, '{}'::jsonb)
from aggregated_formats af
where af.balise_id = b.id;

create index if not exists balises_formats_gin_idx
  on public.balises using gin (formats);

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

-- Verification queries to run manually after the migration:
--
-- 1. Count balises with migrated formats:
-- select count(*) as balises_with_formats
-- from public.balises
-- where formats <> '{}'::jsonb;
--
-- 2. Compare old format rows with new JSON keys:
-- select
--   (select count(*) from public.balise_formats) as old_format_rows,
--   (
--     select coalesce(sum(jsonb_object_length(formats)), 0)
--     from public.balises
--   ) as new_format_keys;
--
-- 3. Check poincon formats specifically:
-- select
--   (select count(*) from public.balise_formats where format_type = 'poincon') as old_poincon_rows,
--   (select count(*) from public.balises where formats ? 'poincon') as new_poincon_keys;

commit;
