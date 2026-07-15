create table if not exists public.tableau_student_assignments (
  id uuid primary key default gen_random_uuid(),
  professeur_id uuid not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assigned_index integer not null default 0,
  assigned_cell_key text not null default 'A1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tableau_student_assignments_index_check check (assigned_index >= 0),
  constraint tableau_student_assignments_unique unique (professeur_id, group_id, student_id)
);

create index if not exists tableau_student_assignments_group_idx
  on public.tableau_student_assignments(group_id);

create index if not exists tableau_student_assignments_student_idx
  on public.tableau_student_assignments(student_id);

create table if not exists public.professeur_tableau_preferences (
  professeur_id uuid primary key,
  rows integer not null default 4,
  cols integer not null default 4,
  char_count integer not null default 3,
  use_uppercase boolean not null default true,
  use_lowercase boolean not null default false,
  use_numbers boolean not null default true,
  use_symbols boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professeur_tableau_preferences_rows_check check (rows between 1 and 9),
  constraint professeur_tableau_preferences_cols_check check (cols between 1 and 9),
  constraint professeur_tableau_preferences_char_count_check check (char_count between 1 and 9)
);

alter table public.tableau_student_assignments enable row level security;
alter table public.professeur_tableau_preferences enable row level security;

drop policy if exists "tableau_student_assignments_select" on public.tableau_student_assignments;
create policy "tableau_student_assignments_select"
  on public.tableau_student_assignments
  for select
  using (true);

drop policy if exists "tableau_student_assignments_insert_own" on public.tableau_student_assignments;
create policy "tableau_student_assignments_insert_own"
  on public.tableau_student_assignments
  for insert
  with check (true);

drop policy if exists "tableau_student_assignments_update_own" on public.tableau_student_assignments;
create policy "tableau_student_assignments_update_own"
  on public.tableau_student_assignments
  for update
  using (true)
  with check (true);

drop policy if exists "tableau_student_assignments_delete_own" on public.tableau_student_assignments;
create policy "tableau_student_assignments_delete_own"
  on public.tableau_student_assignments
  for delete
  using (auth.uid() = professeur_id);

drop policy if exists "professeur_tableau_preferences_select" on public.professeur_tableau_preferences;
create policy "professeur_tableau_preferences_select"
  on public.professeur_tableau_preferences
  for select
  using (true);

drop policy if exists "professeur_tableau_preferences_insert_own" on public.professeur_tableau_preferences;
create policy "professeur_tableau_preferences_insert_own"
  on public.professeur_tableau_preferences
  for insert
  with check (auth.uid() = professeur_id);

drop policy if exists "professeur_tableau_preferences_update_own" on public.professeur_tableau_preferences;
create policy "professeur_tableau_preferences_update_own"
  on public.professeur_tableau_preferences
  for update
  using (auth.uid() = professeur_id)
  with check (auth.uid() = professeur_id);

create or replace function public.set_updated_at_tableau_student_assignments()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_tableau_student_assignments
  on public.tableau_student_assignments;

create trigger set_updated_at_tableau_student_assignments
before update on public.tableau_student_assignments
for each row
execute function public.set_updated_at_tableau_student_assignments();

create or replace function public.set_updated_at_professeur_tableau_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_professeur_tableau_preferences
  on public.professeur_tableau_preferences;

create trigger set_updated_at_professeur_tableau_preferences
before update on public.professeur_tableau_preferences
for each row
execute function public.set_updated_at_professeur_tableau_preferences();
