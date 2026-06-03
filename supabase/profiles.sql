-- Run manually in Supabase SQL editor if you already created the schema before profiles.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_gender') then
    create type public.profile_gender as enum ('female', 'male');
  end if;
  if not exists (select 1 from pg_type where typname = 'weight_goal') then
    create type public.weight_goal as enum ('lose', 'maintain', 'gain');
  end if;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gender public.profile_gender not null,
  age integer not null check (age >= 13 and age <= 100),
  height_cm numeric not null check (height_cm >= 120 and height_cm <= 230),
  weight_kg numeric not null check (weight_kg >= 35 and weight_kg <= 300),
  goal public.weight_goal not null,
  daily_calorie_target integer not null check (daily_calorie_target > 0),
  daily_protein_target_g integer not null check (daily_protein_target_g > 0),
  daily_water_target_ml integer not null check (daily_water_target_ml > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
