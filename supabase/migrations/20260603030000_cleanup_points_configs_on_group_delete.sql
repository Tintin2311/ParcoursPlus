-- Nettoyage automatique des configurations de points quand une classe ou une session groupe disparaît.

create or replace function public.cleanup_points_configs_for_target()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.group_points_configs
  where group_id = old.id;

  delete from public.personnaliser_parcours_termines
  where group_id = old.id;

  return old;
end;
$$;

drop trigger if exists cleanup_points_configs_after_group_delete on public.groups;
create trigger cleanup_points_configs_after_group_delete
after delete on public.groups
for each row
execute function public.cleanup_points_configs_for_target();

drop trigger if exists cleanup_points_configs_after_group_session_delete on public."GroupeSessionEleves";
create trigger cleanup_points_configs_after_group_session_delete
after delete on public."GroupeSessionEleves"
for each row
execute function public.cleanup_points_configs_for_target();
