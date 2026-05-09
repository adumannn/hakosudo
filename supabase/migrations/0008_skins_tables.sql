-- supabase/migrations/0008_skins_tables.sql

create table public.skins (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  kind          text not null check (kind in ('season', 'premium', 'limited')),
  name          text not null,
  kanji_label   text not null,
  seal_kanji    text not null,
  palette_key   text not null,
  masthead      text not null,
  start_date    date,
  end_date      date,
  price_cents   int,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint skins_dates_match_kind check (
    (kind = 'season' and start_date is not null and end_date is not null and start_date <= end_date) or
    (kind <> 'season' and start_date is null and end_date is null)
  )
);

create unique index skins_season_date_idx
  on public.skins(start_date)
  where kind = 'season';

alter table public.skins enable row level security;
create policy skins_world_read on public.skins for select using (true);

create table public.user_skin_entitlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skin_id     uuid not null references public.skins(id) on delete cascade,
  source      text not null check (source in ('season', 'pro', 'purchase', 'gift')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

create index user_skin_entitlements_user_idx
  on public.user_skin_entitlements(user_id);

alter table public.user_skin_entitlements enable row level security;
create policy user_skin_entitlements_owner_read
  on public.user_skin_entitlements for select
  using (auth.uid() = user_id);

alter table public.daily_puzzles
  add column skin_id uuid references public.skins(id);

alter table public.profiles
  add column active_skin_id uuid references public.skins(id),
  add column sfx_enabled boolean not null default false;
