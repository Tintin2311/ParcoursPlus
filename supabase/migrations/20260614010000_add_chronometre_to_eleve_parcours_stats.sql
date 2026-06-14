alter table public.eleve_parcours_stats
add column if not exists chronometre_ms bigint not null default 0,
add column if not exists chronometre_started_at timestamptz,
add column if not exists chronometre_running boolean not null default false,
add column if not exists chronometre_finished boolean not null default false;

comment on column public.eleve_parcours_stats.chronometre_ms
is 'Temps chronometre en millisecondes pour un eleve sur un parcours.';

comment on column public.eleve_parcours_stats.chronometre_started_at
is 'Horodatage de depart quand le chronometre est en cours.';

comment on column public.eleve_parcours_stats.chronometre_running
is 'Indique si le chronometre du parcours est en cours.';

comment on column public.eleve_parcours_stats.chronometre_finished
is 'Indique si le chronometre est definitivement arrete car le parcours est reussi.';
