-- supabase/migrations/0010_challenge_skins.sql
--
-- Add a "challenge" source for user_skin_entitlements so the three
-- challenge-unlock skins (matsuri, koi, yurei) can grant entitlement rows
-- separately from Pro grants and one-off purchases.
--
-- Source semantics:
--   "season"    — auto-granted at signup for the current/upcoming season skin
--   "pro"       — virtual; covered by profiles.is_pro for premium skins
--   "purchase"  — Stripe one-off purchase, persists past Pro cancellation
--   "gift"      — reserved (no UI yet)
--   "challenge" — earned by completing an in-app challenge (NEW, this migration)
--
-- The auto-granting logic on challenge completion is a separate task; this
-- migration only widens the constraint so rows with source="challenge" can be
-- inserted manually until that lands.

alter table public.user_skin_entitlements
  drop constraint if exists user_skin_entitlements_source_check;

alter table public.user_skin_entitlements
  add constraint user_skin_entitlements_source_check
    check (source in ('season', 'pro', 'purchase', 'gift', 'challenge'));
