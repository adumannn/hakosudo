# Main page (signed-in) redesign

**Date:** 2026-05-09
**Scope:** `app/page.tsx` signed-in branch (lines 211–323) and the components it composes.
**Out of scope:** Signed-out landing, copy on other pages, new data fetches.

## Problem

The signed-in `/` page feels blank and uncomfortable on desktop. The container is `max-w-[1480px]` with `lg:px-24` padding, but every primary section (TodayCard, YearScroll, the bottom 2-col grid) is constrained to `max-w-[640px]` and left-aligned. The result is a tall single column hugging the left edge of a wide page, with a large empty zone on the right.

Secondary problem: a few helper sentences ("the ledger fills as solvers finish today's box.", "your name lands when you finish.") add words without information.

## Goal

Recompose the signed-in main page into a balanced, full-width editorial layout where the empty right zone gets a *purpose* — a tight "you today" stat panel beside the hero. Use the new layout's discipline to drop redundant copy.

Numerical comfort: at 1440px width, no primary section should be visually orphaned in a column < 80% of the available content width.

## Layout

Three horizontal bands inside the existing `max-w-[1480px]` container:

### Band 1 — Hero (2-col)

```text
┌────────────────────────────────────┬─────────────────────┐
│                                    │  YOU TODAY          │
│         TodayCard                  │  ─────────          │
│   (kanji seal + meaning            │  streak    12 days  │
│    + sensei line + play btn)       │  year      247/365  │
│                                    │  today     —        │
│                                    │  rank      —        │
└────────────────────────────────────┴─────────────────────┘
   ~58% width                          ~42% width
```

**Left column (TodayCard):**
- Existing component, mostly unchanged.
- Remove the surrounding `max-w-[640px]` wrapper so the card fills its column.
- Drop the streak chip from inside TodayCard's CTA row (streak now lives only in the right panel).
- Keep the internal 3-col grid (`28px tategaki | 280-400px seal | 1fr text`).

**Right column (YOU TODAY panel — new):**
- Vertical stat list, separated from the hero by a thin `border-l border-sumi/15` rule.
- Eyebrow header: `YOU TODAY` (mono, uppercase, vermillion red — matching the existing `eyebrow.red` pattern).
- Four rows, each laid out as `[mono uppercase label]    [large mincho number]`, separated by `border-b border-sumi/12` hairlines:
  - `STREAK    {n} days` (or `0 days` if none)
  - `YEAR      {filled} / {total}` (already computed in `series.seals`)
  - `TODAY     {formatTime(elapsed)}` or `—` pre-stamp
  - `RANK      #{n} / {total}` or `—` pre-stamp
- Number color: `text-sumi`, with `text-vermillion` for `STREAK` value when streak ≥ 7 (small reward signal, no new icons).

### Band 2 — Year (full-width)

```text
┌──────────────────────────────────────────────────────────┐
│  YOUR YEAR                                  247 / 365    │
├──────────────────────────────────────────────────────────┤
│  jan   feb   mar   apr   ...                       dec   │
│  ▢▢▢▢▢ ▢▢▣▣▣▣▣▣▣▣ ▣▢▣▣▣▣▣▣ ▣▣▣▣▣▣▣▣ ...      ▢▢▢▢▢   │
└──────────────────────────────────────────────────────────┘
```

- Remove `max-w-[640px]` cap on the wrapper.
- Eyebrow row: `YOUR YEAR` left, `{filled} / {total}` right (already exists, just at full width).
- `YearScroll` component itself unchanged — `cellPx={28}`, `gapPx={4}`. Wider container means more weeks visible without horizontal scroll.

### Band 3 — Bottom strip (2-col, same proportions as hero)

```text
┌─────────────────────────────────┬────────────────────────┐
│  GLOBAL PACE · TODAY            │  LEDGER · TODAY    →   │
│  ─────────                      │  ─────────             │
│  06:21    first solve · ada     │  01  ada    06:21      │
│  09:14    median                │  02  ren    07:48      │
│  1,247    solving now           │  03  yuki   08:02      │
└─────────────────────────────────┴────────────────────────┘
   ~58% width                       ~42% width
```

- Same column proportions as Band 1 for vertical rhythm consistency.
- Global pace: existing 3-stat layout, allowed to flex naturally without the width cap.
- Ledger preview: existing 3-row table + `see all →` link. Drop the two trailing helper sentences.

## Container

The outer wrapper stays:

```tsx
<main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
```

The 2-col bands use `grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]` so the proportion is consistent and easy to maintain. Vertical spacing between bands stays at `mt-10` to `mt-12` (matches existing rhythm).

`CityPicker` (only renders when `profileCity === null`) sits above Band 1, unchanged structurally — still `max-w-[640px]` is fine because it's a one-time onboarding banner.

## Copy trims

| Where | Old | New |
|-------|-----|-----|
| Ledger preview empty state | `— the ledger fills as solvers finish today's box.` | (removed; the empty preview rows + "see all →" link are self-evident) |
| Ledger preview footer | `↘ your name lands when you finish.` | (removed) |
| Global pace eyebrow | `global pace · today` | `GLOBAL PACE · TODAY` (consistent casing with `YOU TODAY`, `YOUR YEAR`) |
| Freeze prompt | `yesterday's seal — {kanji} — was missed. apply freeze (X of 2 left)` | `yesterday — {kanji} — missed.  apply freeze · X left` |

No other copy changes on this page in this pass.

## Responsive behavior

- **`lg` (≥ 1024px):** layout described above.
- **`< lg` (mobile + tablet):** single column. Stacking order:
  1. CityPicker (if present)
  2. TodayCard
  3. YOU TODAY panel — collapses to a 2×2 grid on `≥ md` (768px), single-column list on mobile
  4. YearScroll (native horizontal scroll)
  5. Global pace
  6. Ledger preview

The hero's `border-l` rule between columns is `lg:`-only — no separator on mobile (sections separate by margin).

## Components

### New
- **`YouTodayPanel`** — small server-renderable component (no interactivity) that takes `{ streak, yearFilled, yearTotal, todayElapsed: number | null, todayRank: { rank: number, total: number } | null }` and renders the 4-row stat list. Lives at `components/stats/YouTodayPanel.tsx` (the existing `components/stats/` folder is the right home — it sits next to `Heatmap.tsx`).

### Modified
- **`app/page.tsx`** — restructure the signed-in render block (lines 211–323). No new data fetches; `todayRank` comes from `computeTodayRank` over the existing `snapshotRows` and is `{ rank, total } | null`.
- **`components/year-scroll/TodayCard.tsx`** — remove the streak chip from the CTA row (the `{streakDays > 0 && ...}` span). The `streakDays` prop becomes optional/unused but keep the type for the component's other usages, if any.

### Unchanged
- `YearScroll`, `Seal`, `CityPicker`, `Masthead`, footer.

## Data

All data needed already exists in `app/page.tsx` after this design's changes:
- `streak` (already computed)
- `series.seals.filter(s => s.state === 'filled' || s.state === 'freeze').length` (already computed in eyebrow row)
- `series.seals.length` for total (already there)
- `completedTodayElapsed` (already fetched)
- Today's rank: derive from `rows` (`snapshotRows`) by finding `r.user_id === user.id` and using its index + 1; total = `rows.length`.

No new database calls.

## Testing

- Visual: at 1440×900, hero columns visibly fill the page (no large empty right zone). Year band runs at full width. Bottom strip uses ~58/42 proportions.
- Visual: at 768×1024 (tablet), single-column stack with YOU TODAY as a 2×2 grid.
- Visual: at 375×812 (mobile), single-column stack with YOU TODAY as a list.
- Pre-stamp state: TODAY and RANK show `—`. Post-stamp state: TODAY shows `formatTime(elapsed)`, RANK shows `#n / total`.
- Streak appears only in YOU TODAY panel, not duplicated in TodayCard's CTA row.
- Existing copy trims applied; no other text changes on this page.
- TodayCard, YearScroll, CityPicker, Masthead behave identically to before.

## Open follow-ups (out of scope, will be flagged separately)

- Copy trimming pass on other pages (the user mentioned descriptions across the app feel long).
- Avg-time and lifetime-stamps stats would enrich the YOU TODAY panel but require new data queries — defer until needed.
