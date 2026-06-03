-- Run manually in Supabase SQL editor if you already created the schema before text-only meals.

alter table public.meals
  alter column photo_path drop not null;
