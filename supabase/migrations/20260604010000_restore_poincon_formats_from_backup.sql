-- Restore poincon compact columns after the legacy format storage was dropped.
--
-- Context:
-- - public.balise_formats and public.balises.formats were removed.
-- - public.balises still exists, but currently has 0 compact poincon rows.
-- - These 14 poincon payloads come from backup_data_avant_refacto.sql.
--
-- This migration is intentionally narrow: it only restores poincon metadata on
-- the known balise ids and does not change codes, points, parcours, or students.

begin;

with restored(balise_id, rows, cols, cells) as (
  values
    ('90c070c6-ba5f-45bc-b83e-2dd309bbf553'::uuid, 3, 3, '[[true, true, true], [false, true, false], [false, true, false]]'::jsonb),
    ('e6d00838-2d66-46c8-a04f-388dad9ce68d'::uuid, 3, 3, '[[true, true, false], [true, false, true], [true, true, false]]'::jsonb),
    ('f494a65c-88ac-4a60-8388-75eac6511a31'::uuid, 3, 3, '[[true, false, false], [true, false, false], [true, true, true]]'::jsonb),
    ('59900b05-1301-4060-90cb-55b1ffa79585'::uuid, 3, 3, '[[true, false, true], [true, true, true], [true, false, true]]'::jsonb),
    ('51433581-abcc-4df0-bd4b-c129148760c0'::uuid, 3, 3, '[[true, true, true], [true, true, true], [false, false, true]]'::jsonb),
    ('cd091a93-60c3-4ec2-8609-396353eacf3c'::uuid, 3, 3, '[[true, false, true], [true, true, true], [true, false, true]]'::jsonb),
    ('58dfcc35-8592-446d-b65e-063050ce309a'::uuid, 3, 3, '[[true, false, false], [true, true, false], [true, true, true]]'::jsonb),
    ('f106685e-a611-4c7a-865b-dee5f763a0f0'::uuid, 3, 3, '[[true, true, true], [true, true, true], [true, true, true]]'::jsonb),
    ('a2da79c2-5bbb-4c2a-8cbe-5b56a412023f'::uuid, 3, 3, '[[false, false, false], [true, true, true], [true, true, true]]'::jsonb),
    ('687547e1-fd02-4e0a-b3fa-6d67e1d559dd'::uuid, 3, 3, '[[true, true, false], [true, false, true], [true, true, false]]'::jsonb),
    ('831c2cab-5fb1-4d5f-847e-743794bb4911'::uuid, 3, 3, '[[true, false, true], [true, false, true], [true, true, true]]'::jsonb),
    ('e511a548-f066-47bb-95a1-42b7c97a7312'::uuid, 3, 3, '[[true, true, true], [false, true, false], [false, true, false]]'::jsonb),
    ('3f20d371-ad88-4969-bafe-27f3fecf500c'::uuid, 3, 3, '[[false, false, false], [false, true, false], [false, false, false]]'::jsonb),
    ('89869abb-5246-4fe2-836a-f32255818a49'::uuid, 3, 3, '[[false, false, false], [false, true, false], [false, false, false]]'::jsonb)
),
updated as (
  update public.balises b
  set
    format_types = case
      when 'poincon' = any(coalesce(b.format_types, array[]::text[]))
        then coalesce(b.format_types, array['code']::text[])
      else array_append(coalesce(b.format_types, array['code']::text[]), 'poincon')
    end,
    poincon_rows = r.rows,
    poincon_cols = r.cols,
    poincon_cells = r.cells
  from restored r
  where b.id = r.balise_id
  returning b.id
)
select count(*) as restored_rows
from updated;

select count(*) as compact_poincons
from public.balises
where 'poincon' = any(format_types)
  and poincon_cells is not null;

commit;
