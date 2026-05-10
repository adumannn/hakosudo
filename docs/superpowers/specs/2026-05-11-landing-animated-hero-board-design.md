# Animated hero board on the marketing landing

**Date:** 2026-05-11
**Status:** approved (design)

## Problem

The signed-out marketing landing at [components/landing/Landing.tsx:85-105](../../../components/landing/Landing.tsx) renders a static 9×9 sudoku "mid-solve preview" in the hero panel. It looks like a screenshot — given digits in sumi, ~17 cells labelled as "player" but mostly empty. It does not convey what the product does: a daily sudoku that resolves into the `完` seal.

We want the hero board to act out the win moment: time-lapse the last batch of placements, then stamp the seal off-axis. One dramatic beat, then rest.

## Approach

A small client component, `AnimatedHeroBoard`, owns the board markup, the cell-by-cell ink-fill state, the seal entrance, and the bottom counter strip ("placed · to-go"). It replaces the current `HeroBoard()` function in `Landing.tsx` and keeps `Landing.tsx` itself a server component.

Cycle is **"loop with a beat"**: animation plays once on first scroll-into-view, holds on the completed-with-seal state, replays only when the board re-enters the viewport after leaving it.

### Why a client component over CSS-only animation

The cycle needs to (a) start when the board is visible, (b) tick a counter in sync with the cell placements, (c) reset on re-entry. CSS-only `animation-delay` chains can stagger the cells but cannot drive the counter or gate on visibility. A `setTimeout` chain in React keeps all of it in one place.

### Why reuse existing ink-place styles

The actual game already has `.hako-cell.ink-place` (ink-bleed + digit scale-in) wired into [app/globals.css:254-271](../../../app/globals.css). Reusing it keeps the marketing demo visually consistent with the real product — what the page shows is what the player will see.

## Aesthetic direction

- **Pace:** medium — 250ms between placements. Confident, not glacial.
- **Order:** hand-tuned `FILL_QUEUE` that jumps between 3×3 boxes the way constraint propagation does. Not row-scan.
- **Seal:** vermillion `完`, ~88px, rotated 8°, lands center-right-ish over the grid. Single entrance, no pulse.
- **No chrome:** no cursor, no hint UI, no sound — the page principle is "quiet."

## Architecture

### New file: `components/landing/AnimatedHeroBoard.tsx`

Client component (`"use client"`). Exports a default `AnimatedHeroBoard` component. Owns:

- Frozen puzzle data (`GIVENS`, `START_PLACED`, `FILL_QUEUE`) — see Data section.
- Animation state: `placedCount` (number, 0 to `FILL_QUEUE.length`) and `sealVisible` (boolean).
- An `IntersectionObserver` (threshold 0.3) that triggers a play cycle on entry when state is at-rest. On exit during a play cycle, the cycle continues to completion (do not abort mid-fill — choppy).
- `prefers-reduced-motion` check via `window.matchMedia` — if reduced, set `placedCount = FILL_QUEUE.length` and `sealVisible = true` immediately, skip the timeout chain.
- Cleanup: cancel any pending `setTimeout` on unmount.

### Modified: `components/landing/Landing.tsx`

- Remove the local `HeroBoard()` function and the three top-level constants `HERO_BOARD`, `HERO_PLAYER`, and the bottom counter strip at [components/landing/Landing.tsx:263-272](../../../components/landing/Landing.tsx).
- Import and render `<AnimatedHeroBoard />` in their place.
- The `seqLabel` and `dateLabelEn` / `dateLabelJp` props stay where they are — they're the eyebrow text, not part of the board.

### Modified: `app/globals.css`

Add one new keyframe at the bottom of the `@layer components` block, near the existing `hako-ink-*` family:

```css
.hako-seal-stamp {
  animation: hako-seal-stamp 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes hako-seal-stamp {
  from {
    opacity: 0;
    transform: rotate(2deg) scale(1.35);
  }
  to {
    opacity: 1;
    transform: rotate(8deg) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hako-seal-stamp { animation: none; }
}
```

## Data

All three constants live in `AnimatedHeroBoard.tsx` (not a separate file — they're internal to one component, and pulling them out adds indirection without payoff).

### `GIVENS: ReadonlyArray<ReadonlyArray<number | null>>`

A 9×9 grid. 32 non-null entries (the sumi/black "given" digits, immutable across the animation). The remaining 49 are `null`.

### `START_PLACED: ReadonlyMap<string, number>`

Keys are `"r,c"`, values are the digit. 13 entries — the cells already placed in vermillion when the cycle starts. Visually present from t=0.

### `FILL_QUEUE: ReadonlyArray<{ r: number; c: number; value: number }>`

36 entries — the cells animated in. Order is hand-picked to feel like real solving (jump between boxes, occasionally chain through a row, occasionally land a "key" cell that unblocks others). At completion, GIVENS ∪ START_PLACED ∪ FILL_QUEUE forms a valid sudoku solution.

Totals: 32 + 13 + 36 = 81. ✓

Cell rendering rule, by index `i` into `FILL_QUEUE`:
- If GIVENS[r][c] != null → render as `given` (sumi, no animation).
- Else if START_PLACED has (r,c) → render as `player` (vermillion, visible from t=0).
- Else if `i < placedCount` → render as `player` with `.ink-place` class applied **only on the tick it transitions** (CSS animation is single-shot).
- Else → render empty (text-transparent placeholder).

### Implementation note for `.ink-place` toggling

Cells get the `.ink-place` class only when they are the most recently placed cell — i.e. when their index in `FILL_QUEUE` equals `placedCount - 1`. As `placedCount` advances on the next tick, React diffs the className: the previous cell loses the class (its digit stays visible because `i < placedCount`) and the new cell gains it, restarting the keyframe. With a 250ms tick and a 420ms animation, this means the bleed visibly trails one cell behind the cursor — desired, not a bug.

For the final cell (index `FILL_QUEUE.length - 1`): the class stays applied through the rest state, but `animation-fill-mode: both` means it holds the end frame cleanly — no looping.

## Cycle timing

| t (ms) | Event |
| ---: | --- |
| 0 | Mount or replay: `placedCount = 0`, `sealVisible = false`. Givens + START_PLACED visible. |
| 250·n | nth cell placed (n runs 1..36). First cell at t=250, 36th cell at t=9000. |
| 9000 | Last cell placed. `placedCount = 36`. |
| 9500 | Seal becomes visible (~500ms after last digit settles). `.hako-seal-stamp` runs for 380ms. |
| 9880+ | Rest state. No further motion. |

If `prefers-reduced-motion`: skip directly to the t=9880 state on mount (full grid + seal, no transitions).

## Counter wiring

The bottom strip currently reads (static):

> seed **7b3c** · **21** placed   ·   conflicts **0** · **60** to go

"Placed" counts all filled cells (givens + player), matching the original static label's math (21 + 60 = 81).

In the animated version:
- `seed 7b3c` — stays static (decorative seed label).
- `placed` — `32 (givens) + 13 (START_PLACED) + placedCount` → `45 + placedCount`. Runs 45 → 81 over the cycle.
- `conflicts` — stays `0` (we never animate a conflict; the demo is a clean solve).
- `to go` — `36 - placedCount`. Runs 36 → 0 over the cycle.

Final values shown at rest: "**81** placed · conflicts **0** · **0** to go".

## Accessibility

- Outer wrapper `aria-hidden="true"`. The board is decorative; the hero's headline + body copy carries the meaning for AT users.
- `prefers-reduced-motion: reduce` → static end-state on mount, no transitions, no observer-triggered replay.
- No focusable elements inside the animated board.

## Performance

- One `IntersectionObserver` per mount, disconnected on unmount.
- One `setTimeout` chain (recursive `setTimeout`, not `setInterval`, so we never queue overlapping ticks).
- React re-renders 81 cells on each tick (every 250ms during the fill phase). Cheap — each cell is a single `div` with a class and a digit. Profiled mentally: well under 1ms/tick on a modern device.
- No layout thrash: the board uses CSS grid; only `color` and the `.ink-place` add-then-remove change per tick.

## What we are NOT doing

- No cursor or "ghost player" animation (rejected in brainstorming).
- No sound cues on the marketing page.
- No change to the signed-in `HomeHeroSection` (the animation is signed-out only).
- No change to the `Landing.tsx` sections below the hero — principles, difficulty, coach/win, achievements teasers, footer all unchanged.
- No new dependencies.

## Files touched

- `components/landing/AnimatedHeroBoard.tsx` — new.
- `components/landing/Landing.tsx` — remove local `HeroBoard` and counter strip; render `<AnimatedHeroBoard />` in their place.
- `app/globals.css` — add `.hako-seal-stamp` class + keyframe + reduced-motion override.

## Test plan

- Manual: load `/` while signed out, scroll into hero, watch the cycle play once. Scroll away to the achievements section and back; cycle replays. Refresh: plays once again.
- Manual: enable "Reduce motion" in macOS System Settings → Accessibility, reload `/`. The board renders in its final state (completed grid + seal) with no transitions.
- Manual: verify the signed-in `/` (logged in) is unaffected — the `HomeHeroSection` path doesn't touch `Landing.tsx`.
- No unit tests planned — the component is a self-contained presentational animation with no business logic worth asserting. If the timing chain needs to be regression-protected later, it can be extracted into a pure reducer and tested then.
