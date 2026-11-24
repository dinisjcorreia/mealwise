-- Apply before deploying the matching API. Existing tables/data are preserved.
begin;

create or replace function public.save_meal_analysis(
  p_meal_id uuid, p_user_id uuid, p_expected_updated_at timestamptz,
  p_items jsonb, p_question text, p_notes text,
  p_answer text default null, p_answer_question text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  meal public.meals;
  items jsonb;
begin
  select * into meal from public.meals
  where id = p_meal_id and user_id = p_user_id for update;
  if not found then raise exception 'MEAL_NOT_FOUND'; end if;
  if meal.updated_at is distinct from p_expected_updated_at then
    raise exception 'MEAL_CONFLICT';
  end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
    if jsonb_array_length(p_items) = 0 then raise exception 'INVALID_ITEMS'; end if;
    -- Delete and insert share this transaction: any failure restores the old meal.
    delete from public.meal_items where meal_id = p_meal_id;
    insert into public.meal_items (
      meal_id, food_name, portion, calories, protein_g, carbs_g, fat_g,
      fiber_g, sugar_g, sodium_mg, confidence, notes
    ) select p_meal_id, food_name, portion, calories, protein_g, carbs_g, fat_g,
      fiber_g, sugar_g, sodium_mg, confidence, notes
    from jsonb_to_recordset(p_items) as x(
      food_name text, portion text, calories numeric, protein_g numeric,
      carbs_g numeric, fat_g numeric, fiber_g numeric, sugar_g numeric,
      sodium_mg numeric, confidence numeric, notes text
    );
  elsif nullif(btrim(p_question), '') is null then
    raise exception 'CLARIFICATION_REQUIRED';
  end if;

  if p_answer is not null then
    insert into public.clarifications(meal_id, question, answer)
    values (p_meal_id, p_answer_question, p_answer);
  end if;

  update public.meals set
    status = case when p_items is not null then 'saved'::public.meal_status else meal.status end,
    clarification_question = case when p_items is not null then null else p_question end,
    ai_notes = p_notes,
    updated_at = greatest(clock_timestamp(), meal.updated_at + interval '1 microsecond')
  where id = p_meal_id returning * into meal;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'::jsonb)
  into items from public.meal_items i where i.meal_id = p_meal_id;
  return to_jsonb(meal) || jsonb_build_object('meal_items', items);
end;
$$;

-- The API authenticates users and supplies their verified ID. No public RPC access.
revoke all on function public.save_meal_analysis(uuid, uuid, timestamptz, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_meal_analysis(uuid, uuid, timestamptz, jsonb, text, text, text, text) to service_role;
commit;
