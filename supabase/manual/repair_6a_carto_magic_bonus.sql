-- Réparation ciblée : 6A / dossier CARTO MAGIC.
-- Objectif :
-- - bonus général "parcours terminé" de la 6A : 10 points
-- - bonus personnalisé pour chaque parcours CARTO MAGIC du dossier : 500 points
-- - recalcul immédiat des stats et du classement

do $$
declare
  v_group_id uuid := '655e06e9-2826-4452-8b75-e72cc5f5d1be';
  v_teacher_id uuid := 'eb9bb548-71d9-457c-a0bf-1e98b8db02a3';
  v_folder_id uuid := '749ee866-5647-4732-aec2-b9081f80035c';
  v_general_bonus integer := 10;
  v_folder_bonus integer := 500;
  v_overrides jsonb := '{}'::jsonb;
  v_existing_assignments jsonb := '{}'::jsonb;
  v_config_id uuid;
  r record;
begin
  for r in
    select id
    from public.parcours
    where (folder_id = v_folder_id or parent_parcours_folders_id = v_folder_id)
      and coalesce(groupes_associes, array[]::uuid[]) @> array[v_group_id]::uuid[]
  loop
    v_overrides := v_overrides || jsonb_build_object(r.id::text, v_folder_bonus);
  end loop;

  select id, coalesce(tentative_source_assignments, '{}'::jsonb)
  into v_config_id, v_existing_assignments
  from public.group_points_configs
  where group_id = v_group_id
    and professeur_id = v_teacher_id
  order by updated_at desc nulls last
  limit 1;

  if v_config_id is null then
    insert into public.group_points_configs (
      group_id,
      professeur_id,
      modes,
      points_par_parcours,
      parcours_bonus_mode,
      tentative_page_mode,
      tentative_page_default,
      tentative_page_assignments,
      tentative_source_assignments,
      updated_at
    )
    values (
      v_group_id,
      v_teacher_id,
      '{"balises": true, "parcours": true, "tentatives": false}'::jsonb,
      v_general_bonus,
      'personnalise',
      'general',
      null,
      '{}'::jsonb,
      jsonb_build_object('parcours_bonus_overrides', v_overrides),
      now()
    );
  else
    update public.group_points_configs
    set
      modes = jsonb_build_object(
        'balises', coalesce((modes ->> 'balises')::boolean, true),
        'parcours', true,
        'tentatives', coalesce((modes ->> 'tentatives')::boolean, false)
      ),
      points_par_parcours = v_general_bonus,
      parcours_bonus_mode = 'personnalise',
      tentative_source_assignments =
        v_existing_assignments
        || jsonb_build_object(
          'parcours_bonus_overrides',
          coalesce(v_existing_assignments -> 'parcours_bonus_overrides', '{}'::jsonb) || v_overrides
        ),
      updated_at = now()
    where id = v_config_id;
  end if;

  for r in
    select distinct eps.student_id, eps.parcours_id
    from public.eleve_parcours_stats eps
    join public.students s on s.id = eps.student_id
    join public.parcours p on p.id = eps.parcours_id
    where s.group_id = v_group_id
      and (p.folder_id = v_folder_id or p.parent_parcours_folders_id = v_folder_id)
      and coalesce(p.groupes_associes, array[]::uuid[]) @> array[v_group_id]::uuid[]
    union
    select distinct t.student_id, t.parcours_id
    from public.eleve_parcours_tentatives t
    join public.students s on s.id = t.student_id
    join public.parcours p on p.id = t.parcours_id
    where s.group_id = v_group_id
      and (p.folder_id = v_folder_id or p.parent_parcours_folders_id = v_folder_id)
      and coalesce(p.groupes_associes, array[]::uuid[]) @> array[v_group_id]::uuid[]
  loop
    perform public.recalculer_stats_eleve_parcours(r.student_id, r.parcours_id);
  end loop;
end;
$$;
