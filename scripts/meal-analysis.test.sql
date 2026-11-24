-- Run only in the disposable database created by test-meal-analysis.sh.
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.meals(id, user_id, meal_date) values (
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '2026-10-06'
);
do $$
declare
  meal public.meals;
  original_version timestamptz;
  result jsonb;
  items jsonb := '[{"food_name":"Ovo","portion":"1","calories":72,"protein_g":6,"carbs_g":0.4,"fat_g":5,"fiber_g":0,"sugar_g":0.2,"sodium_mg":70,"confidence":0.9}]';
begin
  select * into meal from public.meals limit 1;
  original_version := meal.updated_at;
  result := public.save_meal_analysis(meal.id, meal.user_id, meal.updated_at, items, null, null);
  assert result->>'status' = 'saved';
  assert jsonb_array_length(result->'meal_items') = 1;
  assert (result->'meal_items'->0->>'calories')::numeric = 72;
  select * into meal from public.meals limit 1;
  begin
    perform public.save_meal_analysis(meal.id, meal.user_id, original_version, items, null, null);
    raise exception 'stale update accepted';
  exception when raise_exception then
    if sqlerrm <> 'MEAL_CONFLICT' then raise; end if;
  end;
  begin
    perform public.save_meal_analysis(meal.id, '33333333-3333-3333-3333-333333333333', meal.updated_at, items, null, null);
    raise exception 'wrong owner accepted';
  exception when raise_exception then
    if sqlerrm <> 'MEAL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.save_meal_analysis(meal.id, meal.user_id, meal.updated_at,
      jsonb_set(items, '{0,calories}', '-1'), null, null, 'bad answer', 'question');
    raise exception 'invalid nutrients accepted';
  exception when check_violation then null;
  end;
  assert (select sum(calories) = 72 from public.meal_items);
  assert (select count(*) = 0 from public.clarifications);
  assert (select updated_at = meal.updated_at from public.meals where id = meal.id);
  result := public.save_meal_analysis(meal.id, meal.user_id, meal.updated_at, null,
    'Qual era a porção?', 'Correction pending', 'Era menor', 'Correcção');
  assert result->>'status' = 'saved';
  assert (result->'meal_items'->0->>'calories')::numeric = 72;
  assert result->>'clarification_question' = 'Qual era a porção?';
  assert (select count(*) = 1 from public.clarifications);
  assert not has_function_privilege('anon', 'public.save_meal_analysis(uuid,uuid,timestamptz,jsonb,text,text,text,text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.save_meal_analysis(uuid,uuid,timestamptz,jsonb,text,text,text,text)', 'execute');
  assert has_function_privilege('service_role', 'public.save_meal_analysis(uuid,uuid,timestamptz,jsonb,text,text,text,text)', 'execute');
end $$;
