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
  v_seconds numeric := 0;
  v_beacons numeric := 0;
  v_score numeric := 0;
  v_stats_found boolean := false;
  v_row_found boolean := false;
  v_col_found boolean := false;
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

  v_stats_found := found;

  select max(points)
  into v_max_points
  from public.group_evaluation_bareme_cells
  where bareme_page_id = v_bareme_id;

  if not v_stats_found or (
    coalesce(v_stats.parcours_termine, false) = false
    and coalesce(v_stats.chronometre_finished, false) = false
  ) then
    update public.eleve_parcours_stats
    set evaluation_note = null,
        evaluation_max_points = v_max_points,
        evaluation_bareme_id = v_bareme_id,
        evaluation_updated_at = now()
    where student_id = p_student_id
      and parcours_id = p_parcours_id;
    return;
  end if;

  v_seconds := floor(coalesce(v_stats.chronometre_ms, 0)::numeric / 1000);
  v_beacons := coalesce(v_stats.last_score, v_stats.best_score, 0);
  v_score := coalesce(v_stats.last_points, v_stats.best_points, 0);

  select a.*
  into v_row_axis
  from public.group_evaluation_bareme_axes a
  where a.bareme_page_id = v_bareme_id
    and a.axis = 'row'
  order by
    case
      when a.metric = 'time' and v_seconds between coalesce(a.time_min_seconds, 0) and coalesce(a.time_max_seconds, 0) then 0
      when a.metric = 'beacons' and v_beacons = coalesce(a.beacon_count, -1) then 0
      when a.metric = 'score' and v_score between coalesce(a.score_min, 0) and coalesce(a.score_max, 0) then 0
      else 1
    end,
    case
      when a.metric = 'time' then least(
        abs(v_seconds - coalesce(a.time_min_seconds, 0)),
        abs(v_seconds - coalesce(a.time_max_seconds, 0))
      )
      when a.metric = 'beacons' then abs(v_beacons - coalesce(a.beacon_count, 0))
      when a.metric = 'score' then least(
        abs(v_score - coalesce(a.score_min, 0)),
        abs(v_score - coalesce(a.score_max, 0))
      )
      else 999999999
    end,
    a.order_index asc
  limit 1;

  v_row_found := found;

  select a.*
  into v_col_axis
  from public.group_evaluation_bareme_axes a
  where a.bareme_page_id = v_bareme_id
    and a.axis = 'column'
  order by
    case
      when a.metric = 'points' then 0
      when a.metric = 'time' and v_seconds between coalesce(a.time_min_seconds, 0) and coalesce(a.time_max_seconds, 0) then 0
      when a.metric = 'beacons' and v_beacons = coalesce(a.beacon_count, -1) then 0
      when a.metric = 'score' and v_score between coalesce(a.score_min, 0) and coalesce(a.score_max, 0) then 0
      else 1
    end,
    case
      when a.metric = 'points' then 0
      when a.metric = 'time' then least(
        abs(v_seconds - coalesce(a.time_min_seconds, 0)),
        abs(v_seconds - coalesce(a.time_max_seconds, 0))
      )
      when a.metric = 'beacons' then abs(v_beacons - coalesce(a.beacon_count, 0))
      when a.metric = 'score' then least(
        abs(v_score - coalesce(a.score_min, 0)),
        abs(v_score - coalesce(a.score_max, 0))
      )
      else 999999999
    end,
    a.order_index asc
  limit 1;

  v_col_found := found;

  if not v_row_found or not v_col_found then
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

create or replace function public.get_evaluation_note(
  p_student_id uuid,
  p_parcours_id uuid
) returns table (
  note numeric,
  max_points numeric,
  bareme_id uuid,
  reason text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.recalculer_evaluation_note(p_student_id, p_parcours_id);

  return query
  select
    s.evaluation_note,
    s.evaluation_max_points,
    s.evaluation_bareme_id,
    case
      when s.evaluation_bareme_id is null then 'no_evaluation_bareme'
      when s.evaluation_note is null
        and coalesce(s.parcours_termine, false) = false
        and coalesce(s.chronometre_finished, false) = false then 'not_finished'
      when s.evaluation_note is null then 'no_matching_cell'
      else 'ok'
    end
  from public.eleve_parcours_stats s
  where s.student_id = p_student_id
    and s.parcours_id = p_parcours_id
  limit 1;
end;
$$;

grant execute on function public.get_evaluation_note(uuid, uuid) to anon, authenticated;
