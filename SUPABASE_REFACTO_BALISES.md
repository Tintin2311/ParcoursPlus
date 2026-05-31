# Refacto Supabase des balises

Date : 31 mai 2026

## Objectif

Préparer la fusion progressive de `balise_formats` dans `balises`, sans casser l'application.

## Ce qui a été fait

- Sauvegarde SQL du schéma, des données, et de la base complète.
- Ajout de `backup_*_avant_refacto.sql` dans `.gitignore`.
- Création d'une migration prudente :
  - `supabase/migrations/20260531_01_prepare_balises_formats_merge.sql`
- Création d'un rollback :
  - `supabase/migrations/20260531_01_prepare_balises_formats_merge_rollback.sql`
- Ajout de la colonne `public.balises.formats` en `jsonb`.
- Copie des lignes de `public.balise_formats` dans `public.balises.formats`.
- Conservation complète de `public.balise_formats`.
- Mise à jour de la fonction `public.get_poincon_formats_by_balise_ids`.
- Ajout d'une couche de compatibilité dans le code :
  - `src/baliseFormatsCompat.ts`

## Vérifications faites

Formats copiés :

```sql
select
  (select count(*) from public.balise_formats) as old_format_rows,
  (
    select count(*)
    from public.balises b,
    lateral jsonb_object_keys(b.formats) as k
  ) as new_format_keys;
```

Résultat obtenu :

- `old_format_rows` : 158
- `new_format_keys` : 158

Poinçons copiés :

```sql
select
  (select count(*) from public.balise_formats where format_type = 'poincon') as old_poincon_rows,
  (select count(*) from public.balises where formats ? 'poincon') as new_poincon_keys;
```

Résultat obtenu :

- `old_poincon_rows` : 14
- `new_poincon_keys` : 14

Fonction poinçon testée :

```sql
select *
from public.get_poincon_formats_by_balise_ids(
  array(
    select balise_id
    from public.balise_formats
    where format_type = 'poincon'
    limit 3
  )
);
```

Résultat obtenu :

- 3 lignes retournées.

Application testée :

- L'app web se lance sur `localhost`.
- L'écran Mes balises affiche 144 balises.
- Une fiche balise s'ouvre correctement.
- La création de parcours affiche les formats.
- Le filtre Poinçon affiche les balises avec grilles poinçon.

## Ne pas faire maintenant

Ne pas supprimer `public.balise_formats` tout de suite.

Cette table reste volontairement présente comme sécurité et comme compatibilité pendant la période de vérification.

## Rollback phase 1

Si la phase 1 pose problème, exécuter dans Supabase SQL Editor le contenu de :

```text
supabase/migrations/20260531_01_prepare_balises_formats_merge_rollback.sql
```

Ce rollback :

- supprime l'index `balises_formats_gin_idx`
- supprime la colonne `public.balises.formats`
- restaure la fonction `public.get_poincon_formats_by_balise_ids` pour lire uniquement `public.balise_formats`
- ne touche pas aux données de `public.balise_formats`

## Prochaine phase possible

Après plusieurs jours de tests :

1. Vérifier que toutes les lectures importantes passent bien par `balises.formats`.
2. Créer une vue ou une fonction de compatibilité si besoin.
3. Tester encore.
4. Seulement ensuite envisager la suppression de `public.balise_formats`.

La suppression de `public.balise_formats` devra être une migration séparée, jamais mélangée avec cette phase.
