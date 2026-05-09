-- supabase/migrations/0009_skins_not_null.sql
--
-- Run AFTER scripts/seed-skins.ts completes successfully.
-- Locks the daily_puzzles.skin_id column so future inserts must specify it.

alter table public.daily_puzzles
  alter column skin_id set not null;
