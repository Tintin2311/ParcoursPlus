-- Rollback for phase 1.
--
-- Use only if you want to undo 20260531_01_prepare_balises_formats_merge.sql.
-- This rollback does not touch public.balise_formats.

begin;

drop index if exists public.balises_formats_gin_idx;

alter table public.balises
  drop column if exists formats;

create or replace function public.get_poincon_formats_by_balise_ids(p_balise_ids uuid[])
returns table(id uuid, balise_id uuid, user_id uuid, format_type text, payload jsonb)
language sql
security definer
set search_path to 'public'
as $$
  select
    bf.id,
    bf.balise_id,
    bf.user_id,
    bf.format_type,
    bf.payload
  from public.balise_formats bf
  where bf.format_type = 'poincon'
    and bf.balise_id = any(p_balise_ids);
$$;

commit;
