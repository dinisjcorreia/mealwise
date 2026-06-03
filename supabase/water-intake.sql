-- Run manually in Supabase SQL editor before deploying water tracking code.

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

create table if not exists public.water_intake (
  user_id uuid not null references auth.users(id) on delete cascade,
  intake_date date not null default current_date,
  amount_ml integer not null default 0 check (amount_ml >= 0 and amount_ml <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, intake_date)
);

alter table public.water_intake enable row level security;

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
