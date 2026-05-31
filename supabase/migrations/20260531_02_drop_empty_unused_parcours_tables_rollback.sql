-- Rollback for phase 2.
--
-- Recreates the four empty tables dropped by
-- 20260531_02_drop_empty_unused_parcours_tables.sql.
--
-- This restores structure only. There was no data to restore.

begin;

create table if not exists public.parcours_bareme_tentatives (
  id uuid default gen_random_uuid() not null,
  parcours_id uuid not null,
  order_index integer default 0 not null,
  condition_type text not null,
  attempts_value integer,
  attempts_min integer,
  attempts_max integer,
  points numeric default 0 not null,
  color_hex text default '#3B82F6'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  attempt_page integer default 1 not null,
  teacher_id uuid,
  constraint parcours_bareme_tentatives_condition_type_check
    check (condition_type = any (array['='::text, '≥'::text, '≤'::text, 'entre'::text])),
  constraint parcours_bareme_tentatives_pkey primary key (id),
  constraint parcours_bareme_tentatives_page_order_unique unique (parcours_id, attempt_page, order_index),
  constraint parcours_bareme_tentatives_parcours_id_fkey
    foreign key (parcours_id) references public.parcours(id) on delete cascade
);

create table if not exists public.parcours_bareme_tentatives_pages (
  id uuid default gen_random_uuid() not null,
  parcours_id uuid not null,
  page_number integer not null,
  page_name text default 'PAGE 1'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  teacher_id uuid,
  constraint parcours_bareme_tentatives_pages_pkey primary key (id),
  constraint parcours_bareme_tentatives_pages_parcours_id_page_number_key unique (parcours_id, page_number),
  constraint parcours_bareme_tentatives_pages_parcours_id_fkey
    foreign key (parcours_id) references public.parcours(id) on delete cascade
);

create table if not exists public.parcours_bonus_personnalises (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  parcours_id uuid,
  folder_id uuid,
  bonus_points integer default 0 not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint parcours_bonus_personnalises_pkey primary key (id),
  constraint parcours_bonus_personnalises_folder_id_fkey
    foreign key (folder_id) references public.parcours_folders(id) on delete cascade,
  constraint parcours_bonus_personnalises_parcours_id_fkey
    foreign key (parcours_id) references public.parcours(id) on delete cascade
);

create table if not exists public.partages_parcours (
  id uuid default extensions.uuid_generate_v4() not null,
  parcours_id uuid not null,
  expediteur_prof_id uuid not null,
  destinataire_prof_id uuid not null,
  date_partage timestamp with time zone default now(),
  accepte boolean default false,
  rejete boolean default false,
  nom_suggere_destinataire text,
  constraint partages_parcours_pkey primary key (id),
  constraint unique_partage_parcours_destinataire unique (parcours_id, destinataire_prof_id),
  constraint partages_parcours_destinataire_prof_id_fkey
    foreign key (destinataire_prof_id) references public.professeurs(id_uuid) on delete cascade,
  constraint partages_parcours_expediteur_prof_id_fkey
    foreign key (expediteur_prof_id) references public.professeurs(id_uuid) on delete cascade,
  constraint partages_parcours_parcours_id_fkey
    foreign key (parcours_id) references public.parcours(id) on delete cascade
);

create index if not exists idx_pages_teacher
  on public.parcours_bareme_tentatives_pages using btree (teacher_id);

create index if not exists idx_parcours_bareme_tentatives_parcours_page
  on public.parcours_bareme_tentatives using btree (parcours_id, attempt_page);

create index if not exists idx_pbt_parcours_page_order
  on public.parcours_bareme_tentatives using btree (parcours_id, attempt_page, order_index);

create index if not exists idx_tentatives_teacher
  on public.parcours_bareme_tentatives using btree (teacher_id);

create unique index if not exists parcours_bareme_tentatives_order_unique
  on public.parcours_bareme_tentatives using btree (parcours_id, attempt_page, order_index);

create trigger set_updated_at_parcours_bareme_tentatives_pages
  before update on public.parcours_bareme_tentatives_pages
  for each row execute function public.update_updated_at_column();

create trigger trg_set_updated_at_bareme_tentatives
  before update on public.parcours_bareme_tentatives
  for each row execute function public.set_updated_at();

alter table public.parcours_bareme_tentatives enable row level security;
alter table public.parcours_bareme_tentatives_pages enable row level security;
alter table public.parcours_bonus_personnalises enable row level security;
alter table public.partages_parcours enable row level security;

create policy bareme_tentatives_read
  on public.parcours_bareme_tentatives
  for select to authenticated
  using (true);

create policy bareme_tentatives_write
  on public.parcours_bareme_tentatives
  to authenticated
  using (true)
  with check (true);

create policy "insert own pages"
  on public.parcours_bareme_tentatives_pages
  for insert
  with check (auth.uid() = teacher_id);

create policy "insert own tentatives"
  on public.parcours_bareme_tentatives
  for insert
  with check (auth.uid() = teacher_id);

create policy "insert pages tentatives"
  on public.parcours_bareme_tentatives_pages
  for insert
  with check (true);

create policy "select own pages"
  on public.parcours_bareme_tentatives_pages
  for select
  using (auth.uid() = teacher_id);

create policy "select own tentatives"
  on public.parcours_bareme_tentatives
  for select
  using (auth.uid() = teacher_id);

create policy "select pages tentatives"
  on public.parcours_bareme_tentatives_pages
  for select
  using (true);

create policy "update pages tentatives"
  on public.parcours_bareme_tentatives_pages
  for update
  using (true)
  with check (true);

create policy "Allow destinataire to update share status"
  on public.partages_parcours
  for update
  using (((select auth.uid() as uid) = destinataire_prof_id))
  with check (((select auth.uid() as uid) = destinataire_prof_id));

create policy "Allow destinataire to view their shares"
  on public.partages_parcours
  for select
  using (((select auth.uid() as uid) = destinataire_prof_id));

create policy "Allow expediteur to create share"
  on public.partages_parcours
  for insert
  with check (((select auth.uid() as uid) = expediteur_prof_id));

create policy "Allow expediteur to delete their shares before acceptance"
  on public.partages_parcours
  for delete
  using ((((select auth.uid() as uid) = expediteur_prof_id) and (accepte = false) and (rejete = false)));

create or replace function public.delete_tentatives_page_and_shift(p_parcours_id uuid, p_page_number integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from parcours_bareme_tentatives
  where parcours_id = p_parcours_id
    and attempt_page = p_page_number;

  delete from parcours_bareme_tentatives_pages
  where parcours_id = p_parcours_id
    and page_number = p_page_number;

  update parcours_bareme_tentatives_pages
  set page_number = page_number - 1
  where parcours_id = p_parcours_id
    and page_number > p_page_number;

  update parcours_bareme_tentatives
  set attempt_page = attempt_page - 1
  where parcours_id = p_parcours_id
    and attempt_page > p_page_number;
end;
$$;

commit;
