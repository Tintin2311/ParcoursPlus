alter table public.parcours
  add column if not exists format_types text[] not null default array[]::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parcours_format_types_allowed_check'
  ) then
    alter table public.parcours
      add constraint parcours_format_types_allowed_check
        check (
          format_types <@ array['code'::text, 'tableau'::text, 'poincon'::text, 'qrcode'::text]
        );
  end if;
end $$;

alter table public.parcours
  add column if not exists balises_formats_ordre jsonb not null default '[]'::jsonb;

update public.parcours
set format_types = array[format_type]
where format_type is not null
  and coalesce(array_length(format_types, 1), 0) = 0;

comment on column public.parcours.format_types is
  'Selected formats allowed in this parcours. Keeps format_type as legacy/default format.';

comment on column public.parcours.balises_formats_ordre is
  'Ordered list of parcours balises with the format selected for each occurrence.';
