-- supabase/migrations/0001_initial.sql

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  is_pro boolean not null default false,
  city text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pre-generated puzzle pool
create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  difficulty text not null check (difficulty in ('easy','medium','hard','expert')),
  givens text not null,
  solution text not null,
  clues int not null,
  created_at timestamptz not null default now()
);
create index puzzles_difficulty_idx on public.puzzles(difficulty);

-- Daily challenges (one per UTC date)
create table public.daily_puzzles (
  date date primary key,
  givens text not null,
  solution text not null,
  difficulty text not null,
  min_seconds int not null
);

-- In-progress + finished games
create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id uuid references public.puzzles(id),
  daily_date date references public.daily_puzzles(date),
  givens text not null,
  current_state text not null,
  notes jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  elapsed_seconds int not null default 0,
  difficulty text not null,
  errors_made int not null default 0,
  hints_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_user_idx on public.games(user_id);
create index games_daily_idx on public.games(daily_date) where daily_date is not null;

-- Daily leaderboard entries (one row per user per date)
create table public.daily_results (
  date date not null references public.daily_puzzles(date),
  user_id uuid not null references auth.users(id) on delete cascade,
  elapsed_seconds int not null,
  city text,
  created_at timestamptz not null default now(),
  primary key (date, user_id)
);
create index daily_results_date_time_idx on public.daily_results(date, elapsed_seconds);

-- AI Coach usage (rate limit)
create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (current_date at time zone 'utc'),
  count int not null default 0,
  primary key (user_id, day)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.puzzles enable row level security;
alter table public.daily_puzzles enable row level security;
alter table public.games enable row level security;
alter table public.daily_results enable row level security;
alter table public.ai_usage enable row level security;

-- Profiles: world read; users update own
create policy profiles_self_read on public.profiles for select using (true);
create policy profiles_self_update on public.profiles for update using (auth.uid() = id);

-- Puzzles + daily_puzzles: world-readable (service role inserts; no public writes)
create policy puzzles_world_read on public.puzzles for select using (true);
create policy daily_world_read on public.daily_puzzles for select using (true);

-- Games: users read/write only their own
create policy games_owner_all on public.games for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Daily results: world-read for leaderboard
create policy daily_results_world_read on public.daily_results for select using (true);

-- AI usage: users see/update own
create policy ai_usage_owner_all on public.ai_usage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
