-- supabase/migrations/0009_skins_not_null.sql
--
-- Self-contained: ensures a `default` skin exists, backfills any remaining
-- NULL skin_ids on daily_puzzles to it, then locks the column to NOT NULL.
--
-- Production runs scripts/seed-skins.ts between 0008 and this migration to
-- populate the full 7-skin catalog. This migration is the safety net for
-- preview environments and any daily rows that fall outside seasonal ranges.

-- 1. Ensure a default skin exists (no-op if seed already inserted it).
insert into public.skins (slug, kind, name, kanji_label, seal_kanji, palette_key, masthead, start_date, end_date, price_cents)
values ('default', 'premium', 'Default', '完', '完', 'default', 'Today''s box.', null, null, null)
on conflict (slug) do nothing;

-- 2. Backfill any NULL skin_id with the default skin.
update public.daily_puzzles dp
   set skin_id = s.id
  from public.skins s
 where s.slug = 'default'
   and dp.skin_id is null;

-- 3. Lock the column.
alter table public.daily_puzzles
  alter column skin_id set not null;
