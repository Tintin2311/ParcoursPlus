-- Personnalisation du bonus "parcours terminé" par professeur, classe et parcours.
-- Source de vérité :
-- public.personnaliser_parcours_termines(professeur_id, group_id, parcours_id, points_personnalises)

create table if not exists public.personnaliser_parcours_termines (
  id uuid primary key default gen_random_uuid(),
  professeur_id uuid not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  parcours_id uuid not null references public.parcours(id) on delete cascade,
  points_personnalises integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnaliser_parcours_termines_points_check check (points_personnalises >= 0),
  constraint personnaliser_parcours_termines_unique unique (professeur_id, group_id, parcours_id)
);

create index if not exists personnaliser_parcours_termines_group_idx
  on public.personnaliser_parcours_termines(group_id);

create index if not exists personnaliser_parcours_termines_parcours_idx
  on public.personnaliser_parcours_termines(parcours_id);

create index if not exists personnaliser_parcours_termines_professeur_idx
  on public.personnaliser_parcours_termines(professeur_id);

alter table public.personnaliser_parcours_termines enable row level security;

drop policy if exists "personnaliser_parcours_termines_select" on public.personnaliser_parcours_termines;
create policy "personnaliser_parcours_termines_select"
  on public.personnaliser_parcours_termines
  for select
  using (true);

drop policy if exists "personnaliser_parcours_termines_insert_own" on public.personnaliser_parcours_termines;
create policy "personnaliser_parcours_termines_insert_own"
  on public.personnaliser_parcours_termines
  for insert
  with check (auth.uid() = professeur_id);

drop policy if exists "personnaliser_parcours_termines_update_own" on public.personnaliser_parcours_termines;
create policy "personnaliser_parcours_termines_update_own"
  on public.personnaliser_parcours_termines
  for update
  using (auth.uid() = professeur_id)
  with check (auth.uid() = professeur_id);

drop policy if exists "personnaliser_parcours_termines_delete_own" on public.personnaliser_parcours_termines;
create policy "personnaliser_parcours_termines_delete_own"
  on public.personnaliser_parcours_termines
  for delete
  using (auth.uid() = professeur_id);

create or replace function public.set_updated_at_personnaliser_parcours_termines()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_personnaliser_parcours_termines
  on public.personnaliser_parcours_termines;

create trigger set_updated_at_personnaliser_parcours_termines
before update on public.personnaliser_parcours_termines
for each row
execute function public.set_updated_at_personnaliser_parcours_termines();

-- Migration des anciennes valeurs stockées dans group_points_configs.
insert into public.personnaliser_parcours_termines (
  professeur_id,
  group_id,
  parcours_id,
  points_personnalises
)
select
  gpc.professeur_id,
  gpc.group_id,
  e.key::uuid,
  greatest(0, round((e.value)::numeric)::integer)
from public.group_points_configs gpc
cross join lateral jsonb_each_text(
  coalesce(gpc.tentative_source_assignments, '{}'::jsonb) -> 'parcours_bonus_overrides'
) e
where gpc.professeur_id is not null
  and gpc.group_id is not null
  and e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and e.value ~ '^[0-9]+(\.[0-9]+)?$'
on conflict (professeur_id, group_id, parcours_id)
do update set
  points_personnalises = excluded.points_personnalises,
  updated_at = now();

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
    v_config_professeur_id := v_config.professeur_id;

    if v_points_par_parcours > 0 then
      v_mode_parcours := true;
    end if;

    if v_config.tentative_page_mode = 'personnalise' then
      v_attempt_page := nullif(v_config.tentative_page_assignments ->> p_parcours_id::text, '')::integer;
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
      coalesce(points, 0) as points,
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

create or replace function public.recalculer_personnalisation_parcours_termines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_group_id uuid;
  v_parcours_id uuid;
  r record;
begin
  if TG_OP = 'DELETE' then
    v_group_id := old.group_id;
    v_parcours_id := old.parcours_id;
  else
    v_group_id := new.group_id;
    v_parcours_id := new.parcours_id;
  end if;

  for r in
    select distinct s.id as student_id
    from public.students s
    where s.group_id = v_group_id
      and (
        exists (
          select 1
          from public.eleve_parcours_stats eps
          where eps.student_id = s.id
            and eps.parcours_id = v_parcours_id
        )
        or exists (
          select 1
          from public.eleve_parcours_tentatives ept
          where ept.student_id = s.id
            and ept.parcours_id = v_parcours_id
        )
      )
  loop
    perform public.recalculer_stats_eleve_parcours(r.student_id, v_parcours_id);
  end loop;

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists recalculer_personnalisation_parcours_termines
  on public.personnaliser_parcours_termines;

create trigger recalculer_personnalisation_parcours_termines
after insert or update or delete on public.personnaliser_parcours_termines
for each row
execute function public.recalculer_personnalisation_parcours_termines();

do $$
declare
  r record;
begin
  for r in
    select distinct student_id, parcours_id
    from public.eleve_parcours_stats
    union
    select distinct student_id, parcours_id
    from public.eleve_parcours_tentatives
  loop
    perform public.recalculer_stats_eleve_parcours(r.student_id, r.parcours_id);
  end loop;
end;
$$;
