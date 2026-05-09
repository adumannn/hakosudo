-- supabase/migrations/0007_real_stats.sql

-- Persistent daily number that survives gaps/deletes.
create sequence if not exists daily_puzzles_seq_seq;

alter table public.daily_puzzles
  add column seq int unique default nextval('daily_puzzles_seq_seq');

-- Backfill in date order.
with ordered as (
  select date, row_number() over (order by date) as n
  from public.daily_puzzles
)
update public.daily_puzzles dp
   set seq = o.n
  from ordered o
 where dp.date = o.date;

-- Advance the sequence past the backfilled values so future inserts
-- don't collide with them. Skip when the table is empty (e.g. fresh
-- preview DB) — setval rejects 0 as < the sequence's min_value.
do $$
begin
  if exists (select 1 from public.daily_puzzles) then
    perform setval(
      'daily_puzzles_seq_seq',
      (select max(seq) from public.daily_puzzles)
    );
  end if;
end
$$;

alter table public.daily_puzzles
  alter column seq set not null;

-- Index for "solving now" — partial, only covers !complete games.
create index games_active_idx on public.games(updated_at desc)
  where is_complete = false;

-- Index for percentile / rank queries on a given city/date.
create index daily_results_city_idx
  on public.daily_results(date, city, elapsed_seconds);
