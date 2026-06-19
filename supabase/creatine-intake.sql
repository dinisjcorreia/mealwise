-- Run manually in Supabase SQL editor.
-- Adds daily creatine tracking for existing projects.

create table if not exists public.creatine_intake (
  user_id uuid not null references auth.users(id) on delete cascade,
  intake_date date not null default current_date,
  taken boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, intake_date)
);

alter table public.creatine_intake enable row level security;

drop policy if exists "Users can view own creatine intake" on public.creatine_intake;
create policy "Users can view own creatine intake"
  on public.creatine_intake for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own creatine intake" on public.creatine_intake;
create policy "Users can insert own creatine intake"
  on public.creatine_intake for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own creatine intake" on public.creatine_intake;
create policy "Users can update own creatine intake"
  on public.creatine_intake for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
