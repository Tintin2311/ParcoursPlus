-- Rollback for phase 4.
--
-- Recreates public.balises.formats and public.balise_formats from the
-- compact columns that remain on public.balises.

begin;

alter table public.balises
  add column if not exists formats jsonb not null default '{}'::jsonb;

create table if not exists public.balise_formats (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  user_id uuid default auth.uid() not null,
  balise_id uuid not null,
  format_type text default 'code'::text not null,
  label text,
  is_default boolean default false not null,
  payload jsonb default '{}'::jsonb not null,
  constraint balise_formats_format_type_check
    check (format_type = any (array['code'::text, 'tableau'::text, 'qrcode'::text, 'poincon'::text])),
  constraint balise_formats_pkey primary key (id),
  constraint balise_formats_balise_id_fkey
    foreign key (balise_id) references public.balises(id) on delete cascade
);

truncate table public.balise_formats;

insert into public.balise_formats (user_id, balise_id, format_type, label, is_default, payload)
select
  b.user_id,
  b.id,
  f.format_type,
  f.label,
  false,
  f.payload
from public.balises b
cross join lateral (
  values
    (
      'code'::text,
      'Code simple'::text,
      '{}'::jsonb
    ),
    (
      'poincon'::text,
      'Poinçon'::text,
      jsonb_build_object(
        'rows', coalesce(b.poincon_rows, 4),
        'cols', coalesce(b.poincon_cols, 4),
        'cells', coalesce(b.poincon_cells, '[]'::jsonb)
      )
    ),
    (
      'tableau'::text,
      'Tableau'::text,
      jsonb_build_object(
        'rows', coalesce(b.tableau_rows, 4),
        'cols', coalesce(b.tableau_cols, 4),
        'cells', coalesce(b.tableau_cells, '{}'::jsonb)
      )
    ),
    (
      'qrcode'::text,
      'QR code'::text,
      jsonb_build_object('value', coalesce(b.qrcode_value, ''))
    )
) as f(format_type, label, payload)
where b.user_id is not null
  and f.format_type = any(b.format_types);

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
  group by bf.balise_id
)
update public.balises b
set formats = coalesce(af.formats, '{}'::jsonb)
from aggregated_formats af
where af.balise_id = b.id;

create index if not exists balises_formats_gin_idx
  on public.balises using gin (formats);

create index if not exists balise_formats_balise_id_idx
  on public.balise_formats using btree (balise_id);

create index if not exists balise_formats_format_type_idx
  on public.balise_formats using btree (format_type);

create index if not exists balise_formats_user_id_idx
  on public.balise_formats using btree (user_id);

alter table public.balise_formats enable row level security;

create policy balise_formats_delete_owner
  on public.balise_formats
  for delete
  using (auth.uid() = user_id);

create policy balise_formats_insert_owner
  on public.balise_formats
  for insert
  with check (auth.uid() = user_id);

create policy balise_formats_select_owner
  on public.balise_formats
  for select
  using (auth.uid() = user_id);

create policy balise_formats_update_owner
  on public.balise_formats
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

commit;
