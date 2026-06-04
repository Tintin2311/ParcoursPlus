-- Réparation ponctuelle : applique 1000 pts à tous les parcours CARTO MAGIC associés à la 6A.
-- À exécuter dans Supabase SQL Editor si tu veux corriger immédiatement les lignes déjà créées.

insert into public.personnaliser_parcours_termines (
  professeur_id,
  group_id,
  parcours_id,
  points_personnalises
)
select
  'eb9bb548-71d9-457c-a0bf-1e98b8db02a3'::uuid as professeur_id,
  '655e06e9-2826-4452-8b75-e72cc5f5d1be'::uuid as group_id,
  p.id as parcours_id,
  1000 as points_personnalises
from public.parcours p
where p.folder_id = '749ee866-5647-4732-aec2-b9081f80035c'::uuid
  and coalesce(p.groupes_associes, array[]::uuid[])
    @> array['655e06e9-2826-4452-8b75-e72cc5f5d1be'::uuid]
on conflict (professeur_id, group_id, parcours_id)
do update set
  points_personnalises = excluded.points_personnalises,
  updated_at = now();
