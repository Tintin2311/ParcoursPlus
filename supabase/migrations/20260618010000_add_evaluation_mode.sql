alter table public.parcours
  add column if not exists mode_evaluation boolean not null default false,
  add column if not exists bareme_evaluation_id uuid references public.group_evaluation_bareme_pages(id) on delete set null;

alter table public.eleve_parcours_stats
  add column if not exists evaluation_note numeric,
  add column if not exists evaluation_max_points numeric,
  add column if not exists evaluation_bareme_id uuid references public.group_evaluation_bareme_pages(id) on delete set null,
  add column if not exists evaluation_updated_at timestamptz;

create index if not exists parcours_bareme_evaluation_idx
  on public.parcours (bareme_evaluation_id)
  where mode_evaluation = true;

create index if not exists eleve_parcours_stats_evaluation_idx
  on public.eleve_parcours_stats (evaluation_bareme_id);

create or replace function public.recalculer_evaluation_note(
  p_student_id uuid,
  p_parcours_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode_evaluation boolean := false;
  v_bareme_id uuid := null;
  v_stats record;
  v_row_axis record;
  v_col_axis record;
  v_note numeric := null;
  v_max_points numeric := null;
begin
  select coalesce(mode_evaluation, false), bareme_evaluation_id
  into v_mode_evaluation, v_bareme_id
  from public.parcours
  where id = p_parcours_id;

  if not coalesce(v_mode_evaluation, false) or v_bareme_id is null then
    update public.eleve_parcours_stats
    set evaluation_note = null,
        evaluation_max_points = null,
        evaluation_bareme_id = null,
        evaluation_updated_at = now()
    where student_id = p_student_id
      and parcours_id = p_parcours_id;
    return;
  end if;

  select *
  into v_stats
  from public.eleve_parcours_stats
  where student_id = p_student_id
    and parcours_id = p_parcours_id
  limit 1;

  if not found or coalesce(v_stats.parcours_termine, false) = false then
    update public.eleve_parcours_stats
    set evaluation_note = null,
        evaluation_max_points = (
          select max(points)
          from public.group_evaluation_bareme_cells
          where bareme_page_id = v_bareme_id
        ),
        evaluation_bareme_id = v_bareme_id,
        evaluation_updated_at = now()
    where student_id = p_student_id
      and parcours_id = p_parcours_id;
    return;
  end if;

  select max(points)
  into v_max_points
  from public.group_evaluation_bareme_cells
  where bareme_page_id = v_bareme_id;

  select a.*
  into v_row_axis
  from public.group_evaluation_bareme_axes a
  where a.bareme_page_id = v_bareme_id
    and a.axis = 'row'
    and (
      (
        a.metric = 'time'
        and floor(coalesce(v_stats.chronometre_ms, 0)::numeric / 1000)
          between coalesce(a.time_min_seconds, 0) and coalesce(a.time_max_seconds, 0)
      )
      or
      (
        a.metric = 'beacons'
        and coalesce(v_stats.best_score, v_stats.last_score, 0) = coalesce(a.beacon_count, -1)
      )
      or
      (
        a.metric = 'score'
        and coalesce(v_stats.best_points, v_stats.last_points, 0)
          between coalesce(a.score_min, 0) and coalesce(a.score_max, 0)
      )
    )
  order by a.order_index asc
  limit 1;

  if not found then
    update public.eleve_parcours_stats
    set evaluation_note = null,
        evaluation_max_points = v_max_points,
        evaluation_bareme_id = v_bareme_id,
        evaluation_updated_at = now()
    where student_id = p_student_id
      and parcours_id = p_parcours_id;
    return;
  end if;

  select a.*
  into v_col_axis
  from public.group_evaluation_bareme_axes a
  where a.bareme_page_id = v_bareme_id
    and a.axis = 'column'
    and (
      (
        a.metric = 'points'
      )
      or
      (
        a.metric = 'time'
        and floor(coalesce(v_stats.chronometre_ms, 0)::numeric / 1000)
          between coalesce(a.time_min_seconds, 0) and coalesce(a.time_max_seconds, 0)
      )
      or
      (
        a.metric = 'beacons'
        and coalesce(v_stats.best_score, v_stats.last_score, 0) = coalesce(a.beacon_count, -1)
      )
      or
      (
        a.metric = 'score'
        and coalesce(v_stats.best_points, v_stats.last_points, 0)
          between coalesce(a.score_min, 0) and coalesce(a.score_max, 0)
      )
    )
  order by a.order_index asc
  limit 1;

  if not found then
    update public.eleve_parcours_stats
    set evaluation_note = null,
        evaluation_max_points = v_max_points,
        evaluation_bareme_id = v_bareme_id,
        evaluation_updated_at = now()
    where student_id = p_student_id
      and parcours_id = p_parcours_id;
    return;
  end if;

  select c.points
  into v_note
  from public.group_evaluation_bareme_cells c
  where c.bareme_page_id = v_bareme_id
    and c.row_axis_id = v_row_axis.id
    and c.column_axis_id = v_col_axis.id
  limit 1;

  update public.eleve_parcours_stats
  set evaluation_note = v_note,
      evaluation_max_points = v_max_points,
      evaluation_bareme_id = v_bareme_id,
      evaluation_updated_at = now()
  where student_id = p_student_id
    and parcours_id = p_parcours_id;
end;
$$;

create or replace function public.recalculer_evaluation_notes_for_parcours(
  p_parcours_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select student_id
    from public.eleve_parcours_stats
    where parcours_id = p_parcours_id
  loop
    perform public.recalculer_evaluation_note(r.student_id, p_parcours_id);
  end loop;
end;
$$;

create or replace function public.recalculer_evaluation_notes_for_bareme(
  p_bareme_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select id
    from public.parcours
    where mode_evaluation = true
      and bareme_evaluation_id = p_bareme_id
  loop
    perform public.recalculer_evaluation_notes_for_parcours(r.id);
  end loop;
end;
$$;

create or replace function public.trg_recalculer_evaluation_note_from_stats()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.recalculer_evaluation_note(new.student_id, new.parcours_id);
  return new;
end;
$$;

drop trigger if exists recalculer_evaluation_note_from_stats on public.eleve_parcours_stats;
create trigger recalculer_evaluation_note_from_stats
after insert or update of best_score, last_score, best_points, last_points, parcours_termine, chronometre_ms
on public.eleve_parcours_stats
for each row
execute function public.trg_recalculer_evaluation_note_from_stats();

create or replace function public.trg_recalculer_evaluation_from_parcours()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.recalculer_evaluation_notes_for_parcours(new.id);
  if old.bareme_evaluation_id is not null and old.bareme_evaluation_id <> new.bareme_evaluation_id then
    perform public.recalculer_evaluation_notes_for_bareme(old.bareme_evaluation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists recalculer_evaluation_from_parcours on public.parcours;
create trigger recalculer_evaluation_from_parcours
after update of mode_evaluation, bareme_evaluation_id
on public.parcours
for each row
execute function public.trg_recalculer_evaluation_from_parcours();

create or replace function public.trg_recalculer_evaluation_from_bareme()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bareme_id uuid;
begin
  if tg_table_name = 'group_evaluation_bareme_pages' then
    v_bareme_id := coalesce(new.id, old.id);
  else
    v_bareme_id := coalesce(new.bareme_page_id, old.bareme_page_id);
  end if;

  if v_bareme_id is not null then
    perform public.recalculer_evaluation_notes_for_bareme(v_bareme_id);
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists recalculer_evaluation_from_bareme_axes on public.group_evaluation_bareme_axes;
create trigger recalculer_evaluation_from_bareme_axes
after insert or update or delete
on public.group_evaluation_bareme_axes
for each row
execute function public.trg_recalculer_evaluation_from_bareme();

drop trigger if exists recalculer_evaluation_from_bareme_cells on public.group_evaluation_bareme_cells;
create trigger recalculer_evaluation_from_bareme_cells
after insert or update or delete
on public.group_evaluation_bareme_cells
for each row
execute function public.trg_recalculer_evaluation_from_bareme();

comment on column public.parcours.mode_evaluation
  is 'Active le mode evaluation pour ce parcours.';

comment on column public.parcours.bareme_evaluation_id
  is 'Bareme evaluation associe au parcours lorsque mode_evaluation = true.';

comment on column public.eleve_parcours_stats.evaluation_note
  is 'Note calculee automatiquement via le bareme evaluation du parcours.';

comment on column public.eleve_parcours_stats.evaluation_max_points
  is 'Maximum de points du bareme evaluation associe au moment du recalcul.';
