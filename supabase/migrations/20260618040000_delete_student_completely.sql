create or replace function public.delete_student_completely(
  p_student_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_teacher_id uuid;
begin
  select teacher_id
  into v_teacher_id
  from public.students
  where id = p_student_id;

  if v_teacher_id is null or v_teacher_id <> auth.uid() then
    raise exception 'student_not_found_or_forbidden';
  end if;

  update public."GroupeSessionEleves"
  set student_ids = coalesce(
    (
      select jsonb_agg(value)
      from jsonb_array_elements(student_ids) as item(value)
      where trim(both '"' from value::text) <> p_student_id::text
    ),
    '[]'::jsonb
  )
  where teacher_id = auth.uid()
    and student_ids @> to_jsonb(array[p_student_id::text]);

  delete from public.eleve_parcours_tentatives
  where student_id = p_student_id;

  delete from public.eleve_parcours_stats
  where student_id = p_student_id;

  delete from public.students
  where id = p_student_id
    and teacher_id = auth.uid();
end;
$$;

grant execute on function public.delete_student_completely(uuid) to authenticated;
