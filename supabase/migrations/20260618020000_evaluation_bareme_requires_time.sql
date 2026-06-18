create or replace function public.evaluation_bareme_requires_time(
  p_bareme_id uuid
) returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.group_evaluation_bareme_axes a
    where a.bareme_page_id = p_bareme_id
      and a.metric = 'time'
    limit 1
  );
$$;

grant execute on function public.evaluation_bareme_requires_time(uuid) to anon, authenticated;
