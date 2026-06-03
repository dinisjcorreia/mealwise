-- Run manually in Supabase SQL editor.
-- Creates remote history tables, RLS, and private meal photo bucket.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meal_status') then
    create type public.meal_status as enum ('pending', 'saved');
  end if;
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

alter table public.profiles
  add column if not exists daily_water_target_ml integer;

update public.profiles
set daily_water_target_ml = round(weight_kg * 35)::integer
where daily_water_target_ml is null;

alter table public.profiles
  alter column daily_water_target_ml set not null;

alter table public.profiles
  drop constraint if exists profiles_daily_water_target_ml_check;

alter table public.profiles
  add constraint profiles_daily_water_target_ml_check
  check (daily_water_target_ml > 0);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_path text,
  description text,
  status public.meal_status not null default 'pending',
  meal_date date not null default current_date,
  clarification_question text,
  ai_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meals
  alter column photo_path drop not null;

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_name text not null,
  portion text not null,
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  fiber_g numeric not null default 0 check (fiber_g >= 0),
  sugar_g numeric not null default 0 check (sugar_g >= 0),
  sodium_mg numeric not null default 0 check (sodium_mg >= 0),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.clarifications (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  question text,
  answer text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.water_intake (
  user_id uuid not null references auth.users(id) on delete cascade,
  intake_date date not null default current_date,
  amount_ml integer not null default 0 check (amount_ml >= 0 and amount_ml <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, intake_date)
);

create index if not exists meals_user_date_idx on public.meals(user_id, meal_date desc, created_at desc);
create index if not exists meal_items_meal_idx on public.meal_items(meal_id);
create index if not exists clarifications_meal_idx on public.clarifications(meal_id);

alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.clarifications enable row level security;
alter table public.water_intake enable row level security;

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

drop policy if exists "Users can view own meals" on public.meals;
create policy "Users can view own meals"
  on public.meals for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own meals" on public.meals;
create policy "Users can insert own meals"
  on public.meals for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own meals" on public.meals;
create policy "Users can update own meals"
  on public.meals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own meals" on public.meals;
create policy "Users can delete own meals"
  on public.meals for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own meal items" on public.meal_items;
create policy "Users can view own meal items"
  on public.meal_items for select to authenticated
  using (
    exists (
      select 1 from public.meals
      where meals.id = meal_items.meal_id
      and meals.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage own meal items" on public.meal_items;
create policy "Users can manage own meal items"
  on public.meal_items for all to authenticated
  using (
    exists (
      select 1 from public.meals
      where meals.id = meal_items.meal_id
      and meals.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.meals
      where meals.id = meal_items.meal_id
      and meals.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view own clarifications" on public.clarifications;
create policy "Users can view own clarifications"
  on public.clarifications for select to authenticated
  using (
    exists (
      select 1 from public.meals
      where meals.id = clarifications.meal_id
      and meals.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can add own clarifications" on public.clarifications;
create policy "Users can add own clarifications"
  on public.clarifications for insert to authenticated
  with check (
    exists (
      select 1 from public.meals
      where meals.id = clarifications.meal_id
      and meals.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view own water intake" on public.water_intake;
create policy "Users can view own water intake"
  on public.water_intake for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own water intake" on public.water_intake;
create policy "Users can insert own water intake"
  on public.water_intake for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own water intake" on public.water_intake;
create policy "Users can update own water intake"
  on public.water_intake for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view own meal photos" on storage.objects;
create policy "Users can view own meal photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "Users can upload own meal photos" on storage.objects;
create policy "Users can upload own meal photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
