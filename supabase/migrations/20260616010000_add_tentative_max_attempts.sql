alter table public.group_tentative_bareme_pages
  add column if not exists max_attempts integer;

alter table public.group_tentative_bareme_pages
  drop constraint if exists group_tentative_bareme_pages_max_attempts_check;

alter table public.group_tentative_bareme_pages
  add constraint group_tentative_bareme_pages_max_attempts_check
  check (max_attempts is null or max_attempts >= 1);

comment on column public.group_tentative_bareme_pages.max_attempts
  is 'Nombre maximal de tentatives autorisees pour cette page de bareme. NULL = illimite.';

alter table public.group_points_configs
  add column if not exists tentative_max_attempts_assignments jsonb not null default '{}'::jsonb;

comment on column public.group_points_configs.tentative_max_attempts_assignments
  is 'Mapping { parcours_id: max_attempts } copie lors de l association d une page de bareme de tentatives. Absence de cle = illimite.';
