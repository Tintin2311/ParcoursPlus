create extension if not exists pgcrypto;

create table if not exists public.group_evaluation_bareme_pages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  page_number integer not null,
  page_name text not null,
  table_type text not null default 'simple',
  row_metric text,
  column_metric text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_evaluation_bareme_pages_table_type_check
    check (table_type in ('simple', 'double')),
  constraint group_evaluation_bareme_pages_row_metric_check
    check (row_metric is null or row_metric in ('time', 'beacons', 'score')),
  constraint group_evaluation_bareme_pages_column_metric_check
    check (column_metric is null or column_metric in ('time', 'beacons', 'score')),
  constraint group_evaluation_bareme_pages_double_column_required_check
    check (
      (table_type = 'simple' and column_metric is null)
      or
      (table_type = 'double' and column_metric is not null)
    ),
  constraint group_evaluation_bareme_pages_distinct_axes_check
    check (row_metric is null or column_metric is null or row_metric <> column_metric),
  constraint group_evaluation_bareme_pages_teacher_page_unique
    unique (teacher_id, page_number)
);

create table if not exists public.group_evaluation_bareme_axes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  bareme_page_id uuid not null references public.group_evaluation_bareme_pages(id) on delete cascade,
  axis text not null,
  metric text not null,
  order_index integer not null,

  beacon_count integer,
  time_min_seconds integer,
  time_max_seconds integer,
  score_min numeric,
  score_max numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_evaluation_bareme_axes_axis_check
    check (axis in ('row', 'column')),
  constraint group_evaluation_bareme_axes_metric_check
    check (metric in ('time', 'beacons', 'score', 'points')),
  constraint group_evaluation_bareme_axes_beacon_count_check
    check (beacon_count is null or beacon_count >= 0),
  constraint group_evaluation_bareme_axes_time_check
    check (
      (time_min_seconds is null and time_max_seconds is null)
      or
      (
        time_min_seconds is not null
        and time_max_seconds is not null
        and time_min_seconds >= 0
        and time_max_seconds >= time_min_seconds
      )
    ),
  constraint group_evaluation_bareme_axes_score_check
    check (
      (score_min is null and score_max is null)
      or
      (
        score_min is not null
        and score_max is not null
        and score_max >= score_min
      )
    ),
  constraint group_evaluation_bareme_axes_metric_payload_check
    check (
      (
        metric = 'time'
        and time_min_seconds is not null
        and time_max_seconds is not null
        and beacon_count is null
        and score_min is null
        and score_max is null
      )
      or
      (
        metric = 'beacons'
        and beacon_count is not null
        and time_min_seconds is null
        and time_max_seconds is null
        and score_min is null
        and score_max is null
      )
      or
      (
        metric = 'score'
        and score_min is not null
        and score_max is not null
        and beacon_count is null
        and time_min_seconds is null
        and time_max_seconds is null
      )
      or
      (
        metric = 'points'
        and beacon_count is null
        and time_min_seconds is null
        and time_max_seconds is null
        and score_min is null
        and score_max is null
      )
    ),
  constraint group_evaluation_bareme_axes_teacher_page_axis_order_unique
    unique (teacher_id, bareme_page_id, axis, order_index)
);

create table if not exists public.group_evaluation_bareme_cells (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  bareme_page_id uuid not null references public.group_evaluation_bareme_pages(id) on delete cascade,
  row_axis_id uuid not null references public.group_evaluation_bareme_axes(id) on delete cascade,
  column_axis_id uuid not null references public.group_evaluation_bareme_axes(id) on delete cascade,
  points numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_evaluation_bareme_cells_page_row_column_unique
    unique (bareme_page_id, row_axis_id, column_axis_id)
);

create index if not exists group_evaluation_bareme_pages_teacher_idx
  on public.group_evaluation_bareme_pages (teacher_id, page_number);

create index if not exists group_evaluation_bareme_axes_page_idx
  on public.group_evaluation_bareme_axes (bareme_page_id, axis, order_index);

create index if not exists group_evaluation_bareme_cells_page_idx
  on public.group_evaluation_bareme_cells (bareme_page_id);

alter table public.group_evaluation_bareme_pages enable row level security;
alter table public.group_evaluation_bareme_axes enable row level security;
alter table public.group_evaluation_bareme_cells enable row level security;

drop policy if exists "group_evaluation_bareme_pages_select_own" on public.group_evaluation_bareme_pages;
create policy "group_evaluation_bareme_pages_select_own"
  on public.group_evaluation_bareme_pages
  for select
  using (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_pages_insert_own" on public.group_evaluation_bareme_pages;
create policy "group_evaluation_bareme_pages_insert_own"
  on public.group_evaluation_bareme_pages
  for insert
  with check (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_pages_update_own" on public.group_evaluation_bareme_pages;
create policy "group_evaluation_bareme_pages_update_own"
  on public.group_evaluation_bareme_pages
  for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_pages_delete_own" on public.group_evaluation_bareme_pages;
create policy "group_evaluation_bareme_pages_delete_own"
  on public.group_evaluation_bareme_pages
  for delete
  using (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_axes_select_own" on public.group_evaluation_bareme_axes;
create policy "group_evaluation_bareme_axes_select_own"
  on public.group_evaluation_bareme_axes
  for select
  using (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_axes_insert_own" on public.group_evaluation_bareme_axes;
create policy "group_evaluation_bareme_axes_insert_own"
  on public.group_evaluation_bareme_axes
  for insert
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.group_evaluation_bareme_pages p
      where p.id = bareme_page_id
        and p.teacher_id = auth.uid()
    )
  );

drop policy if exists "group_evaluation_bareme_axes_update_own" on public.group_evaluation_bareme_axes;
create policy "group_evaluation_bareme_axes_update_own"
  on public.group_evaluation_bareme_axes
  for update
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.group_evaluation_bareme_pages p
      where p.id = bareme_page_id
        and p.teacher_id = auth.uid()
    )
  );

drop policy if exists "group_evaluation_bareme_axes_delete_own" on public.group_evaluation_bareme_axes;
create policy "group_evaluation_bareme_axes_delete_own"
  on public.group_evaluation_bareme_axes
  for delete
  using (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_cells_select_own" on public.group_evaluation_bareme_cells;
create policy "group_evaluation_bareme_cells_select_own"
  on public.group_evaluation_bareme_cells
  for select
  using (teacher_id = auth.uid());

drop policy if exists "group_evaluation_bareme_cells_insert_own" on public.group_evaluation_bareme_cells;
create policy "group_evaluation_bareme_cells_insert_own"
  on public.group_evaluation_bareme_cells
  for insert
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.group_evaluation_bareme_pages p
      where p.id = bareme_page_id
        and p.teacher_id = auth.uid()
    )
    and exists (
      select 1
      from public.group_evaluation_bareme_axes r
      where r.id = row_axis_id
        and r.bareme_page_id = bareme_page_id
        and r.teacher_id = auth.uid()
        and r.axis = 'row'
    )
    and exists (
      select 1
      from public.group_evaluation_bareme_axes c
      where c.id = column_axis_id
        and c.bareme_page_id = bareme_page_id
        and c.teacher_id = auth.uid()
        and c.axis = 'column'
    )
  );

drop policy if exists "group_evaluation_bareme_cells_update_own" on public.group_evaluation_bareme_cells;
create policy "group_evaluation_bareme_cells_update_own"
  on public.group_evaluation_bareme_cells
  for update
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1
      from public.group_evaluation_bareme_pages p
      where p.id = bareme_page_id
        and p.teacher_id = auth.uid()
    )
  );

drop policy if exists "group_evaluation_bareme_cells_delete_own" on public.group_evaluation_bareme_cells;
create policy "group_evaluation_bareme_cells_delete_own"
  on public.group_evaluation_bareme_cells
  for delete
  using (teacher_id = auth.uid());

comment on table public.group_evaluation_bareme_pages
  is 'Pages de baremes d evaluation creees par professeur.';

comment on table public.group_evaluation_bareme_axes
  is 'Lignes et colonnes des baremes d evaluation, avec precision selon la variable: temps, balises ou score.';

comment on table public.group_evaluation_bareme_cells
  is 'Points attribues aux intersections ligne/colonne des baremes d evaluation.';
