create or replace function public.trigger_recalcul_apres_tentative()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_student_id uuid;
  v_parcours_id uuid;
begin
  v_student_id := coalesce(new.student_id, old.student_id);
  v_parcours_id := coalesce(new.parcours_id, old.parcours_id);

  if v_student_id is not null and v_parcours_id is not null then
    perform public.recalculer_stats_eleve_parcours(v_student_id, v_parcours_id);
  end if;

  return coalesce(new, old);
end;
$$;
