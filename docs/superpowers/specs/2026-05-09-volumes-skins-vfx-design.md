# Volumes, skins, casual restoration & VFX/SFX — design

**Date:** 2026-05-09
**Status:** Approved for planning

## Goal

Expand Hako along three lines that share one piece of plumbing:

1. **Restore the difficulty picker** the user lost — make Casual a first-class home-page surface again.
2. **Give the year an editorial spine** — four seasonal *volumes* (春 夏 秋 冬), each themed at "medium" depth (palette + seal kanji + masthead phrase). The daily puzzle inherits the active volume's theme; the year-scroll reads as four chapters of stamps instead of one continuous strip.
3. **Add a small VFX/SFX layer** — a calligraphic ink effect on placement and a singular ~1.5 s solve ceremony. Brand promise: *Quiet*. Effects are weighted, not constant.

Volumes and skins are unified under one table so the same engine powers free seasonal theming and a paid skin store. This gives a real product-and-monetization story for the nFactorial pitch:

- **Free tier:** today's daily themed by the current season; casual mode at all difficulties; basic VFX/SFX.
- **Pro ($4/mo or $36/yr, unchanged):** unlocks the full skin library, every back issue, unlimited coach.
- **À la carte ($2–4 per skin):** permanent ownership of an individual skin, no subscription required.

## Non-goals (this round)

- **No twist game modes.** Killer/Jigsaw/Mini/X-sudoku — explicitly dropped.
- **No "heavy" theme depth.** No petals/snow ambient motion, no per-season sensei voice, no italic/font-swap masthead per skin.
- **No curator admin UI.** Skins are seeded via SQL/seed scripts; managing them is a developer task for now.
- **No dedicated past-volume archive UI.** Pro users can revisit past dailies through the existing daily flow (which now wears the past day's skin). A magazine-rack browser is later work.
- **No volume-completion certificates / printable PDFs.** Mentioned in /pro voice as "back issues" only.
- **No per-skin audio packs.** A future Pro extension; the `audio_pack` column is *not* added in this round.
- **No Stripe webhook completion.** Pre-existing TODO; manual SQL flip remains the fallback for both Pro and skin purchases. Webhook work is its own task.
- **No skin gifting flow.** The schema's `source = "gift"` value is reserved but no UI ships.
- **No conflict shake / sound feedback.** Excluded by the "Quiet" brand promise.
- **No per-keyboard-stroke sound.** Number-pad clicks make sound; physical keyboard input does not.
- **No mobile haptics.**
- **No A/B testing of skin pricing.** Single price per skin; tunable later.

## Architecture overview

Three concerns; one shared substrate (the skin engine) ties them together.

```
                  ┌──────────────────────────────────────┐
                  │  skins (table)                       │
                  │  • seasons (free, granted on signup) │
                  │  • premium (purchased or Pro)        │
                  │  • limited                           │
                  └─────┬────────────────────────────────┘
                        │ palette_key
                        ▼
       ┌──────────────────────────────┐         ┌──────────────────┐
       │  CSS [data-skin] tokens      │         │  TS skin registry│
       │  --bone --vermillion --moss  │◄────────┤  sealKanji,      │
       │  (in app/globals.css)        │         │  masthead phrase │
       └─────┬────────────────────────┘         └──────────────────┘
             │ resolved per surface
             ▼
   ┌─────────┴─────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Home page chrome │  │ /play/[difficulty]│  │ /play/daily      │
   │  user override OK │  │ user override OK │  │ locked to date's │
   └───────────────────┘  └──────────────────┘  │ skin_id, no swap │
                                                 └──────────────────┘
```

Key invariants:
- The daily puzzle for a given date *always* wears the skin of the season it was published in. Even revisited from years later, April 2026 still reads as Spring.
- The user's `active_skin_id` only overrides the *home page chrome* and the *casual play surface*. Daily play is canonical.
- Setting an override is a **Pro-only capability** — free users never see the picker control and always render with the current-date season skin. Free users therefore need no entitlement rows; the resolution path for them is purely date-based.
- `user_skin_entitlements` rows exist only for `kind = "premium"` and `kind = "limited"` skins acquired by purchase, gift, or Pro grant. They persist past Pro cancellation: a one-off purchase is owned forever.

## Data model

### Migration: `0008_volumes_and_skins.sql`

```sql
-- 1. The skins table — unified for seasons and premium/limited skins.
create table public.skins (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,             -- "spring-2026", "sumi-e"
  kind          text not null check (kind in ('season', 'premium', 'limited')),
  name          text not null,                    -- "Spring 2026", "Sumi-e"
  kanji_label   text not null,                    -- 春 / 墨
  seal_kanji    text not null,                    -- 桜 / 墨
  palette_key   text not null,                    -- "spring", "sumi" — maps to CSS
  masthead      text not null,                    -- "Today's bloom."
  start_date    date,                             -- season skins only
  end_date      date,                             -- season skins only (inclusive)
  price_cents   int,                              -- NULL for free; set for premium
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  -- Season skins must have a date range; non-seasons must not.
  constraint skins_dates_match_kind check (
    (kind = 'season' and start_date is not null and end_date is not null) or
    (kind <> 'season' and start_date is null and end_date is null)
  )
);

create unique index skins_season_date_idx
  on public.skins(start_date)
  where kind = 'season';

-- Note: this index ensures only one season starts on a given date but does
-- NOT prevent overlapping season ranges. Disjoint, contiguous seasons are
-- an editorial convention enforced by scripts/seed-skins.ts, not the DB.
-- If overlap occurs, resolveActiveSkin() returns the first match by date —
-- behavior is deterministic but the curator output is wrong. Validation
-- belongs in the seed script.

-- 2. Per-user entitlements (premium/limited; seasons are auto-granted at signup
-- so we still write rows for them — gives a single resolution path).
create table public.user_skin_entitlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skin_id     uuid not null references public.skins(id) on delete cascade,
  source      text not null check (source in ('season', 'pro', 'purchase', 'gift')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

create index user_skin_entitlements_user_idx
  on public.user_skin_entitlements(user_id);

-- 3. Daily puzzles wear a skin (one-to-one with the date).
alter table public.daily_puzzles
  add column skin_id uuid references public.skins(id);

-- 4. User-level skin override + sound preference.
alter table public.profiles
  add column active_skin_id uuid references public.skins(id),
  add column sfx_enabled boolean not null default false;

-- 5. Seed the launch skins (4 seasons + 2 premium + default fallback).
-- Actual seed handled by scripts/seed-skins.ts so it's idempotent and code-reviewed.

-- 6. Backfill: assign every existing daily_puzzles row a skin_id.
--    Strategy: scripts/seed-skins.ts must (a) read min/max dates from
--    daily_puzzles, (b) seed season skins covering that entire range —
--    not just 2026. Anything pre-system gets the default skin.
--    Two-stage backfill executed by the seed script:
--      -- 6a: assign by season range
--      update public.daily_puzzles dp
--         set skin_id = s.id
--        from public.skins s
--       where s.kind = 'season'
--         and dp.date between s.start_date and s.end_date
--         and dp.skin_id is null;
--      -- 6b: fallback — anything still NULL (e.g. dates outside any seasoned year)
--      --     receives the 'default' skin so SET NOT NULL succeeds.
--      update public.daily_puzzles dp
--         set skin_id = s.id
--        from public.skins s
--       where s.slug = 'default'
--         and dp.skin_id is null;
--    Followed by:
--      alter table public.daily_puzzles alter column skin_id set not null;

-- 7. (No entitlement backfill for season skins.) Free users have no
--    overrides, so granting them rows would be dead state. The seed script
--    only inserts entitlement rows for users who have purchased a premium
--    skin (none, at first launch). Pro grants are virtual via is_pro flag.
```

The migration finishes with `skin_id NOT NULL` on `daily_puzzles` only after the backfill completes — sequenced in the plan, not the migration itself.

### Entitlement resolution

Two distinct checks:

**`canApplyOverride(userId, skinId) -> boolean`** — used to gate the picker UI and validate `active_skin_id` writes:
1. If user `is_pro = true` → true (Pro can wear any active skin).
2. Else if `kind = "premium" or "limited"` and a `user_skin_entitlements` row exists → true (one-off purchase persists past cancellation).
3. Else → false (free users have no override capability; season skins are not "applied," they are the date-default).

**`canSeeInCatalog(userId, skinId) -> boolean`** — used to filter the `/skins` page:
- All `active = true` skins are visible to everyone. The catalog explains *availability* per row (free seasonal · in print now · included with Pro · purchase one-off).

Pro is the master gate for active-skin override. Per-row entitlements are the persistence of one-off purchases. A user who cancels Pro keeps every `source = "purchase"` skin and loses override rights for everything else.

### Active-skin resolution

`resolveActiveSkin({ userId, surface, dailyDate }) -> SkinResolved` returns `{ slug, paletteKey, sealKanji, masthead }`. Rules:

| Surface | Logic |
|---|---|
| `surface = "home"` or `"casual"` | `profiles.active_skin_id` if set and `canApplyOverride` → else current-date season skin → else default fallback |
| `surface = "daily"` (with `dailyDate`) | `daily_puzzles.skin_id` for that date — never overridden |
| Anything else | current-date season skin → else default fallback |

Implementation in `lib/skins/resolve.ts`. Pure function over inputs; the database lookups happen in two places: profile's `active_skin_id` (read once at layout level) and the daily's `skin_id` (joined into the daily query that already runs).

## UI surfaces

### Home page (signed-in) — `app/page.tsx`

Three additions; everything else stays.

- **Volume eyebrow** (small monospace, near the existing `dateLine()`):
  `vol. 03 · 春 2026 · in print`
- **Casual card** (sibling of `TodayCard`, below or beside it):
  Heading: *"Casual"*
  Sub: *"Pick a floor. Your streak rests on the daily — these don't move it."*
  Four kanji tiles `易 中 難 極` linking to `/play/easy|medium|hard|expert`. Mirrors the existing landing's difficulty section.
- **Pro skin chip** (Pro users only, in masthead area):
  *"wearing: 春 2026 [change]"* — opens a slim picker (modal or popover) of owned skins. Free users never see this control.

The TodayCard, year scroll, global pace, and ledger sections render unchanged — but the year scroll's seal kanji per cell now derives from each daily's `skin_id` (so the year visually splits into four chapters).

### Casual landing — `app/play/page.tsx` (new)

Mirrors the signed-out landing's "Or pick a difficulty" section as a standalone page. 4 cards (易/中/難/極) with kanji, name, average solve time, "begin" link. Footer line: *"Casual draws from the puzzle library — your streak stays with the daily."*

### Difficulty play — `app/play/[difficulty]/page.tsx` (existing, lightly revised)

Existing route. Wears the user's active skin (override or current-season default). Header reads `Casual · 〔difficulty〕`.

### Daily play — `app/play/daily/page.tsx` (existing, lightly revised)

Existing route. Wears the day's `skin_id`, never overridden. Header reads `Daily № 0472 · 春` instead of the current `Daily № 0472 · Hard`.

### Skin catalog — `app/skins/page.tsx` (new)

A magazine "back issues" rack:

- **Section 1: Seasonal volumes.** Past + current + a peek at upcoming (locked until its `start_date`). All free, all owned. Card actions: "wear this" (Pro override) or "wear during its season" caption (free user, current/future season).
- **Section 2: Premium editions.** Curated paid skins. Each card: kanji label, palette swatch, name, price, action button.
  - Not owned, not Pro: `Buy · $3` (one-off Stripe checkout).
  - Pro: `Included with Pro · Wear`.
  - Owned via past purchase: `Wear`.
- **Footer CTA:** *"or go Pro — $4/mo, every skin, every season, every back issue."*

### Pro page — `app/pro/page.tsx` (revised)

Honor existing voice (*"one tier · one price · no ladder"*). Replace the third bullet (currently "No ads, ever") with:

> 完 **The full skin library.**
> Every season skin, every premium edition. Yours while you're a member; one-off purchases stay yours forever.

The other two bullets (unlimited coach, Expert + back issues) stay. Pricing unchanged.

### Stripe checkout endpoints

- `POST /api/stripe/checkout` — existing Pro subscription flow. Unchanged.
- `POST /api/stripe/checkout/skin` — new. Body: `{ skin_id }`. Mode: `payment` (one-off). Success URL: `/skins?purchased=<slug>`. Inserts `user_skin_entitlements` row on completion (webhook ideal, manual SQL fallback inherits the same TODO state as Pro).

### Mobile

The Casual card on the home page stacks below TodayCard. The 4-tile picker becomes 2×2. The skin catalog is single-column. The Pro skin chip moves into the dropdown user menu (`AvatarDropdown` component) on small screens.

## Theme engine

Three layers, narrow scope.

### 1. CSS palette per `[data-skin]` — `app/globals.css`

Tokens that shift per skin: `--bone`, `--rice`, `--vermillion`, `--vermillion-deep`, `--moss`, `--moss-2` (6 vars).
Tokens that stay constant: `--sumi`, `--hazard`, `--seal`, font tokens, radius (always 0).

```css
[data-skin="default"] { /* current Hako tokens — fallback */ }
[data-skin="spring"]  { --bone: 30 35% 95%; --vermillion: 354 60% 53%; ... }
[data-skin="summer"]  { --bone: 60 22% 94%; --vermillion: 8 75% 50%; ... }
[data-skin="autumn"]  { --bone: 38 40% 92%; --vermillion: 18 70% 48%; ... }
[data-skin="winter"]  { --bone: 210 18% 95%; --vermillion: 0 65% 38%; ... }
[data-skin="sumi"]    { --vermillion: 0 0% 18%; ... }
[data-skin="indigo"]  { --vermillion: 220 45% 38%; ... }
```

(HSL values above are illustrative — final values picked during implementation.)

### 2. Static TS registry — `lib/skins/registry.ts`

Source of truth for the metadata that doesn't belong in CSS:

```ts
export const SKIN_REGISTRY = {
  "default":     { paletteKey: "default", sealKanji: "完", masthead: "Today's box." },
  "spring-2026": { paletteKey: "spring",  sealKanji: "桜", masthead: "Today's bloom." },
  "summer-2026": { paletteKey: "summer",  sealKanji: "蓮", masthead: "Today's pond." },
  "autumn-2026": { paletteKey: "autumn",  sealKanji: "楓", masthead: "Today's leaf." },
  "winter-2026": { paletteKey: "winter",  sealKanji: "雪", masthead: "Today's hush." },
  "sumi-e":      { paletteKey: "sumi",    sealKanji: "墨", masthead: "Today's stroke." },
  "indigo":      { paletteKey: "indigo",  sealKanji: "藍", masthead: "Today's depth." },
} as const;
```

Adding a skin = (a) DB row insert via seed script, (b) registry entry, (c) CSS palette block. All three ship in the same deploy.

### 3. Resolution and application

- `lib/skins/resolve.ts` — pure function with the rules above. Takes `(userId, surface, dailyDate?)` and returns `{ slug, paletteKey, sealKanji, masthead }`.
- `app/layout.tsx` — at the root, resolves once for the home/chrome surface and applies `data-skin={paletteKey}` to `<body>`. Pulls the `{ sealKanji, masthead }` into a React context (`SkinContext`) for descendants.
- `app/play/daily/page.tsx` — re-resolves with `surface = "daily"` and passes the resulting palette via a `<div data-skin>` wrapper around the GameShell.
- `app/play/[difficulty]/page.tsx` — uses the same root-level resolution; no override.

SSR-rendered → no FOUC.

### Year scroll — `components/year-scroll/YearScroll.tsx`

Existing component. Already accepts a `series` prop with per-day data. Add `sealKanji` to each day's shape (joined from `daily_puzzles.skin_id`). The component renders that kanji in each filled cell instead of the hardcoded 完. Unfilled cells render no kanji as today.

This is the moment the year visibly becomes four chapters of stamps.

## Monetization

Existing `/pro` Stripe subscription flow stays. The sole monetization additions:

1. **Pro perks updated copy** (no schema change, just /pro page revisions).
2. **One-off skin purchase endpoint** — `POST /api/stripe/checkout/skin`.
3. **Skin store page** — `/skins`.
4. **Catalog seed** — 4 seasonal skins (free, kind = "season") + 2 premium skins (kind = "premium", price set) at launch. Default skin is free, granted as a fallback to all users.

## VFX/SFX layer

Two events get effects. Everything else stays silent.

### Event 1: Per-digit placement

Trigger: cell transitions from `0` → non-zero player value.

- **VFX (always on, respects `prefers-reduced-motion`):**
  - Digit fades in: `opacity 0→1, scale 1.4→1` over ~220ms, cubic-bezier ease-out.
  - Optional faint sumi pseudo-element bleeds out then fades — washi-paper ink-settling effect.
  - Implementation: a CSS class `.ink-place` added on placement, removed on `animationend`.
- **SFX (toggleable, default off):** *only* when input came from on-screen NumberPad — not keyboard. Short paper-fold "tok" tone, ~80ms, low volume.

Conflicts, erases, undo, hint, coach interactions stay silent.

### Event 2: Solve ceremony

Trigger: `isComplete` becomes true.

| t (ms) | Action |
|---|---|
| 0    | Timer freezes (existing). |
| 100  | Ink-wash overlay sweeps the board — vermillion gradient at low opacity, right-to-left, ~600ms. CSS keyframes. |
| 400  | WinModal mounts. The 完 (or active skin's seal kanji) animates: `scale(0) rotate(-30deg)` → `scale(1) rotate(7deg)` with bounce ease. |
| 400  | Wood-block thunk plays (~200ms) — physical seal-on-paper feel. |
| 600  | Sustained tone plays (~1.5s) — single low resolved note. |
| 1200 | Stats / time / rank fade in below the seal. |

Reduced-motion: ink-wash skipped; seal animates as fade-only; audio plays unchanged (audio is independent of motion preference).

### Implementation

- `lib/sfx/index.ts` (new) — `playSfx(name: "place" | "solve-thunk" | "solve-tone")`. Reads `profiles.sfx_enabled` (or local override). Preloads on game mount. Files in `public/sfx/`.
- `lib/vfx/SealStamp.tsx` (new) — small component encapsulating the 完 stamp animation; toggles a class on mount.
- `components/game/Cell.tsx` — adds `.ink-place` class on 0→digit transition; clears on animation end.
- `components/game/NumberPad.tsx` — calls `playSfx("place")` on tile click only.
- `components/game/WinModal.tsx` — orchestrates the solve ceremony (small state machine; existing modal component augmented).
- `app/account/page.tsx` (existing or new) — adds the *"Sound on solve and number-pad"* toggle. Persists to `profiles.sfx_enabled`.

### Audio assets

Three files in `public/sfx/`:
- `place.mp3` (~3KB, ~80ms paper tok)
- `solve-thunk.mp3` (~10KB, ~200ms wood-block impact)
- `solve-tone.mp3` (~30KB, ~1.5s sustained tone)

Asset *creation* is out of scope for this spec — sound design is a parallel deliverable. For first deploy, silent placeholder files are acceptable; the player code references file paths that resolve regardless of content.

### Accessibility

- All animations respect `prefers-reduced-motion: reduce`.
- Audio defaults to off; first-time users never hear unexpected sound.
- `aria-live="polite"` on the seal moment so screen readers announce the win.

## Hard dependencies

- Migration `0008_volumes_and_skins.sql` runs cleanly on a database with existing `daily_puzzles`, `profiles` data.
- Seed script `scripts/seed-skins.ts` (new) — idempotent insert of the 7 launch skins (4 seasons + 2 premium + default), backfill of `daily_puzzles.skin_id`, backfill of `user_skin_entitlements` for existing users' season skins. Must run *between* the migration's column-add and column-make-NOT-NULL steps.
- 3 placeholder audio files in `public/sfx/`.
- Stripe price IDs for premium skins exist in env vars (one per skin, e.g., `STRIPE_PRICE_ID_SKIN_SUMI`).

## Testing strategy (sketch)

Full plan lives in the implementation plan; this is the surface area the plan must cover.

- **Unit tests** for `lib/skins/resolve.ts` covering all four rows of the resolution table (override owned, override unowned, daily-locked, fallback).
- **Unit tests** for `canApplyOverride` — Pro shortcut allows any skin, free user blocked from all overrides, ex-Pro user retains purchased premium skins.
- **Migration test** — assert every pre-existing `daily_puzzles` row has non-null `skin_id` after backfill (mix of season-matched and default-fallback rows).
- **Component test** for `Cell.tsx` — `.ink-place` class added on 0→digit, removed on animation end, *not* added on digit→0.
- **Visual snapshot** of the home page rendered for each of the 4 season skins.
- **E2E (or manual scripted)** of the skin store purchase flow against Stripe test mode.

## Open questions / decisions to validate during implementation

- **Exact HSL values per palette.** The palette table above is illustrative; real values picked while implementing alongside the existing Hako visual language. Worth a designer pass.
- **Premium skin price points.** $3 is a placeholder; A/B test or designer-set later.
- **First Pro perk copy refresh.** "No ads, ever" → "The full skin library." Voice-check with the brand owner before shipping.
- **Whether the upcoming season teases on the catalog.** Default: yes, locked. Could be no — "next issue" is editorial overhead.
