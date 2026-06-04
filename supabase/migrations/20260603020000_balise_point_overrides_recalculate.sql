-- Personnalisation des points de balises par classe, parcours et balise.

alter table public.group_points_configs
  add column if not exists balise_point_overrides jsonb not null default '{}'::jsonb;

create or replace function public.recalculer_stats_eleve_parcours(
  p_student_id uuid,
  p_parcours_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_group_id uuid;
  v_config record;
  v_config_professeur_id uuid := null;
  v_mode_balises boolean := true;
  v_mode_parcours boolean := false;
  v_mode_tentatives boolean := false;
  v_points_par_parcours numeric := 0;
  v_parcours_bonus_mode text := 'general';
  v_balise_point_overrides jsonb := '{}'::jsonb;
  v_custom_points integer := null;
  v_attempt_page integer := null;
  v_total_balises integer := 0;
  v_validated_count integer := 0;
  v_balises_points numeric := 0;
  v_parcours_points numeric := 0;
  v_tentatives_points numeric := 0;
  v_total_points numeric := 0;
  v_tentatives_count integer := 0;
  v_last_tentative_at timestamptz := null;
  v_completion_attempt integer := null;
  v_attempt record;
  v_validated_ids text[] := array[]::text[];
  v_current_count integer := 0;
  v_bareme record;
begin
  select group_id into v_group_id
  from public.students
  where id = p_student_id;

  select * into v_config
  from public.group_points_configs
  where group_id = v_group_id
  order by updated_at desc nulls last
  limit 1;

  if found then
    v_mode_balises := coalesce((v_config.modes ->> 'balises')::boolean, true);
    v_mode_parcours := coalesce((v_config.modes ->> 'parcours')::boolean, false);
    v_mode_tentatives := coalesce((v_config.modes ->> 'tentatives')::boolean, false);
    v_points_par_parcours := coalesce(v_config.points_par_parcours, 0);
    v_parcours_bonus_mode := coalesce(v_config.parcours_bonus_mode, 'general');
    v_balise_point_overrides := coalesce(v_config.balise_point_overrides, '{}'::jsonb);
    v_config_professeur_id := v_config.professeur_id;

    if v_points_par_parcours > 0 then
      v_mode_parcours := true;
    end if;

    if v_config.tentative_page_mode = 'personnalise' then
      v_attempt_page := coalesce(
        nullif(v_config.tentative_page_assignments ->> p_parcours_id::text, '')::integer,
        v_config.tentative_page_default
      );
    else
      v_attempt_page := v_config.tentative_page_default;
    end if;
  end if;

  if v_parcours_bonus_mode = 'personnalise' then
    select ppt.points_personnalises
    into v_custom_points
    from public.personnaliser_parcours_termines ppt
    where ppt.group_id = v_group_id
      and ppt.parcours_id = p_parcours_id
      and (
        v_config_professeur_id is null
        or ppt.professeur_id = v_config_professeur_id
      )
    order by ppt.updated_at desc nulls last
    limit 1;

    if v_custom_points is not null then
      v_points_par_parcours := v_custom_points;
      v_mode_parcours := true;
    end if;
  end if;

  select count(*), max(created_at)
  into v_tentatives_count, v_last_tentative_at
  from public.eleve_parcours_tentatives
  where student_id = p_student_id
    and parcours_id = p_parcours_id;

  select coalesce(array_agg(distinct d.detail ->> 'balise_id'), array[]::text[])
  into v_validated_ids
  from public.eleve_parcours_tentatives t
  cross join lateral jsonb_array_elements(t.details) d(detail)
  where t.student_id = p_student_id
    and t.parcours_id = p_parcours_id
    and coalesce((d.detail ->> 'correct')::boolean, false) = true
    and nullif(d.detail ->> 'balise_id', '') is not null;

  with raw_tokens as (
    select token::text as token, ordinality
    from public.parcours p,
    unnest(p.balises_ordre) with ordinality as u(token, ordinality)
    where p.id = p_parcours_id
  ),
  matched as (
    select
      b.id as balise_id,
      b.points,
      rt.ordinality,
      row_number() over (partition by b.id order by rt.ordinality) as occurrence_number
    from raw_tokens rt
    join public.balises b
      on b.id::text = rt.token
      or b.numero_balise::text = rt.token
      or upper(b.code) = upper(rt.token)
    where coalesce(b.frozen, false) = false
  ),
  ordered_balises as (
    select
      balise_id,
      coalesce(
        nullif(v_balise_point_overrides -> p_parcours_id::text ->> balise_id::text, '')::numeric,
        points,
        0
      ) as points,
      occurrence_number,
      balise_id::text || '__occ_' || occurrence_number::text || '__pos_' || (ordinality - 1)::text as instance_key
    from matched
  ),
  scored as (
    select *,
      (
        instance_key = any(v_validated_ids)
        or (balise_id::text = any(v_validated_ids) and occurrence_number = 1)
      ) as is_validated
    from ordered_balises
  )
  select count(*), count(*) filter (where is_validated), coalesce(sum(points) filter (where is_validated), 0)
  into v_total_balises, v_validated_count, v_balises_points
  from scored;

  if not v_mode_balises then
    v_balises_points := 0;
  end if;

  v_validated_ids := array[]::text[];

  for v_attempt in
    select *
    from public.eleve_parcours_tentatives
    where student_id = p_student_id
      and parcours_id = p_parcours_id
    order by tentatives_numero asc, created_at asc
  loop
    select coalesce(array_agg(distinct x), array[]::text[])
    into v_validated_ids
    from (
      select unnest(v_validated_ids) as x
      union
      select d.detail ->> 'balise_id' as x
      from jsonb_array_elements(v_attempt.details) d(detail)
      where coalesce((d.detail ->> 'correct')::boolean, false) = true
        and nullif(d.detail ->> 'balise_id', '') is not null
    ) s;

    with raw_tokens as (
      select token::text as token, ordinality
      from public.parcours p,
      unnest(p.balises_ordre) with ordinality as u(token, ordinality)
      where p.id = p_parcours_id
    ),
    matched as (
      select
        b.id as balise_id,
        rt.ordinality,
        row_number() over (partition by b.id order by rt.ordinality) as occurrence_number
      from raw_tokens rt
      join public.balises b
        on b.id::text = rt.token
        or b.numero_balise::text = rt.token
        or upper(b.code) = upper(rt.token)
      where coalesce(b.frozen, false) = false
    ),
    ordered_balises as (
      select
        balise_id,
        occurrence_number,
        balise_id::text || '__occ_' || occurrence_number::text || '__pos_' || (ordinality - 1)::text as instance_key
      from matched
    )
    select count(*)
    into v_current_count
    from ordered_balises
    where instance_key = any(v_validated_ids)
       or (balise_id::text = any(v_validated_ids) and occurrence_number = 1);

    if v_total_balises > 0 and v_current_count >= v_total_balises then
      v_completion_attempt := v_attempt.tentatives_numero;
      exit;
    end if;
  end loop;

  if v_mode_parcours
     and v_total_balises > 0
     and v_validated_count >= v_total_balises then
    v_parcours_points := v_points_par_parcours;
  end if;

  if v_mode_tentatives
     and v_total_balises > 0
     and v_validated_count >= v_total_balises
     and v_completion_attempt is not null
     and v_attempt_page is not null then

    select *
    into v_bareme
    from public.group_tentative_baremes b
    where b.attempt_page = v_attempt_page
      and (
        b.group_id = v_group_id
        or b.teacher_id = v_config_professeur_id
        or b.teacher_id = (
          select teacher_id from public.students where id = p_student_id limit 1
        )
      )
      and (
        (b.condition_type = '=' and v_completion_attempt = b.attempts_value)
        or (b.condition_type = '≥' and v_completion_attempt >= b.attempts_value)
        or (b.condition_type = '≤' and v_completion_attempt <= b.attempts_value)
        or (
          b.condition_type = 'entre'
          and v_completion_attempt >= b.attempts_min
          and v_completion_attempt <= b.attempts_max
        )
      )
    order by
      case
        when b.group_id = v_group_id then 1
        when b.teacher_id = v_config_professeur_id then 2
        else 3
      end,
      b.order_index asc
    limit 1;

    if found then
      v_tentatives_points := coalesce(v_bareme.points, 0);
    end if;
  end if;

  v_total_points := v_balises_points + v_parcours_points + v_tentatives_points;

  insert into public.eleve_parcours_stats (
    student_id, parcours_id, best_score, last_score, total_balises,
    tentatives_count, last_tentative_at, best_points, last_points,
    parcours_termine, updated_at
  )
  values (
    p_student_id, p_parcours_id, v_validated_count, v_validated_count, v_total_balises,
    v_tentatives_count, v_last_tentative_at, v_total_points, v_total_points,
    v_total_balises > 0 and v_validated_count >= v_total_balises, now()
  )
  on conflict (student_id, parcours_id)
  do update set
    best_score = excluded.best_score,
    last_score = excluded.last_score,
    total_balises = excluded.total_balises,
    tentatives_count = excluded.tentatives_count,
    last_tentative_at = excluded.last_tentative_at,
    best_points = excluded.best_points,
    last_points = excluded.last_points,
    parcours_termine = excluded.parcours_termine,
    updated_at = now();

  perform public.recalculer_total_points_eleve(p_student_id);
end;
$$;
