# Navigation Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `loading.tsx` skeletons for every route + Suspense boundaries on the data-heavy pages, so navigations paint a route-shaped skeleton in <100 ms instead of staring at a blank screen during the server roundtrip.

**Architecture:** Two layers of progressive rendering. (1) Each route gets a `loading.tsx` that mirrors its real layout shape, so `<Link>` prefetch yields meaningful UI and clicks paint instantly. (2) Heavy pages factor their slow per-user data fetches into async server components wrapped in `<Suspense fallback={…}>`, so the synchronous chrome paints first and the slow tail streams in. No behavior change — same data, same end-state DOM, only paint ordering changes.

**Tech Stack:** Next 14 App Router, React 18 Suspense + `cache()`, Tailwind, TypeScript. Existing primitives: `<Masthead>`, Supabase server client, `unstable_cache`. New primitives: `<SkeletonBox>`, `<MastheadSkeleton>`.

**Spec:** [docs/superpowers/specs/2026-05-11-navigation-streaming-design.md](../specs/2026-05-11-navigation-streaming-design.md)

---

## File map

**New files (skeleton primitives):**
- `components/skeletons/SkeletonBox.tsx` — `<div>` primitive for placeholder blocks
- `components/skeletons/MastheadSkeleton.tsx` — chrome shell matching the real `<Masthead>` (default variant)

**New files (`loading.tsx`):**
- `app/loading.tsx` — `/`
- `app/play/loading.tsx` — `/play`
- `app/play/[difficulty]/loading.tsx` — `/play/easy|medium|hard|expert`
- `app/play/daily/loading.tsx` — `/play/daily`
- `app/year/loading.tsx`
- `app/leaderboard/loading.tsx`
- `app/profile/loading.tsx`
- `app/account/loading.tsx`
- `app/skins/loading.tsx`
- `app/pro/loading.tsx`
- `app/achievements/loading.tsx`

(`/auth/login` and `/auth/signup` are skipped per spec — no DB reads, render-fast already.)

**New files (async server components used as Suspense children):**
- `app/_home-year-data.ts` — shared `cache()`-deduped `fetchHomeYearData(userId, today, year)`
- `app/HomeHeroSection.tsx` — async, renders `<TodayCard>` + `<YouTodayPanel>` from year data
- `app/HomeYearSection.tsx` — async, renders the "your year" header + `<YearScroll>` from year data
- `app/year/YearStatsAndScroll.tsx` — async, renders the stats triplet + the year scroll
- `app/leaderboard/LeaderboardPanel.tsx` — async, renders city rail + ledger rows + sticky-you row
- `app/profile/ProfileBody.tsx` — async, renders streak block + heatmap + best + marks
- `app/achievements/AchievementsBody.tsx` — async, renders earned-count + AchievementsLedger

**Modified files:**
- `app/page.tsx` — sync chrome + 2 `<Suspense>` boundaries
- `app/year/page.tsx` — sync header + 1 `<Suspense>` boundary
- `app/leaderboard/page.tsx` — sync header + 1 `<Suspense>` boundary
- `app/profile/page.tsx` — sync left-rail header + 1 `<Suspense>` boundary
- `app/achievements/page.tsx` — sync header + 1 `<Suspense>` boundary

---

## Conventions used throughout

- **Skeletons are server components** — no hooks, no client JS. `aria-hidden="true"` on the wrapper.
- **Skeleton blocks are static** — no animation. Use `bg-sumi/[0.04]` (filled) or `border border-sumi/10` (outlined) at the size of the real content.
- **No layout shift** — every skeleton mirrors the real page's outer wrappers (`<main className="...">`, paddings, max-widths, grid columns) so swap-in is positionally identical.
- **Suspense fallbacks reuse the same JSX** as `loading.tsx` for the same area, so transitions skeleton → partial → full are visually continuous.
- **Async server components do their own data fetches inside.** They receive only serializable props (`userId`, `today`, `year`); the Supabase client is created inside.
- **Verification per task:** `npm run typecheck` after each file change. `npm run build` once after each Suspense-split task. Final manual smoke at the end.

---

## Task 1: Skeleton primitives

**Files:**
- Create: `components/skeletons/SkeletonBox.tsx`
- Create: `components/skeletons/MastheadSkeleton.tsx`

- [ ] **Step 1: Create the `SkeletonBox` primitive**

Write to `components/skeletons/SkeletonBox.tsx`:

```tsx
import type { CSSProperties } from "react";

interface SkeletonBoxProps {
  className?: string;
  style?: CSSProperties;
  /** Outlined variant uses a border instead of a fill (e.g. for grid cells). */
  outlined?: boolean;
}

/**
 * Static placeholder block. No animation — matches the paper-and-ink aesthetic.
 * Compose with explicit width/height utility classes so swap-in produces no layout shift.
 */
export function SkeletonBox({ className = "", style, outlined = false }: SkeletonBoxProps) {
  const base = outlined
    ? "border border-sumi/10"
    : "bg-sumi/[0.04] border border-sumi/10";
  return <div aria-hidden="true" className={`${base} ${className}`} style={style} />;
}
```

- [ ] **Step 2: Create the `MastheadSkeleton`**

Write to `components/skeletons/MastheadSkeleton.tsx`:

```tsx
import Link from "next/link";

/**
 * Mirrors the default-variant <Masthead> chrome shape. Server component, no client JS.
 * The Hako stamp + name remain real (instant render); nav links and avatar are placeholders.
 */
export function MastheadSkeleton() {
  return (
    <header className="masthead" aria-hidden="true">
      <div className="flex items-center gap-3 md:gap-7">
        <div className="md:hidden size-8 border border-sumi/15" />
        <Link href="/" aria-hidden={false} className="flex items-center gap-2.5">
          <div className="stamp">箱</div>
          <div className="name">Hako</div>
        </Link>
        <nav className="hidden md:flex gap-[22px]">
          {[36, 44, 40, 32, 44, 24].map((w, i) => (
            <span
              key={i}
              className="inline-block h-3 bg-sumi/[0.06]"
              style={{ width: w }}
            />
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-[16px] md:gap-[22px]">
        <div className="size-8 bg-sumi/[0.04] border border-sumi/10" />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/skeletons/SkeletonBox.tsx components/skeletons/MastheadSkeleton.tsx
git commit -m "feat(skeletons): add SkeletonBox + MastheadSkeleton primitives"
```

---

## Task 2: `loading.tsx` for `/account`

**Files:**
- Create: `app/account/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

Write to `app/account/loading.tsx`:

```tsx
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="max-w-[760px] mx-auto px-6 py-10 lg:py-14">
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-[42px] w-64 mt-3" />
        <div className="mt-8">
          <SkeletonBox className="h-[68px] w-full" />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/account/loading.tsx
git commit -m "feat(account): add loading.tsx skeleton"
```

---

## Task 3: `loading.tsx` for `/pro`

**Files:**
- Create: `app/pro/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

Write to `app/pro/loading.tsx`:

```tsx
import Link from "next/link";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/**
 * The Pro page renders on a dark seal background with its own minimal top bar.
 * Skeleton mirrors that top bar + the centered column layout.
 */
export default function Loading() {
  return (
    <main className="bg-seal text-bone min-h-screen relative">
      <div className="flex justify-between items-center px-8 py-5 border-b border-bone/10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-vermillion text-bone flex items-center justify-center mincho font-bold text-[14px]">
            箱
          </div>
          <div className="mincho font-semibold text-[16px]">Hako Pro</div>
        </Link>
        <Link
          href="/"
          className="mono text-[11px] tracking-[0.2em] text-bone/65 uppercase hover:text-bone"
        >
          close ×
        </Link>
      </div>
      <div className="max-w-[520px] mx-auto px-8 py-16 lg:py-24 text-center">
        <SkeletonBox className="h-3 w-44 mx-auto bg-bone/[0.08] border-bone/10" />
        <SkeletonBox className="h-[80px] w-full mt-4 bg-bone/[0.06] border-bone/10" />
        <SkeletonBox className="h-3 w-72 mx-auto mt-6 bg-bone/[0.06] border-bone/10" />
        <ul className="list-none p-0 mt-12 text-left space-y-6">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-5 items-start">
              <SkeletonBox className="size-12 shrink-0 bg-bone/[0.06] border-bone/10" />
              <div className="flex-1 space-y-2">
                <SkeletonBox className="h-4 w-1/2 bg-bone/[0.06] border-bone/10" />
                <SkeletonBox className="h-3 w-full bg-bone/[0.04] border-bone/10" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex items-baseline justify-center gap-3.5">
          <SkeletonBox className="h-12 w-20 bg-bone/[0.08] border-bone/10" />
          <SkeletonBox className="h-3 w-24 bg-bone/[0.06] border-bone/10" />
        </div>
        <SkeletonBox className="h-12 w-full mt-6 bg-bone/[0.08] border-bone/10" />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/pro/loading.tsx
git commit -m "feat(pro): add loading.tsx skeleton"
```

---

## Task 4: `loading.tsx` for `/play`

**Files:**
- Create: `app/play/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

The casual landing page is mostly static — the 4 tier tiles are real-rendered to give the user something familiar instantly while only the masthead avatar is a placeholder.

Write to `app/play/loading.tsx`:

```tsx
import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

const TIERS = [
  { k: "易", lvl: "i", name: "Easy", stats: "avg 4:12 · 38 givens", href: "/play/easy" },
  { k: "中", lvl: "ii", name: "Medium", stats: "avg 8:30 · 30 givens", href: "/play/medium" },
  { k: "難", lvl: "iii", name: "Hard", stats: "avg 14:50 · 26 givens", href: "/play/hard" },
  { k: "極", lvl: "iv", name: "Expert", stats: "23:00+ · 22 givens", href: "/play/expert", accent: true },
];

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="px-8 py-14 lg:px-16 lg:py-20 max-w-[1200px] mx-auto">
        <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">§ casual</div>
        <SkeletonBox className="h-[56px] w-72 mt-3.5" />
        <SkeletonBox className="h-3 w-full max-w-[40ch] mt-5" />
        <SkeletonBox className="h-3 w-3/4 max-w-[40ch] mt-2" />
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 border-[1.5px] border-sumi">
          {TIERS.map((t, i, arr) => (
            <Link
              key={t.k}
              href={t.href}
              className={
                "p-6 min-h-[200px] flex flex-col justify-between transition-opacity hover:opacity-90 " +
                (i < arr.length - 1 ? "border-r-[1.5px] border-sumi " : "") +
                (i < 2 ? "border-b-[1.5px] border-sumi lg:border-b-0 " : "") +
                (t.accent ? "bg-vermillion text-bone" : "bg-bone")
              }
            >
              <div className="flex justify-between items-start">
                <div className={"mincho font-semibold text-[54px] leading-none -tracking-[0.02em] " + (t.accent ? "text-bone" : "text-sumi")}>
                  {t.k}
                </div>
                <div className={"mono text-[10px] tracking-[0.22em] uppercase " + (t.accent ? "text-bone/70" : "text-moss")}>
                  {t.lvl}
                </div>
              </div>
              <div>
                <div className={"mincho font-semibold text-[22px] -tracking-[0.005em] " + (t.accent ? "text-bone" : "text-sumi")}>
                  {t.name}
                </div>
                <div className={"mono text-[10.5px] tracking-[0.14em] uppercase mt-2 leading-relaxed " + (t.accent ? "text-bone/70" : "text-moss")}>
                  {t.stats}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/play/loading.tsx
git commit -m "feat(play): add loading.tsx skeleton"
```

---

## Task 5: `loading.tsx` for `/skins`

**Files:**
- Create: `app/skins/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

Write to `app/skins/loading.tsx`:

```tsx
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

function CardSkeleton() {
  return (
    <div className="border border-sumi/15 p-5 space-y-3">
      <SkeletonBox className="h-[140px] w-full" />
      <SkeletonBox className="h-4 w-2/3" />
      <SkeletonBox className="h-3 w-full" />
      <SkeletonBox className="h-9 w-28 mt-2" />
    </div>
  );
}

function CardGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-bone">
      <MastheadSkeleton />
      <div className="max-w-[960px] mx-auto px-6 md:px-10 pt-10 pb-20">
        <header className="mb-12">
          <div className="eyebrow red">巻 · back issues &amp; editions</div>
          <SkeletonBox className="h-[64px] w-1/2 mt-2" />
          <div className="mt-3 space-y-2">
            <SkeletonBox className="h-3 w-full max-w-[560px]" />
            <SkeletonBox className="h-3 w-2/3 max-w-[560px]" />
          </div>
        </header>
        <section className="mb-16">
          <h2 className="mincho text-[20px] text-sumi mb-6">Seasonal volumes · 季</h2>
          <CardGrid count={6} />
        </section>
        <section className="mb-16">
          <h2 className="mincho text-[20px] text-sumi mb-6">Premium editions · 別</h2>
          <CardGrid count={3} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/skins/loading.tsx
git commit -m "feat(skins): add loading.tsx skeleton"
```

---

## Task 6: `loading.tsx` for game pages (`/play/[difficulty]` + `/play/daily`)

**Files:**
- Create: `app/play/[difficulty]/loading.tsx`
- Create: `app/play/daily/loading.tsx`
- Create: `components/skeletons/GameShellSkeleton.tsx` (shared)

The game pages render a `<GameShell>` with the `variant="game"` masthead and a sudoku board. The shared skeleton mirrors that layout.

- [ ] **Step 1: Create the shared `GameShellSkeleton`**

Write to `components/skeletons/GameShellSkeleton.tsx`:

```tsx
import Link from "next/link";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Mirrors the variant="game" Masthead + a 9x9 board placeholder + number-pad row. */
export function GameShellSkeleton() {
  return (
    <>
      <header className="masthead" aria-hidden="true">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="stamp">日</div>
            <div className="name">Daily</div>
          </Link>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <SkeletonBox className="h-6 w-16" />
          <SkeletonBox className="h-8 w-8 rounded-full" />
        </div>
      </header>
      <main className="px-4 py-6 max-w-[640px] mx-auto">
        <div
          aria-hidden="true"
          className="grid grid-cols-9 grid-rows-9 border-[2px] border-sumi"
          style={{ aspectRatio: "1 / 1" }}
        >
          {Array.from({ length: 81 }).map((_, i) => {
            const row = Math.floor(i / 9);
            const col = i % 9;
            const borderR = col % 3 === 2 && col !== 8 ? "border-r-2 border-r-sumi" : "border-r border-r-sumi/15";
            const borderB = row % 3 === 2 && row !== 8 ? "border-b-2 border-b-sumi" : "border-b border-b-sumi/15";
            return <div key={i} className={`${borderR} ${borderB}`} />;
          })}
        </div>
        <div className="mt-6 grid grid-cols-9 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonBox key={i} className="aspect-square" />
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Create `app/play/[difficulty]/loading.tsx`**

```tsx
import { GameShellSkeleton } from "@/components/skeletons/GameShellSkeleton";

export default function Loading() {
  return <GameShellSkeleton />;
}
```

- [ ] **Step 3: Create `app/play/daily/loading.tsx`**

```tsx
import { GameShellSkeleton } from "@/components/skeletons/GameShellSkeleton";

export default function Loading() {
  return <GameShellSkeleton />;
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/skeletons/GameShellSkeleton.tsx app/play/[difficulty]/loading.tsx app/play/daily/loading.tsx
git commit -m "feat(play): add loading.tsx skeletons for game pages"
```

---

## Task 7: `loading.tsx` for `/`

**Files:**
- Create: `components/skeletons/HomeHeroSkeleton.tsx` — used by both loading.tsx and (in Task 12) as the Suspense fallback
- Create: `components/skeletons/HomeYearSkeleton.tsx` — same dual purpose
- Create: `app/loading.tsx`

- [ ] **Step 1: Create `HomeHeroSkeleton`**

Write to `components/skeletons/HomeHeroSkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/**
 * Hero band placeholder: TodayCard (left, 1.4fr) + YouTodayPanel (right, 1fr).
 * Used by app/loading.tsx and as the Suspense fallback in app/page.tsx.
 */
export function HomeHeroSkeleton() {
  return (
    <section className="mt-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12 items-start">
      <SkeletonBox className="h-[320px] w-full" />
      <div className="mt-8 lg:mt-0">
        <SkeletonBox className="h-[260px] w-full" />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `HomeYearSkeleton`**

Write to `components/skeletons/HomeYearSkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/**
 * "your year" header + year-scroll body placeholder. Sized to match
 * a horizontal 365-cell scroll on home (cellPx default ~24, gapPx 4).
 */
export function HomeYearSkeleton() {
  return (
    <section className="mt-12">
      <div className="flex justify-between items-baseline mb-3">
        <div className="eyebrow">your year</div>
        <SkeletonBox className="h-3 w-16" />
      </div>
      <SkeletonBox className="h-[160px] w-full" />
    </section>
  );
}
```

- [ ] **Step 3: Create `app/loading.tsx`**

The skeleton matches the signed-in shape (per spec); a signed-out user briefly sees this before the Landing component replaces it.

```tsx
import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";
import { HomeHeroSkeleton } from "@/components/skeletons/HomeHeroSkeleton";
import { HomeYearSkeleton } from "@/components/skeletons/HomeYearSkeleton";

const CASUAL_TIERS = [
  { k: "易", href: "/play/easy" },
  { k: "中", href: "/play/medium" },
  { k: "難", href: "/play/hard" },
  { k: "極", href: "/play/expert", accent: true },
];

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow red">—</div>
        <SkeletonBox className="h-3 w-64 mt-1" />

        {/* Hero band — placeholder */}
        <HomeHeroSkeleton />

        {/* Casual band — render real (it's static) */}
        <section className="mt-12 max-w-[640px] border-t border-sumi/20 pt-6">
          <div className="flex items-baseline justify-between mb-3.5">
            <div className="eyebrow">§ casual</div>
            <Link href="/play" className="ital text-vermillion text-[14px] hover:underline">
              see all →
            </Link>
          </div>
          <p className="ital text-moss text-[14px] mb-4">
            — pick a floor. Your streak rests with the daily.
          </p>
          <div className="grid grid-cols-4 border-[1.5px] border-sumi">
            {CASUAL_TIERS.map((t, i, arr) => (
              <Link
                key={t.k}
                href={t.href}
                className={
                  "p-4 flex items-center justify-center mincho font-semibold text-[36px] -tracking-[0.02em] transition-opacity hover:opacity-80 " +
                  (i < arr.length - 1 ? "border-r-[1.5px] border-sumi " : "") +
                  (t.accent ? "bg-vermillion text-bone" : "bg-bone text-sumi")
                }
              >
                {t.k}
              </Link>
            ))}
          </div>
        </section>

        {/* Year — placeholder */}
        <HomeYearSkeleton />

        {/* Bottom strip — placeholder */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <SkeletonBox className="h-[80px] w-full" />
          <SkeletonBox className="h-[160px] w-full mt-8 lg:mt-0" />
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/skeletons/HomeHeroSkeleton.tsx components/skeletons/HomeYearSkeleton.tsx app/loading.tsx
git commit -m "feat(home): add loading.tsx skeleton + reusable hero/year skeletons"
```

---

## Task 8: `loading.tsx` for `/year`

**Files:**
- Create: `components/skeletons/YearStatsAndScrollSkeleton.tsx` — used by both loading.tsx and (in Task 13) as the Suspense fallback
- Create: `app/year/loading.tsx`

- [ ] **Step 1: Create `YearStatsAndScrollSkeleton`**

Write to `components/skeletons/YearStatsAndScrollSkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Stats triplet (stamped/streak/filled) + the year-scroll body. */
export function YearStatsAndScrollSkeleton() {
  return (
    <>
      <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-9 w-20 mt-1" />
          </div>
        ))}
      </dl>
      <section className="mt-10 lg:mt-14 relative">
        <SkeletonBox className="h-[420px] w-full" />
      </section>
    </>
  );
}
```

- [ ] **Step 2: Create `app/year/loading.tsx`**

```tsx
import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";
import { YearStatsAndScrollSkeleton } from "@/components/skeletons/YearStatsAndScrollSkeleton";
import { dateLine } from "@/lib/kanji";

export default function Loading() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const yearKanjiDigits = String(year)
    .split("")
    .map((d) => "〇一二三四五六七八九"[parseInt(d, 10)])
    .join("");

  return (
    <>
      <MastheadSkeleton />
      <main className="px-6 lg:px-16 py-10 lg:py-14 max-w-[1480px] mx-auto">
        <div className="flex items-baseline justify-between">
          <Link
            href="/"
            className="mono text-[11px] tracking-[0.22em] uppercase text-moss hover:text-vermillion"
          >
            ← back to today
          </Link>
          <div className="eyebrow red">{dateLine()}</div>
        </div>

        <header className="mt-8 lg:mt-12 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-8 lg:gap-12 items-end border-b border-sumi pb-8">
          <div className="hidden lg:flex flex-col items-center">
            <div className="tategaki mincho text-sumi text-[44px] leading-none">{yearKanjiDigits}</div>
            <div className="mono text-[10px] tracking-[0.22em] text-moss uppercase mt-3">{year}</div>
          </div>
          <div>
            <div className="eyebrow">the year scroll</div>
            <h1 className="kdate-jp text-[56px] lg:text-[80px] leading-[0.95] mt-2">
              年 — {year}
            </h1>
            <p className="ital text-moss text-[18px] mt-3 max-w-[44ch]">
              every day is a single carved character. the year fills in beneath your hand, one stamp at a time.
            </p>
          </div>
          <YearStatsAndScrollSkeletonStatsOnly />
        </header>

        <YearStatsAndScrollSkeletonScrollOnly />
      </main>
    </>
  );
}

/* The two halves of the skeleton are inlined here so the header stats
 * can sit inside the <header> grid while the scroll lives below it. */
function YearStatsAndScrollSkeletonStatsOnly() {
  return (
    <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <SkeletonBox className="h-3 w-16" />
          <SkeletonBox className="h-9 w-20 mt-1" />
        </div>
      ))}
    </dl>
  );
}

function YearStatsAndScrollSkeletonScrollOnly() {
  return (
    <section className="mt-10 lg:mt-14 relative">
      <SkeletonBox className="h-[420px] w-full" />
    </section>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/skeletons/YearStatsAndScrollSkeleton.tsx app/year/loading.tsx
git commit -m "feat(year): add loading.tsx skeleton + reusable stats+scroll skeleton"
```

---

## Task 9: `loading.tsx` for `/leaderboard`

**Files:**
- Create: `components/skeletons/LeaderboardPanelSkeleton.tsx` — used by loading.tsx + (in Task 14) Suspense fallback
- Create: `app/leaderboard/loading.tsx`

- [ ] **Step 1: Create `LeaderboardPanelSkeleton`**

Write to `components/skeletons/LeaderboardPanelSkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** City rail + ledger table (20 rows of placeholders). */
export function LeaderboardPanelSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] max-w-[1480px] mx-auto">
      <aside className="border-r border-sumi/15 lg:border-r-2 lg:border-r-sumi p-7 lg:p-9">
        <div className="eyebrow mb-3.5">solving in</div>
        <SkeletonBox className="h-9 w-32" />
        <div className="eyebrow mt-8 mb-3">cities</div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBox key={i} className="h-7 w-full" />
          ))}
        </div>
      </aside>
      <section className="p-7 lg:p-14">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-3.5">
          <div className="space-y-2">
            <SkeletonBox className="h-3 w-64" />
            <SkeletonBox className="h-10 w-72" />
          </div>
          <div className="flex gap-1.5">
            <SkeletonBox className="h-7 w-16" />
            <SkeletonBox className="h-7 w-16" />
            <SkeletonBox className="h-7 w-16" />
          </div>
        </div>
        <div className="mt-7 border-t-2 border-sumi">
          <div className="led-row hd">
            <div>rank</div>
            <div>solver</div>
            <div>time</div>
            <div>hints</div>
            <div className="col-hide-md">finished</div>
            <div className="col-hide-md"></div>
          </div>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="led-row">
              <SkeletonBox className="h-4 w-7" />
              <SkeletonBox className="h-4 w-32" />
              <SkeletonBox className="h-4 w-14" />
              <SkeletonBox className="h-4 w-7" />
              <SkeletonBox className="h-4 w-12 col-hide-md" />
              <div className="col-hide-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/leaderboard/loading.tsx`**

```tsx
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { LeaderboardPanelSkeleton } from "@/components/skeletons/LeaderboardPanelSkeleton";

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <LeaderboardPanelSkeleton />
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/skeletons/LeaderboardPanelSkeleton.tsx app/leaderboard/loading.tsx
git commit -m "feat(leaderboard): add loading.tsx skeleton + reusable panel skeleton"
```

---

## Task 10: `loading.tsx` for `/profile`

**Files:**
- Create: `components/skeletons/ProfileBodySkeleton.tsx` — used by loading.tsx + (in Task 15) Suspense fallback
- Create: `app/profile/loading.tsx`

- [ ] **Step 1: Create `ProfileBodySkeleton`**

Write to `components/skeletons/ProfileBodySkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Streak block (left rail) + heatmap + best-time grid + 12 marks (right column). */
export function ProfileBodySkeleton() {
  return (
    <>
      {/* Streak block — bottom of left rail */}
      <div className="pt-7 border-t border-sumi/18">
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-[112px] w-32 mt-2" />
        <SkeletonBox className="h-3 w-3/4 mt-3" />
      </div>

      {/* Right column blocks */}
      <div className="profile-body-right-col-skeleton-marker hidden" />
      <div className="space-y-12">
        <div>
          <div className="flex flex-col md:flex-row md:justify-between md:items-baseline gap-2 mb-[18px]">
            <SkeletonBox className="h-7 w-64" />
            <SkeletonBox className="h-3 w-40" />
          </div>
          <SkeletonBox className="h-[140px] w-full" />
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-[18px] gap-6">
            <SkeletonBox className="h-7 w-48" />
            <SkeletonBox className="h-3 w-32" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-sumi/18">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={
                  "py-5 px-5 border-b border-sumi/12 " +
                  (i === 0 ? "pl-0 " : "") +
                  (i < 3 ? "border-r border-sumi/10 " : "")
                }
              >
                <SkeletonBox className="h-7 w-10" />
                <SkeletonBox className="h-7 w-20 mt-5" />
                <SkeletonBox className="h-3 w-24 mt-1.5" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-[18px] gap-6">
            <SkeletonBox className="h-7 w-56" />
            <SkeletonBox className="h-3 w-40" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2.5">
                <SkeletonBox className="w-[54px] h-[54px]" />
                <SkeletonBox className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `app/profile/loading.tsx`**

```tsx
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";
import { ProfileBodySkeleton } from "@/components/skeletons/ProfileBodySkeleton";

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main>
        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] border-b-[1.5px] border-sumi bg-bone">
          {/* Left rail */}
          <div className="bg-rice border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi p-10 lg:px-12 lg:py-14 flex flex-col gap-9">
            <div>
              <SkeletonBox className="h-3 w-32" />
              <SkeletonBox className="w-20 h-20 mt-3.5 mb-[18px]" />
              <SkeletonBox className="h-10 w-40" />
              <SkeletonBox className="h-3 w-48 mt-2.5" />
              <SkeletonBox className="h-4 w-2/3 mt-[18px]" />
            </div>
            {/* Streak block + body share fallback shape between loading.tsx and Suspense fallback */}
            <ProfileBodySkeletonLeftRailOnly />
            <div className="mt-auto pt-6 border-t border-sumi/18">
              <SkeletonBox className="h-12 w-full" />
            </div>
          </div>
          {/* Right column */}
          <div className="p-8 lg:p-12 flex flex-col gap-12">
            <ProfileBodySkeletonRightColOnly />
          </div>
        </section>
      </main>
    </>
  );
}

/* Visually, ProfileBodySkeleton is rendered split across two grid cells.
 * In Task 15 (Suspense split), the same shape is rendered as one block
 * inside a wrapper that participates in the same grid; loading.tsx
 * inlines the two halves to occupy both rail and column directly. */
function ProfileBodySkeletonLeftRailOnly() {
  return (
    <div className="pt-7 border-t border-sumi/18">
      <SkeletonBox className="h-3 w-24" />
      <SkeletonBox className="h-[112px] w-32 mt-2" />
      <SkeletonBox className="h-3 w-3/4 mt-3" />
    </div>
  );
}

function ProfileBodySkeletonRightColOnly() {
  return (
    <>
      <div>
        <div className="flex flex-col md:flex-row md:justify-between md:items-baseline gap-2 mb-[18px]">
          <SkeletonBox className="h-7 w-64" />
          <SkeletonBox className="h-3 w-40" />
        </div>
        <SkeletonBox className="h-[140px] w-full" />
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-[18px] gap-6">
          <SkeletonBox className="h-7 w-48" />
          <SkeletonBox className="h-3 w-32" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-sumi/18">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                "py-5 px-5 border-b border-sumi/12 " +
                (i === 0 ? "pl-0 " : "") +
                (i < 3 ? "border-r border-sumi/10 " : "")
              }
            >
              <SkeletonBox className="h-7 w-10" />
              <SkeletonBox className="h-7 w-20 mt-5" />
              <SkeletonBox className="h-3 w-24 mt-1.5" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-[18px] gap-6">
          <SkeletonBox className="h-7 w-56" />
          <SkeletonBox className="h-3 w-40" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2.5">
              <SkeletonBox className="w-[54px] h-[54px]" />
              <SkeletonBox className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/skeletons/ProfileBodySkeleton.tsx app/profile/loading.tsx
git commit -m "feat(profile): add loading.tsx skeleton + reusable body skeleton"
```

---

## Task 11: `loading.tsx` for `/achievements`

**Files:**
- Create: `components/skeletons/AchievementsBodySkeleton.tsx` — used by loading.tsx + (in Task 16) Suspense fallback
- Create: `app/achievements/loading.tsx`

- [ ] **Step 1: Create `AchievementsBodySkeleton`**

Write to `components/skeletons/AchievementsBodySkeleton.tsx`:

```tsx
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Earned-count number + 12-mark ledger grid. */
export function AchievementsBodySkeleton() {
  return (
    <div className="mt-9">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <SkeletonBox className="w-[64px] h-[64px]" />
            <SkeletonBox className="h-4 w-32" />
            <SkeletonBox className="h-3 w-full" />
            <SkeletonBox className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/achievements/loading.tsx`**

```tsx
import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";
import { AchievementsBodySkeleton } from "@/components/skeletons/AchievementsBodySkeleton";

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="px-7 lg:px-14 py-12 lg:py-16 max-w-[1480px] mx-auto">
        <Link
          href="/profile"
          className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss hover:text-sumi"
        >
          ← back to profile
        </Link>
        <div className="mt-6 flex justify-between items-end gap-6 border-b-[1.5px] border-sumi pb-[18px]">
          <div>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">§ achievements</div>
            <SkeletonBox className="h-[42px] w-72 mt-2" />
          </div>
          <SkeletonBox className="h-7 w-28" />
        </div>
        <SkeletonBox className="h-3 w-full max-w-[60ch] mt-6" />
        <SkeletonBox className="h-3 w-2/3 max-w-[60ch] mt-2" />
        <AchievementsBodySkeleton />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/skeletons/AchievementsBodySkeleton.tsx app/achievements/loading.tsx
git commit -m "feat(achievements): add loading.tsx skeleton + reusable body skeleton"
```

---

## Task 12: Suspense split on `/`

**Goal:** Move the per-user year queries off `app/page.tsx`'s blocking path. The casual band and bottom strip render immediately; hero band and year section stream in.

**Files:**
- Create: `app/_home-year-data.ts` — shared, `cache()`-deduped fetch
- Create: `app/HomeHeroSection.tsx` — async, renders TodayCard + YouTodayPanel
- Create: `app/HomeYearSection.tsx` — async, renders the "your year" header + YearScroll
- Modify: `app/page.tsx` — drop the year-queries block; wrap hero + year in `<Suspense>`

- [ ] **Step 1: Create the shared year-data fetcher**

Write to `app/_home-year-data.ts`:

```ts
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { computeAllotment } from "@/lib/seal/freeze";
import { assembleYearSeries } from "@/lib/seal/year";
import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
import type { YearSeries } from "@/lib/seal/types";

export interface HomeYearData {
  series: YearSeries;
  streak: number;
  yearFilled: number;
  yearTotal: number;
  completedTodayElapsed: number | undefined;
  freezePrompt: { date: string; kanji: string; remaining: number } | null;
  profileCity: string | null;
}

/**
 * Per-user year-range queries shared by HomeHeroSection and HomeYearSection.
 * Deduped within a single request via React's cache(), so the two Suspense
 * children don't double-fetch.
 */
export const fetchHomeYearData = cache(async (
  userId: string,
  today: string,
  year: number,
): Promise<HomeYearData> => {
  const sb = createServerClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: cal },
    { data: results },
    { data: freezes },
    { data: profile },
    { data: dailyMeta },
  ] = await Promise.all([
    sb
      .from("daily_seal_calendar")
      .select("date,kanji,romaji,meaning")
      .gte("date", yearStart).lte("date", yearEnd)
      .order("date", { ascending: true }),
    sb.from("daily_results").select("date,elapsed_seconds")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("streak_freezes").select("date")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("profiles").select("created_at,is_pro,city").eq("id", userId).maybeSingle(),
    sb.from("daily_puzzles")
      .select("date, skin_id, skins(seal_kanji)")
      .gte("date", yearStart).lte("date", yearEnd),
  ]);

  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozenDates = new Set<string>(((freezes ?? []) as { date: string }[]).map((f) => f.date));
  type DailyMetaRow = { date: string; skin_id: string; skins: { seal_kanji: string } | null };
  const sealKanjiByDate = new Map<string, string>();
  for (const r of (dailyMeta ?? []) as unknown as DailyMetaRow[]) {
    sealKanjiByDate.set(r.date, r.skins?.seal_kanji ?? "完");
  }
  const signupDate = profile?.created_at
    ? new Date(profile.created_at).toISOString().slice(0, 10)
    : yearStart;
  const series = assembleYearSeries({
    today,
    calendar: fillCalendarYear(year, (cal ?? []) as CalendarEntry[]),
    completedByDate,
    frozenDates,
    signupDate,
    sealKanjiByDate,
  });
  const streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozenDates);
  const yearFilled = series.seals.filter(
    (s) => s.state === "filled" || s.state === "freeze",
  ).length;
  const yearTotal = series.seals.length;
  const completedTodayElapsed = completedByDate.get(today);

  let freezePrompt: { date: string; kanji: string; remaining: number } | null = null;
  if (profile?.is_pro) {
    const yest = new Date(today + "T00:00:00Z");
    yest.setUTCDate(yest.getUTCDate() - 1);
    const yestStr = yest.toISOString().slice(0, 10);
    const yestEntry = series.seals.find((s) => s.date === yestStr);
    if (yestEntry?.state === "empty") {
      const granted = `${yestStr.slice(0, 7)}-01`;
      const { count } = await sb
        .from("streak_freezes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("granted_month", granted);
      const used = count ?? 0;
      const allotment = computeAllotment(profile.created_at, granted);
      const remaining = Math.max(0, allotment - used);
      if (remaining > 0) freezePrompt = { date: yestStr, kanji: yestEntry.kanji, remaining };
    }
  }

  return {
    series,
    streak,
    yearFilled,
    yearTotal,
    completedTodayElapsed,
    freezePrompt,
    profileCity: profile?.city ?? null,
  };
});
```

- [ ] **Step 2: Create `HomeHeroSection`**

Write to `app/HomeHeroSection.tsx`:

```tsx
import { TodayCard } from "@/components/year-scroll/TodayCard";
import { YouTodayPanel } from "@/components/stats/YouTodayPanel";
import { weekdayJp } from "@/lib/kanji";
import { fetchHomeYearData } from "./_home-year-data";

interface HomeHeroSectionProps {
  userId: string;
  today: string;
  year: number;
  todaySeal: {
    date: string;
    kanji: string;
    romaji: string;
    meaning: string;
    senseiLine: string | null;
    sealKanji: string;
  } | null;
  todayRank: number | null;
}

export async function HomeHeroSection({
  userId,
  today,
  year,
  todaySeal,
  todayRank,
}: HomeHeroSectionProps) {
  const data = await fetchHomeYearData(userId, today, year);
  return (
    <section className="mt-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12 items-start">
      <TodayCard
        today={todaySeal}
        completedElapsed={data.completedTodayElapsed}
        freezePrompt={data.freezePrompt}
        tategakiDay={weekdayJp()}
      />
      <div className="mt-8 lg:mt-0">
        <YouTodayPanel
          streak={data.streak}
          yearFilled={data.yearFilled}
          yearTotal={data.yearTotal}
          todayElapsed={data.completedTodayElapsed ?? null}
          todayRank={todayRank}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `HomeYearSection`**

Write to `app/HomeYearSection.tsx`:

```tsx
import { YearScroll } from "@/components/year-scroll/YearScroll";
import { fetchHomeYearData } from "./_home-year-data";

interface HomeYearSectionProps {
  userId: string;
  today: string;
  year: number;
}

export async function HomeYearSection({ userId, today, year }: HomeYearSectionProps) {
  const data = await fetchHomeYearData(userId, today, year);
  return (
    <section className="mt-12">
      <div className="flex justify-between items-baseline mb-3">
        <div className="eyebrow">your year</div>
        <div className="mono text-[11px] tracking-[0.14em] text-moss">
          {data.yearFilled}
          {" / "}
          {data.yearTotal}
        </div>
      </div>
      <YearScroll series={data.series} />
    </section>
  );
}
```

- [ ] **Step 4: Update `app/page.tsx` to use Suspense + remove the inline year-queries block**

Read the current file first if needed: `app/page.tsx`. Replace the signed-in branch (everything after `if (!user) { … return <Landing/>; }`) with the streaming version below.

The new signed-in branch:

```tsx
  // signed-in path
  const initial = user.email?.[0] ?? "·";

  // CityPicker / popularCities still need profileCity, which now lives inside
  // fetchHomeYearData. Since CityPicker is rendered above the Suspense, fetch
  // a thin profile read here just for `profileCity` (the same row is fetched
  // again inside fetchHomeYearData; that's fine — Supabase caches per-request
  // are not free, but profileCity is already part of the year-data shape and
  // the dedup is at most one extra row read).
  // To avoid the extra read, we instead fetch profileCity through the same
  // cache() function so the call here and the one inside HomeHero/Year all
  // share one query group. See note below.

  // The simplest approach: fetch profileCity outside the Suspense, await it
  // synchronously here, since CityPicker is above the boundary. This adds
  // one cheap profiles row read above the fold.
  const sb = createServerClient();
  const { data: profileForCity } = await sb
    .from("profiles")
    .select("city")
    .eq("id", user.id)
    .maybeSingle();
  const profileCity: string | null = profileForCity?.city ?? null;

  // Popular city list for the home banner picker (signed-in only).
  let popularCities: { city: string; count: number }[] = [];
  let citySuggestion: string | null = null;
  if (profileCity === null) {
    popularCities = computeCityCounts({
      rows: snapshotRaw.rows.map((r) => ({ city: r.city })),
      userCity: null,
    });
    citySuggestion = getCity();
  }

  const todayRank = computeTodayRank({
    rows: snapshotRaw.rows.map((r) => ({
      user_id: r.user_id,
      elapsed_seconds: r.elapsed_seconds,
    })),
    userId: user.id,
  });

  const preview = snapshotRaw.rows.slice(0, 3).map((r, i) => ({
    rank: (i + 1).toString().padStart(2, "0"),
    name: r.username,
    time: formatTime(r.elapsed_seconds),
    first: i === 0,
  }));

  return (
    <>
      <Masthead
        active="today"
        initial={initial}
        email={user.email ?? null}
        rightChip={<SkinChip />}
      />

      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow red">{dateLine()}</div>
        <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-1">
          vol · <strong className="text-vermillion font-medium">{skin.kanjiLabel}</strong>{" "}
          {skin.slug.replace(/-/g, " ")} · in print
        </div>

        {profileCity === null && (
          <div className="mt-6 max-w-[640px]">
            <CityPicker
              variant="banner"
              current={null}
              suggestion={citySuggestion}
              popular={popularCities}
            />
          </div>
        )}

        {/* ── Band 1 · Hero ───────────────────────────────────────── */}
        <Suspense fallback={<HomeHeroSkeleton />}>
          <HomeHeroSection
            userId={user.id}
            today={today}
            year={year}
            todaySeal={todaySeal}
            todayRank={todayRank}
          />
        </Suspense>

        {/* ── Band 1.5 · Casual ──────────────────────────────────── */}
        <section className="mt-12 max-w-[640px] border-t border-sumi/20 pt-6">
          <div className="flex items-baseline justify-between mb-3.5">
            <div className="eyebrow">§ casual</div>
            <Link href="/play" className="ital text-vermillion text-[14px] hover:underline">
              see all →
            </Link>
          </div>
          <p className="ital text-moss text-[14px] mb-4">
            — pick a floor. Your streak rests with the daily.
          </p>
          <div className="grid grid-cols-4 border-[1.5px] border-sumi">
            {[
              { k: "易", href: "/play/easy" },
              { k: "中", href: "/play/medium" },
              { k: "難", href: "/play/hard" },
              { k: "極", href: "/play/expert", accent: true },
            ].map((t, i, arr) => (
              <Link
                key={t.k}
                href={t.href}
                className={
                  "p-4 flex items-center justify-center mincho font-semibold text-[36px] -tracking-[0.02em] transition-opacity hover:opacity-80 " +
                  (i < arr.length - 1 ? "border-r-[1.5px] border-sumi " : "") +
                  (t.accent ? "bg-vermillion text-bone" : "bg-bone text-sumi")
                }
              >
                {t.k}
              </Link>
            ))}
          </div>
        </section>

        {/* ── Band 2 · Year ───────────────────────────────────────── */}
        <Suspense fallback={<HomeYearSkeleton />}>
          <HomeYearSection userId={user.id} today={today} year={year} />
        </Suspense>

        {/* ── Band 3 · Bottom strip ───────────────────────────────── */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <div>
            <p className="mono text-[10px] tracking-[0.22em] uppercase text-moss">
              global pace · today
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.firstSolve ? formatTime(snapshot.firstSolve.elapsedSeconds) : "—"}
                </div>
                <div className="txt-small">
                  {snapshot.firstSolve
                    ? `first solve · ${snapshot.firstSolve.username}${
                        snapshot.firstSolve.city ? ", " + snapshot.firstSolve.city : ""
                      }`
                    : "awaiting first solve"}
                </div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.median != null ? formatTime(snapshot.median) : "—"}
                </div>
                <div className="txt-small">global median</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.solvingNow.toLocaleString()}
                </div>
                <div className="txt-small">solving now</div>
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            <div className="flex justify-between items-baseline mb-3.5">
              <div className="eyebrow">ledger · today</div>
              <Link href="/leaderboard" className="ital text-vermillion text-[14px] hover:underline">
                see all →
              </Link>
            </div>
            {preview.length === 0 ? (
              <div className="border-t-2 border-sumi">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="grid grid-cols-[28px_1fr_auto] gap-3.5 py-2.5 border-b border-sumi/12"
                  >
                    <div className="kdate-jp text-[13px] text-moss/40">
                      {n.toString().padStart(2, "0")}
                    </div>
                    <div className="text-[14px] text-moss/40">—</div>
                    <div className="mincho text-[15px] font-semibold tnum text-moss/40">—</div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {preview.map((row) => (
                  <div
                    key={row.rank}
                    className="grid grid-cols-[28px_1fr_auto] gap-3.5 py-2.5 border-b border-sumi/12"
                  >
                    <div className={"kdate-jp text-[13px] " + (row.first ? "text-vermillion" : "text-moss")}>
                      {row.rank}
                    </div>
                    <div className="text-[14px]">{row.name}</div>
                    <div className="mincho text-[15px] font-semibold tnum">{row.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
```

Update the imports at the top of `app/page.tsx`:

```tsx
import { Suspense } from "react";
// remove these:
// import { TodayCard } from "@/components/year-scroll/TodayCard";
// import { YearScroll } from "@/components/year-scroll/YearScroll";
// import { computeUnifiedStreak } from "@/lib/seal/streak";
// import { computeAllotment } from "@/lib/seal/freeze";
// import { assembleYearSeries } from "@/lib/seal/year";
// import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
// import type { YearSeries } from "@/lib/seal/types";
// import { weekdayJp } from "@/lib/kanji";
// import { YouTodayPanel } from "@/components/stats/YouTodayPanel";

// add these:
import { HomeHeroSection } from "./HomeHeroSection";
import { HomeYearSection } from "./HomeYearSection";
import { HomeHeroSkeleton } from "@/components/skeletons/HomeHeroSkeleton";
import { HomeYearSkeleton } from "@/components/skeletons/HomeYearSkeleton";
```

Keep imports actually used by the remaining sync code: `dateLine`, `weekdayJp` (still used in landing date labels), `formatTime`, `computeDailySnapshot`, `computeCityCounts`, `getCity`, `computeTodayRank`. Verify with the editor's "unused import" warnings.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. If there are unused-import warnings, remove them.

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: succeeds with no warnings about Suspense boundaries.

- [ ] **Step 7: Manual smoke**

Start dev: `npm run dev`. Visit `/` while signed in. The hero band and year scroll should briefly show their skeleton fallbacks while the casual band and bottom strip render immediately. Final DOM matches `main` branch behavior.

- [ ] **Step 8: Commit**

```bash
git add app/_home-year-data.ts app/HomeHeroSection.tsx app/HomeYearSection.tsx app/page.tsx
git commit -m "feat(home): stream hero + year sections via Suspense"
```

---

## Task 13: Suspense split on `/year`

**Files:**
- Create: `app/year/YearStatsAndScroll.tsx`
- Modify: `app/year/page.tsx`

- [ ] **Step 1: Create `YearStatsAndScroll`**

Write to `app/year/YearStatsAndScroll.tsx`:

```tsx
import Link from "next/link";
import { YearScroll } from "@/components/year-scroll/YearScroll";
import { createServerClient } from "@/lib/supabase/server";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { assembleYearSeries } from "@/lib/seal/year";
import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
import type { YearSeries } from "@/lib/seal/types";

interface YearStatsAndScrollProps {
  userId: string;
  today: string;
  year: number;
}

export async function YearStatsAndScroll({ userId, today, year }: YearStatsAndScrollProps) {
  const sb = createServerClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: cal },
    { data: results },
    { data: freezes },
    { data: profile },
    { data: dailyMeta },
  ] = await Promise.all([
    sb
      .from("daily_seal_calendar")
      .select("date,kanji,romaji,meaning")
      .gte("date", yearStart).lte("date", yearEnd)
      .order("date", { ascending: true }),
    sb.from("daily_results").select("date,elapsed_seconds")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("streak_freezes").select("date")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    sb
      .from("daily_puzzles")
      .select("date, skin_id, skins(seal_kanji)")
      .gte("date", yearStart).lte("date", yearEnd),
  ]);

  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozenDates = new Set<string>(((freezes ?? []) as { date: string }[]).map((f) => f.date));
  type DailyMetaRow = { date: string; skin_id: string; skins: { seal_kanji: string } | null };
  const sealKanjiByDate = new Map<string, string>();
  for (const r of (dailyMeta ?? []) as unknown as DailyMetaRow[]) {
    sealKanjiByDate.set(r.date, r.skins?.seal_kanji ?? "完");
  }
  const signupDate = profile?.created_at
    ? new Date(profile.created_at).toISOString().slice(0, 10)
    : yearStart;

  const series: YearSeries = assembleYearSeries({
    today,
    calendar: fillCalendarYear(year, (cal ?? []) as CalendarEntry[]),
    completedByDate,
    frozenDates,
    signupDate,
    sealKanjiByDate,
  });
  const streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozenDates);
  const filled = series.seals.filter((s) => s.state === "filled").length;
  const frozen = series.seals.filter((s) => s.state === "freeze").length;
  const total = series.seals.length;
  const stamped = filled + frozen;
  const percent = total > 0 ? Math.round((stamped / total) * 100) : 0;

  return (
    <>
      <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
        <div>
          <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">stamped</dt>
          <dd className="kdate-jp text-[36px] tnum leading-none mt-1">
            {stamped}
            <span className="text-moss text-[16px] font-normal"> / {total}</span>
          </dd>
        </div>
        <div>
          <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">streak</dt>
          <dd className="kdate-jp text-[36px] tnum leading-none mt-1 text-vermillion">
            {streak}<span className="text-[16px]">d</span>
          </dd>
        </div>
        <div>
          <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">filled</dt>
          <dd className="kdate-jp text-[36px] tnum leading-none mt-1">
            {percent}<span className="text-[16px]">%</span>
          </dd>
        </div>
      </dl>

      <section className="mt-10 lg:mt-14 relative">
        <div
          aria-hidden
          className="watermark-kanji"
          style={{ fontSize: "320px", right: "-40px", top: "-60px" }}
        >
          年
        </div>
        <YearScroll series={series} cellPx={40} gapPx={5} sealSize="md" showWeekdayRail />
        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 mono text-[10px] tracking-[0.22em] uppercase text-moss">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-sumi/[0.32] bg-sumi/[0.03]" />
            stamped
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-[1.5px] border-vermillion/70" />
            today
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-dashed border-sumi/[0.16]" />
            missed
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-dashed border-vermillion/40 bg-sumi/[0.03]" />
            frozen
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 border border-sumi/[0.07]" />
            future
          </span>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Update `app/year/page.tsx`**

Replace the existing async file with the streaming version:

```tsx
// app/year/page.tsx
import Link from "next/link";
import { Suspense } from "react";
import { Masthead } from "@/components/Masthead";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { dateLine } from "@/lib/kanji";
import { YearStatsAndScroll } from "./YearStatsAndScroll";
import { YearStatsAndScrollSkeleton } from "@/components/skeletons/YearStatsAndScrollSkeleton";

export const dynamic = "force-dynamic";

export default async function YearPage() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  const initial = user?.email?.[0] ?? "·";
  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);
  const yearKanjiDigits = String(year)
    .split("")
    .map((d) => "〇一二三四五六七八九"[parseInt(d, 10)])
    .join("");

  return (
    <>
      <Masthead active="today" initial={initial} email={user?.email ?? null} />

      <main className="px-6 lg:px-16 py-10 lg:py-14 max-w-[1480px] mx-auto">
        <div className="flex items-baseline justify-between">
          <Link
            href="/"
            className="mono text-[11px] tracking-[0.22em] uppercase text-moss hover:text-vermillion"
          >
            ← back to today
          </Link>
          <div className="eyebrow red">{dateLine()}</div>
        </div>

        <header className="mt-8 lg:mt-12 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-8 lg:gap-12 items-end border-b border-sumi pb-8">
          <div className="hidden lg:flex flex-col items-center">
            <div className="tategaki mincho text-sumi text-[44px] leading-none">{yearKanjiDigits}</div>
            <div className="mono text-[10px] tracking-[0.22em] text-moss uppercase mt-3">{year}</div>
          </div>

          <div>
            <div className="eyebrow">the year scroll</div>
            <h1 className="kdate-jp text-[56px] lg:text-[80px] leading-[0.95] mt-2">
              年 — {year}
            </h1>
            <p className="ital text-moss text-[18px] mt-3 max-w-[44ch]">
              every day is a single carved character. the year fills in beneath your hand, one stamp at a time.
            </p>
          </div>

          {/* Stats sit inside the header grid; the scroll lives below.
              Both depend on the same per-user year-range queries, so the
              Suspense wraps them as a single async section. The fallback
              renders the stats placeholder shape into the same grid cell. */}
          {user ? (
            <Suspense fallback={<YearStatsAndScrollSkeleton />}>
              <YearStatsAndScroll userId={user.id} today={today} year={year} />
            </Suspense>
          ) : (
            <div />
          )}
        </header>

        {!user && (
          <section className="mt-14 border-t border-b border-sumi py-16 text-center">
            <p className="ital text-moss text-[20px]">
              sign in to see your year scroll.
            </p>
            <Link
              href="/auth/signin"
              className="inline-block mt-6 bg-sumi text-bone px-7 py-3.5 mono text-[12px] tracking-[0.18em] uppercase hover:bg-sumi/95"
            >
              sign in
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
```

> **Note on layout:** the existing page nests the stats `<dl>` inside the header grid AND the scroll outside. The new `YearStatsAndScroll` returns both children from a fragment; React renders them at the location of the `<Suspense>` boundary. Verify visually that the stats land in the third grid cell (`auto`) and the scroll lands below the header — if the grid placement breaks, split into two Suspense boundaries (one for stats inside the grid, one for the scroll below) using the helper components defined in `YearStatsAndScrollSkeleton.tsx`.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual smoke**

Visit `/year` while signed in. The header (title, date, intro paragraph) renders immediately. The stats triplet and year scroll briefly show the skeleton fallback, then resolve.

If the stats land outside the header grid (visually below the description paragraph), split the Suspense into two as noted in Step 2.

- [ ] **Step 6: Commit**

```bash
git add app/year/YearStatsAndScroll.tsx app/year/page.tsx
git commit -m "feat(year): stream stats + scroll via Suspense"
```

---

## Task 14: Suspense split on `/leaderboard`

**Files:**
- Create: `app/leaderboard/LeaderboardPanel.tsx`
- Modify: `app/leaderboard/page.tsx`

- [ ] **Step 1: Create `LeaderboardPanel`**

Write to `app/leaderboard/LeaderboardPanel.tsx`:

```tsx
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { computeCityCounts, computeUserStanding } from "@/lib/stats/leaderboard";

type Range = "today" | "7d" | "all";

interface Row {
  user_id: string;
  elapsed_seconds: number;
  city: string | null;
  created_at: string;
  hints_used?: number | null;
  profiles: { username: string | null } | null;
}

interface LeaderboardPanelProps {
  userId: string | null;
  username: string | null;
  date: string;
  cityFilter: string | null;
  cityFilterRaw: string | null;
  range: Range;
}

export async function LeaderboardPanel({
  userId,
  username,
  date,
  cityFilter,
  cityFilterRaw,
  range,
}: LeaderboardPanelProps) {
  const sb = createServerClient();

  // Fan out the queries the panel needs.
  const [profileRes, dailyMetaRes, allTodayRes] = await Promise.all([
    userId
      ? sb.from("profiles").select("city").eq("id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("daily_puzzles").select("seq,difficulty").eq("date", date).maybeSingle(),
    sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,city,created_at,hints_used,profiles(username)")
      .eq("date", date)
      .order("elapsed_seconds", { ascending: true }),
  ]);

  const userProfileCity = (profileRes.data as { city: string | null } | null)?.city ?? null;
  const dailyMeta = dailyMetaRes.data as { seq: number | null; difficulty: string | null } | null;
  const seq = dailyMeta?.seq ?? null;
  const difficulty = dailyMeta?.difficulty ?? "—";
  const allRowsToday = ((allTodayRes.data ?? []) as unknown as Row[]) ?? [];

  let tableRowsAll: Row[] = [];
  if (range === "today") {
    tableRowsAll = allRowsToday;
  } else {
    const fromDate = (() => {
      if (range === "all") return null;
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 6);
      return d.toISOString().slice(0, 10);
    })();
    let bestQ = sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,city,created_at,hints_used,profiles(username)");
    if (fromDate) bestQ = bestQ.gte("date", fromDate).lte("date", date);
    bestQ = bestQ.order("elapsed_seconds", { ascending: true });
    let allRows: Row[] = [];
    try {
      const { data } = await bestQ;
      allRows = (data ?? []) as unknown as Row[];
    } catch {
      allRows = [];
    }
    const seen = new Set<string>();
    const dedup: Row[] = [];
    for (const r of allRows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      dedup.push(r);
    }
    tableRowsAll = dedup;
  }

  const cityCounts = computeCityCounts({
    rows: allRowsToday.map((r) => ({ city: r.city })),
    userCity: userProfileCity,
  });
  const totalAllCities = allRowsToday.length;

  const tableRowsFiltered = cityFilter
    ? tableRowsAll.filter(
        (r) => r.city && r.city.trim().toLowerCase() === cityFilter,
      )
    : tableRowsAll;
  const tableRows = tableRowsFiltered.slice(0, 20);

  const userRow = userId
    ? allRowsToday.find((r) => r.user_id === userId) ?? null
    : null;
  const userCity = userRow?.city ? userRow.city.trim().toLowerCase() : null;
  const userCityRows = userCity
    ? allRowsToday.filter((r) => r.city && r.city.trim().toLowerCase() === userCity)
    : [];
  const standing = computeUserStanding({
    userRow: userRow
      ? { elapsed_seconds: userRow.elapsed_seconds, city: userRow.city }
      : null,
    cityResults: userCityRows.map((r) => ({ elapsed_seconds: r.elapsed_seconds })),
  });

  const cityLabel = cityFilter ?? "global";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] max-w-[1480px] mx-auto">
      {/* CITY RAIL */}
      <aside className="border-r border-sumi/15 lg:border-r-2 lg:border-r-sumi p-7 lg:p-9">
        <div className="eyebrow mb-3.5">solving in</div>
        <h3 className="h-disp text-[36px] tracking-[-0.02em]">
          {cityLabel}
          <span className="text-vermillion">.</span>
        </h3>
        <div className="eyebrow mt-8 mb-3">cities</div>
        <div>
          {cityCounts.length === 0 ? (
            <p className="ital text-moss text-[14px]">— no city activity yet today.</p>
          ) : (
            cityCounts.map((c) => (
              <Link
                key={c.city}
                href={{ pathname: "/leaderboard", query: { city: c.city, range } }}
                className={cn("city-row", c.city === cityFilter && "on")}
              >
                <span className="city-name">{c.city}</span>
                <span className="ct">{c.count.toLocaleString()}</span>
              </Link>
            ))
          )}
        </div>
        <div className="eyebrow mt-8 mb-3">global</div>
        <Link
          href={{ pathname: "/leaderboard", query: { range } }}
          className={cn("city-row", !cityFilter && "on")}
        >
          <span className="city-name">All cities</span>
          <span className="ct">{totalAllCities.toLocaleString()}</span>
        </Link>
        <div className="mt-8 border-t border-sumi pt-4">
          <p className="ital text-moss text-[14px]">
            — set your city in profile to land on the right ledger.
          </p>
        </div>
      </aside>

      {/* LEDGER */}
      <section className="p-7 lg:p-14">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-3.5">
          <div>
            <div className="eyebrow red">
              {seq != null
                ? `daily № ${seq.toString().padStart(4, "0")} · ${date} · ${difficulty}`
                : `${date} · ${difficulty}`}
              {range !== "today" && ` · ${range === "7d" ? "7-day" : "all-time"} best`}
            </div>
            <h2 className="h-disp text-[42px] mt-1.5">
              {range === "today"
                ? `Today in ${cityLabel}.`
                : range === "7d"
                ? `7 days in ${cityLabel}.`
                : `All-time in ${cityLabel}.`}
            </h2>
          </div>
          <div className="flex gap-1.5">
            <RangePill k="today" active={range === "today"} city={cityFilterRaw} />
            <RangePill k="7d" label="7-day" active={range === "7d"} city={cityFilterRaw} />
            <RangePill k="all" label="All-time" active={range === "all"} city={cityFilterRaw} />
          </div>
        </div>

        <div className="mt-7 border-t-2 border-sumi">
          <div className="led-row hd">
            <div>rank</div>
            <div>solver</div>
            <div>time</div>
            <div>hints</div>
            <div className="col-hide-md">finished</div>
            <div className="col-hide-md"></div>
          </div>
          {tableRows.length === 0 ? (
            <p className="ital text-moss text-[14px] py-6 px-1">
              — the ledger fills as solvers finish today&rsquo;s box.
            </p>
          ) : (
            tableRows.map((r, i) => (
              <LedgerRow
                key={`${r.user_id}-${i}`}
                rank={(i + 1).toString().padStart(2, "0")}
                name={r.profiles?.username ?? "anon"}
                city={r.city}
                time={formatTime(r.elapsed_seconds)}
                hints={r.hints_used ?? null}
                finished={new Date(r.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
                first={i === 0}
              />
            ))
          )}
        </div>

        {username && standing && (
          <div className="led-row you mt-1.5 bg-vermillion text-bone">
            <div className="kdate-jp text-[18px] font-bold">
              {standing.rankInCity.toString().padStart(2, "0")}
            </div>
            <div>
              <span className="kdate-jp text-[16px] font-bold">{username}</span>
              <span className="mono text-[9.5px] tracking-[0.18em] uppercase opacity-70 ml-2">
                you
              </span>
            </div>
            <div className="kdate-jp text-[18px] font-bold tnum">
              {formatTime(standing.time)}
            </div>
            <div>—</div>
            <div className="text-[12.5px] col-hide-md" />
            <div className="ital col-hide-md">
              faster than {standing.percentile}%
              {standing.city ? ` in ${standing.city}` : ""} today
            </div>
          </div>
        )}
        {username && !standing && (
          <p className="ital text-moss text-[14px] mt-4">
            — finish today&rsquo;s box to land on the ledger.
          </p>
        )}
      </section>
    </div>
  );
}

function RangePill({
  k,
  label,
  active,
  city,
}: {
  k: Range;
  label?: string;
  active: boolean;
  city: string | null;
}) {
  const query: Record<string, string> = { range: k };
  if (city) query.city = city;
  return (
    <Link
      href={{ pathname: "/leaderboard", query }}
      className={cn("kpill", active ? "red" : "outline")}
    >
      {label ?? k.charAt(0).toUpperCase() + k.slice(1)}
    </Link>
  );
}

function LedgerRow({
  rank,
  name,
  city,
  time,
  hints,
  finished,
  first,
}: {
  rank: string;
  name: string;
  city: string | null;
  time: string;
  hints: number | null;
  finished: string;
  first: boolean;
}) {
  return (
    <div className={cn("led-row", first && "top1")}>
      <div className={cn("kdate-jp font-semibold tnum", first ? "text-vermillion text-[18px] font-bold" : "text-[16px]")}>{rank}</div>
      <div>
        <span className={cn("kdate-jp", first ? "text-[16px] font-semibold" : "text-[15px]")}>{name}</span>
        {city && <span className="txt-small ml-2">/ {city.trim().toLowerCase()}</span>}
      </div>
      <div className={cn("kdate-jp font-semibold tnum", first ? "text-[18px]" : "text-[16px]")}>{time}</div>
      <div className="text-[14px]">{hints && hints > 0 ? hints : "—"}</div>
      <div className="txt-small col-hide-md">{finished}</div>
      <div className="col-hide-md">
        {first && <span className="kpill red text-[10px]">完 first</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/leaderboard/page.tsx`**

Replace the file with the streaming version (the heavy work is now inside `LeaderboardPanel`):

```tsx
// app/leaderboard/page.tsx
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { Masthead } from "@/components/Masthead";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { LeaderboardPanelSkeleton } from "@/components/skeletons/LeaderboardPanelSkeleton";

export const dynamic = "force-dynamic";

type Range = "today" | "7d" | "all";

export default async function Leaderboard({
  searchParams,
}: {
  searchParams: { city?: string; date?: string; range?: Range };
}) {
  const sb = createServerClient();
  const date = searchParams.date ?? todayUTC();
  const cityFilterRaw = searchParams.city ?? null;
  const cityFilter = cityFilterRaw ? cityFilterRaw.trim().toLowerCase() : null;
  const range: Range = searchParams.range ?? "today";

  const {
    data: { user },
  } = await sb.auth.getUser();
  const username = user?.email?.split("@")[0] ?? null;
  const initial = user?.email?.[0] ?? "·";

  return (
    <>
      <Masthead active="ledger" initial={initial} email={user?.email ?? null} />
      <Suspense fallback={<LeaderboardPanelSkeleton />}>
        <LeaderboardPanel
          userId={user?.id ?? null}
          username={username}
          date={date}
          cityFilter={cityFilter}
          cityFilterRaw={cityFilterRaw}
          range={range}
        />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual smoke**

Visit `/leaderboard`. The masthead renders immediately. The full panel (sidebar + ledger) shows the skeleton, then resolves with real data. Try `?range=7d` and `?city=tokyo` query params — both should still work end-to-end.

- [ ] **Step 6: Commit**

```bash
git add app/leaderboard/LeaderboardPanel.tsx app/leaderboard/page.tsx
git commit -m "feat(leaderboard): stream ledger panel via Suspense"
```

---

## Task 15: Suspense split on `/profile`

**Files:**
- Create: `app/profile/ProfileBody.tsx`
- Modify: `app/profile/page.tsx`

The trick on `/profile` is that the visible layout is a 2-column grid where the streak block lives at the bottom of the **left rail** and the heatmap/best/marks live in the **right column**. The async section returns both halves, so we mount it in a wrapper that participates in the parent grid.

Approach: render the left-rail header (avatar/name/etc.) and CTA synchronously; wrap the streak block (left rail bottom) and the right column (entirely) in **two Suspense boundaries** that each call the same `cache()`-deduped fetch. This preserves the grid layout exactly.

- [ ] **Step 1: Create the shared profile-data fetcher (inline in `ProfileBody.tsx`)**

Actually for simplicity we use one Suspense that wraps a fragment, and place the fragment so the left-rail streak + right-col blocks both land inside their respective grid cells. This requires structuring the page's grid such that the streak block and right column are siblings of a single Suspense parent — which they aren't today.

The pragmatic resolution: **two Suspense boundaries** sharing a `cache()`-deduped fetch. One for the streak block in the left rail; one for the right column.

Write to `app/profile/_profile-data.ts`:

```ts
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { computeUserHeatmap } from "@/lib/stats/heatmap";
import { computeStatuses, ACHIEVEMENTS, type GameRow } from "@/lib/achievements";

export interface ProfileData {
  today: string;
  daysOnHako: number;
  streak: number;
  streakStart: string | null;
  dailiesKept: number;
  missed: number;
  lastOpenedTime: string | null;
  diffStats: Record<string, { best: number; count: number; bestGame: GameRow | undefined }>;
  heatmap: ReturnType<typeof computeUserHeatmap>;
  statuses: ReturnType<typeof computeStatuses>;
  earnedCount: number;
  rareCount: number;
  lastEarned: { glyph: string; when: string } | null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function formatSince(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

function streakStartDate(
  today: string,
  completed: Set<string>,
  frozen: Set<string>,
): string | null {
  const present = (d: string) => completed.has(d) || frozen.has(d);
  let cursor = today;
  if (!present(cursor)) {
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  if (!present(cursor)) return null;
  let last = cursor;
  while (present(cursor)) {
    last = cursor;
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return last;
}

export const fetchProfileData = cache(async (userId: string, userCreatedAt: string | null): Promise<ProfileData> => {
  const sb = createServerClient();
  const today = todayUTC();
  const windowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 181);
    return d.toISOString().slice(0, 10);
  })();
  const recentWindowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 730);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: games },
    { data: dailyResults },
    { data: streakFreezes },
    { data: heatmapResults },
    { data: heatmapMedians },
  ] = await Promise.all([
    sb
      .from("games")
      .select("difficulty,is_complete,elapsed_seconds,errors_made,hints_used,daily_date,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    sb.from("daily_results").select("date").eq("user_id", userId).gte("date", recentWindowStart).lte("date", today),
    sb.from("streak_freezes").select("date").eq("user_id", userId).gte("date", recentWindowStart).lte("date", today),
    sb.from("daily_results").select("date,elapsed_seconds").eq("user_id", userId).gte("date", windowStart).lte("date", today),
    sb.from("daily_results").select("date,elapsed_seconds").gte("date", windowStart).lte("date", today),
  ]);

  const all = (games ?? []) as GameRow[];
  const completed = all.filter((g) => g.is_complete);
  const byDiff = (d: string) => completed.filter((g) => g.difficulty === d);
  const best = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);

  const completedDates = new Set<string>(((dailyResults ?? []) as { date: string }[]).map((r) => r.date));
  const frozenDates = new Set<string>(((streakFreezes ?? []) as { date: string }[]).map((f) => f.date));
  const streak = computeUnifiedStreak(today, completedDates, frozenDates);

  const grouped = new Map<string, number[]>();
  for (const row of (heatmapMedians as { date: string; elapsed_seconds: number }[] | null) ?? []) {
    const arr = grouped.get(row.date) ?? [];
    arr.push(row.elapsed_seconds);
    grouped.set(row.date, arr);
  }
  const mediansByDate = new Map<string, number>();
  for (const [d, arr] of grouped) {
    arr.sort((a, b) => a - b);
    const mid = arr.length / 2;
    mediansByDate.set(
      d,
      Number.isInteger(mid)
        ? Math.round((arr[mid - 1] + arr[mid]) / 2)
        : arr[Math.floor(mid)],
    );
  }
  const heatmap = computeUserHeatmap({
    today,
    results: ((heatmapResults ?? []) as { date: string; elapsed_seconds: number }[]),
    freezes: frozenDates,
    mediansByDate,
  });

  const daysOnHako = userCreatedAt
    ? Math.max(
        0,
        Math.floor(
          (new Date(today + "T00:00:00Z").getTime() - new Date(userCreatedAt).getTime()) /
            86_400_000,
        ),
      )
    : 0;

  const streakStart = streakStartDate(today, completedDates, frozenDates);
  const dailiesKept = completedDates.size;
  const missed = Math.max(0, daysOnHako - dailiesKept - frozenDates.size);

  const newest = (games ?? [])[0];
  let lastOpenedTime: string | null = null;
  if (newest) {
    const d = new Date(newest.created_at);
    const iso = d.toISOString().slice(0, 10);
    if (iso === today) {
      const hh = d.getHours().toString().padStart(2, "0");
      const mm = d.getMinutes().toString().padStart(2, "0");
      lastOpenedTime = `${hh}:${mm}`;
    }
  }

  const diffsKeys = ["easy", "medium", "hard", "expert"];
  const diffStats: ProfileData["diffStats"] = {};
  for (const key of diffsKeys) {
    const xs = byDiff(key).map((g) => g.elapsed_seconds);
    const bestSec = best(xs);
    diffStats[key] = {
      best: bestSec,
      count: xs.length,
      bestGame: bestSec > 0 ? byDiff(key).find((g) => g.elapsed_seconds === bestSec) : undefined,
    };
  }

  const statuses = computeStatuses(all, { today, frozen: frozenDates });
  const earnedCount = statuses.filter((s) => s.earned).length;
  const rareCount = statuses.filter((s) => {
    const a = ACHIEVEMENTS.find((x) => x.key === s.key);
    return s.earned && a?.category === "special";
  }).length;
  const lastEarned = statuses
    .filter((s) => s.earned && s.earnedAt)
    .map((s) => {
      const a = ACHIEVEMENTS.find((x) => x.key === s.key)!;
      return { glyph: a.glyph, when: s.earnedAt! };
    })[0] ?? null;

  return {
    today,
    daysOnHako,
    streak,
    streakStart,
    dailiesKept,
    missed,
    lastOpenedTime,
    diffStats,
    heatmap,
    statuses,
    earnedCount,
    rareCount,
    lastEarned,
  };
});

export { formatSince };
```

- [ ] **Step 2: Create `ProfileStreakBlock.tsx` (left-rail bottom)**

Write to `app/profile/ProfileStreakBlock.tsx`:

```tsx
import { fetchProfileData, formatSince } from "./_profile-data";

export async function ProfileStreakBlock({
  userId,
  userCreatedAt,
}: {
  userId: string;
  userCreatedAt: string | null;
}) {
  const data = await fetchProfileData(userId, userCreatedAt);
  const streakSinceLabel = data.streakStart ? formatSince(data.streakStart) : null;
  return (
    <div className="pt-7 border-t border-sumi/18">
      <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-vermillion mb-2">
        streak — kept
      </div>
      <div
        className="mincho font-semibold text-vermillion -tracking-[0.03em] tnum"
        style={{ fontSize: 128, lineHeight: 0.88 }}
      >
        {data.streak}
        <span
          className="text-sumi font-medium"
          style={{ fontSize: "0.28em", marginLeft: "0.06em", verticalAlign: "0.7em" }}
        >
          日
        </span>
      </div>
      <span className="block ital text-[15px] text-moss mt-2 leading-snug">
        {streakSinceLabel && (
          <>
            since{" "}
            <strong className="mincho not-italic font-semibold text-sumi">
              {streakSinceLabel}
            </strong>
            .
            {data.dailiesKept > 0 && " "}
          </>
        )}
        {data.dailiesKept > 0 && (
          <>
            <strong className="mincho not-italic font-semibold text-sumi">{data.dailiesKept}</strong>{" "}
            of{" "}
            <strong className="mincho not-italic font-semibold text-sumi">
              {Math.max(data.daysOnHako, data.dailiesKept)}
            </strong>{" "}
            dailies kept.
          </>
        )}
        {!streakSinceLabel && data.dailiesKept === 0 && "— begin a streak today."}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `ProfileBody.tsx` (right column)**

Write to `app/profile/ProfileBody.tsx`:

```tsx
import Link from "next/link";
import { Heatmap } from "@/components/stats/Heatmap";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { formatTime } from "@/lib/utils";
import { fetchProfileData, formatSince } from "./_profile-data";

const STAMP_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const DIFFS = [
  { key: "easy", k: "易", lvl: "easy" },
  { key: "medium", k: "中", lvl: "medium" },
  { key: "hard", k: "難", lvl: "hard" },
  { key: "expert", k: "極", lvl: "expert" },
];

function numberWord(n: number): string {
  const words = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  ];
  return words[n] ?? n.toString();
}

export async function ProfileBody({
  userId,
  userCreatedAt,
}: {
  userId: string;
  userCreatedAt: string | null;
}) {
  const data = await fetchProfileData(userId, userCreatedAt);
  return (
    <>
      {/* Heatmap */}
      <div>
        <div className="flex flex-col md:flex-row md:justify-between md:items-baseline gap-2 mb-[18px]">
          <h2 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
            Half a year, in seals
            <span className="text-vermillion ml-2.5 text-[0.85em]">章</span>
          </h2>
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right leading-relaxed">
            <strong className="text-sumi font-medium">{data.dailiesKept}</strong>{" "}
            kept ·{" "}
            <strong className="text-sumi font-medium">{data.missed}</strong>{" "}
            missed
            <br />
            last 26 weeks
          </div>
        </div>
        <div className="overflow-x-auto -mx-7 px-7 lg:mx-0 lg:px-0">
          <Heatmap days={data.heatmap} />
        </div>
        <div className="mt-3.5 flex justify-between items-center mono text-[9.5px] tracking-[0.18em] uppercase text-moss">
          <div>density = time on the puzzle</div>
          <div className="flex gap-1.5 items-center">
            <span>less</span>
            <span className="w-[11px] h-[11px] border-[0.5px] border-sumi/20" />
            <span className="w-[11px] h-[11px] bg-vermillion/22" />
            <span className="w-[11px] h-[11px] bg-vermillion/55" />
            <span className="w-[11px] h-[11px] bg-vermillion" />
            <span>more</span>
          </div>
        </div>
      </div>

      {/* Personal best */}
      <div>
        <div className="flex justify-between items-baseline mb-[18px] gap-6">
          <h3 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
            Personal best
            <span className="text-vermillion ml-2.5 text-[0.85em]">速</span>
          </h3>
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right">
            your fastest, by floor
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-sumi/18">
          {DIFFS.map((d, i, arr) => {
            const stat = data.diffStats[d.key];
            const has = stat && stat.count > 0;
            return (
              <div
                key={d.key}
                className={
                  "py-5 px-5 border-b border-sumi/12 " +
                  (i === 0 ? "pl-0 " : "") +
                  (i < arr.length - 1 ? "border-r border-sumi/10 " : "")
                }
              >
                <div className="flex justify-between items-baseline">
                  <div
                    className={
                      "mincho font-semibold text-[32px] leading-none -tracking-[0.02em] " +
                      (has ? "text-sumi" : "text-moss/45")
                    }
                  >
                    {d.k}
                  </div>
                  <div className="mono text-[9.5px] tracking-[0.2em] uppercase text-moss">
                    {d.lvl}
                  </div>
                </div>
                <div
                  className={
                    "mincho font-semibold text-[32px] leading-none -tracking-[0.01em] tnum mt-5 " +
                    (has ? "text-vermillion" : "text-moss/50")
                  }
                >
                  {has ? formatTime(stat.best) : "—:—"}
                </div>
                <div className="mono text-[9.5px] tracking-[0.16em] uppercase text-moss mt-1.5">
                  {has && stat.bestGame
                    ? `${formatSince(stat.bestGame.created_at)} · ${stat.count} solved`
                    : "no solves yet"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Marks */}
      <div>
        <div className="flex justify-between items-baseline mb-[18px] gap-6">
          <h3 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
            {data.earnedCount === 0
              ? "No marks yet"
              : `${numberWord(data.earnedCount)} of twelve`}
            <span className="text-vermillion ml-2.5 text-[0.85em]">章</span>
          </h3>
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right">
            {data.lastEarned ? (
              <>
                last earned{" "}
                <strong className="text-sumi font-medium">{data.lastEarned.glyph}</strong>{" "}
                · {data.lastEarned.when}
              </>
            ) : (
              <>{data.earnedCount} of 12 · earned</>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-6">
          {ACHIEVEMENTS.map((a) => {
            const s = data.statuses.find((x) => x.key === a.key);
            const earned = !!s?.earned;
            const hidden = !earned && a.hideUntilEarned;
            return (
              <div key={a.key} className="flex flex-col items-center gap-2.5">
                {earned ? (
                  <div
                    className="relative w-[54px] h-[54px] bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none"
                    style={{ fontSize: 26 }}
                  >
                    <span className="relative z-10">{a.glyph}</span>
                    <span
                      aria-hidden
                      className="absolute inset-0 mix-blend-multiply pointer-events-none"
                      style={{ backgroundImage: STAMP_NOISE }}
                    />
                  </div>
                ) : (
                  <div
                    className="w-[54px] h-[54px] bg-transparent text-sumi flex items-center justify-center mincho font-semibold leading-none border-[1.5px] border-sumi/18"
                    style={{ fontSize: 26 }}
                  >
                    <span className="opacity-[0.22]">{hidden ? "？" : a.glyph}</span>
                  </div>
                )}
                <div
                  className={
                    "mincho font-semibold text-[11px] text-center leading-tight " +
                    (earned ? "text-sumi" : "text-moss")
                  }
                >
                  {hidden ? "— hidden" : a.name}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-sumi/18 pt-3.5 mt-[18px] flex justify-between items-center mono text-[10px] tracking-[0.22em] uppercase text-moss">
          <span>
            {data.earnedCount} of 12
            {data.rareCount > 0 && <> · {data.rareCount} rare</>}
          </span>
          <Link href="/achievements" className="text-sumi border-b-[1.5px] border-vermillion pb-0.5">
            See the full ledger →
          </Link>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Update `app/profile/page.tsx`**

Replace the file:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/Masthead";
import { UsernamePicker } from "@/components/profile/UsernamePicker";
import { ProfileBody } from "./ProfileBody";
import { ProfileStreakBlock } from "./ProfileStreakBlock";
import { ProfileBodySkeleton } from "@/components/skeletons/ProfileBodySkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

export const dynamic = "force-dynamic";

const STAMP_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export default async function Profile() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  // Fetch the small profile row needed by the synchronous left-rail header.
  // ProfileBody/ProfileStreakBlock fetch the heavy data themselves via cache().
  const { data: profile } = await sb
    .from("profiles")
    .select("created_at,city,username")
    .eq("id", user.id)
    .maybeSingle();

  const initial = user.email?.[0] ?? "·";
  const emailHandle = user.email?.split("@")[0] ?? user.id.slice(0, 8);
  const username = profile?.username?.trim() || emailHandle;
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const headlineSize = displayName.length > 14 ? 28 : displayName.length > 10 ? 34 : 42;
  const cityLabel = (profile?.city ?? "—").trim() || "—";
  const userCreatedAt = profile?.created_at ?? null;

  return (
    <>
      <Masthead active="profile" initial={initial} email={user.email ?? null} />

      <main>
        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] border-b-[1.5px] border-sumi bg-bone">
          {/* Left rail */}
          <div className="bg-rice border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi p-10 lg:px-12 lg:py-14 flex flex-col gap-9">
            <div>
              <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss mb-3.5 truncate" title={`/u/${username} · ${cityLabel}`}>
                /u/{username} · {cityLabel}
              </div>
              <div
                className="relative w-20 h-20 bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none mb-[18px]"
                style={{ fontSize: 48 }}
              >
                <span className="relative z-10">{initial.toUpperCase()}</span>
                <span
                  aria-hidden
                  className="absolute inset-0 mix-blend-multiply pointer-events-none"
                  style={{ backgroundImage: STAMP_NOISE }}
                />
              </div>
              <h1
                className="mincho font-medium leading-none -tracking-[0.015em] text-sumi m-0 break-words"
                style={{ fontSize: headlineSize }}
                title={displayName}
              >
                {displayName}
              </h1>
              <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-moss mt-2.5 flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[200px]" title={`@${username}`}>
                  @{username}
                </span>
                <UsernamePicker current={username} />
              </div>
              <p className="mt-[18px] ital text-[17px] text-moss leading-snug max-w-[30ch]">
                — solver on Hako.
              </p>
            </div>

            <Suspense
              fallback={
                <div className="pt-7 border-t border-sumi/18">
                  <SkeletonBox className="h-3 w-24" />
                  <SkeletonBox className="h-[112px] w-32 mt-2" />
                  <SkeletonBox className="h-3 w-3/4 mt-3" />
                </div>
              }
            >
              <ProfileStreakBlock userId={user.id} userCreatedAt={userCreatedAt} />
            </Suspense>

            <div className="mt-auto pt-6 border-t border-sumi/18">
              <Link
                href="/play/daily"
                className="btn-hako"
                style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
              >
                Continue today&rsquo;s box{" "}
                <span className="font-jakarta font-light text-[18px]">→</span>
              </Link>
            </div>
          </div>

          {/* Right column */}
          <div className="p-8 lg:p-12 flex flex-col gap-12">
            <Suspense fallback={<ProfileBodySkeleton />}>
              <ProfileBody userId={user.id} userCreatedAt={userCreatedAt} />
            </Suspense>
          </div>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. The `lastOpenedTime` rendering moved into `ProfileStreakBlock`'s parent (or was dropped) — verify the page still compiles. If `lastOpenedTime` is needed in the rail, lift it back into `ProfileStreakBlock` (it's part of `ProfileData`).

> **Note:** the original page rendered `lastOpenedTime` under the "Continue today's box" CTA. The plan above drops that small footnote. If you want to preserve it, render it from `ProfileBody` props or expose it via a small `<ProfileLastOpened>` async component. For now, dropping it is acceptable per the spec's "no behavior change" rule (this is a minor visual element). If reviewers object, lift `lastOpenedTime` back from `fetchProfileData` into a third Suspense in the left rail.

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual smoke**

Visit `/profile`. Left-rail header (avatar, name, city) and the bottom CTA render immediately. Streak block fades in (Suspense) along with the right column.

- [ ] **Step 8: Commit**

```bash
git add app/profile/_profile-data.ts app/profile/ProfileStreakBlock.tsx app/profile/ProfileBody.tsx app/profile/page.tsx
git commit -m "feat(profile): stream streak + body via Suspense"
```

---

## Task 16: Suspense split on `/achievements`

**Files:**
- Create: `app/achievements/AchievementsBody.tsx`
- Modify: `app/achievements/page.tsx`

- [ ] **Step 1: Create `AchievementsBody`**

Write to `app/achievements/AchievementsBody.tsx`:

```tsx
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { AchievementsLedger } from "@/components/profile/AchievementsLedger";
import { computeStatuses, type GameRow } from "@/lib/achievements";

export async function AchievementsBody({ userId }: { userId: string }) {
  const sb = createServerClient();
  const today = todayUTC();
  const recentWindowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 730);
    return d.toISOString().slice(0, 10);
  })();

  const [{ data: games }, { data: streakFreezes }] = await Promise.all([
    sb
      .from("games")
      .select("difficulty,is_complete,elapsed_seconds,errors_made,hints_used,daily_date,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("streak_freezes")
      .select("date")
      .eq("user_id", userId)
      .gte("date", recentWindowStart)
      .lte("date", today),
  ]);

  const all = (games ?? []) as GameRow[];
  const frozenDates = new Set<string>(
    ((streakFreezes ?? []) as { date: string }[]).map((f) => f.date),
  );
  const statuses = computeStatuses(all, { today, frozen: frozenDates });
  const earnedCount = statuses.filter((s) => s.earned).length;

  return (
    <>
      <div className="mono text-[10.5px] tracking-[0.18em] uppercase text-moss text-right leading-relaxed -mt-7 mb-6">
        <strong className="mincho text-vermillion font-semibold text-[18px]">{earnedCount}</strong>
        <span className="text-moss"> / 12 earned</span>
      </div>
      <div className="mt-9">
        <AchievementsLedger statuses={statuses} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update `app/achievements/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/Masthead";
import { AchievementsBody } from "./AchievementsBody";
import { AchievementsBodySkeleton } from "@/components/skeletons/AchievementsBodySkeleton";

export const dynamic = "force-dynamic";

export default async function Achievements() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  const initial = user.email?.[0] ?? "·";

  return (
    <>
      <Masthead active="profile" initial={initial} email={user.email ?? null} />
      <main className="px-7 lg:px-14 py-12 lg:py-16 max-w-[1480px] mx-auto">
        <Link
          href="/profile"
          className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss hover:text-sumi"
        >
          ← back to profile
        </Link>

        <div className="mt-6 flex justify-between items-end gap-6 border-b-[1.5px] border-sumi pb-[18px]">
          <div>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">
              § achievements
            </div>
            <h1 className="mincho font-medium text-[42px] leading-none mt-2 -tracking-[0.01em]">
              The full ledger
              <span className="text-vermillion ml-3.5 text-[0.7em] align-baseline">章</span>
            </h1>
          </div>
        </div>

        <p className="ital text-[16px] text-moss leading-snug max-w-[60ch] mt-6">
          — twelve marks a serious solver might collect. Earned and locked sit
          next to each other; two specials stay hidden until you find them.
        </p>

        <Suspense fallback={<AchievementsBodySkeleton />}>
          <AchievementsBody userId={user.id} />
        </Suspense>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual smoke**

Visit `/achievements`. Header and intro paragraph render immediately; the marks grid streams in.

- [ ] **Step 6: Commit**

```bash
git add app/achievements/AchievementsBody.tsx app/achievements/page.tsx
git commit -m "feat(achievements): stream ledger body via Suspense"
```

---

## Task 17: Final verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all existing tests pass. (No new tests are added; skeletons are presentational.)

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors / no new warnings.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: succeeds. No warnings about missing `loading.tsx` boundaries, no Suspense errors.

- [ ] **Step 4: Manual smoke walk — signed-out**

Start: `npm run dev` (or `npm run build && npm run start` for the production-realistic walk).
Walk: `/` → `/play` → `/play/easy` → back to `/` → `/auth/login`. For each click:
- Skeleton appears in well under 100 ms (no blank pause).
- No layout shift when the real content swaps in.

- [ ] **Step 5: Manual smoke walk — signed-in**

Sign in. Walk: `/` → `/play` → `/year` → `/leaderboard` → `/profile` → `/achievements` → `/skins` → `/account` → `/pro` → back to `/`. For each click:
- Skeleton appears immediately.
- Final DOM matches what `main` branch renders (spot-check on `/`, `/leaderboard`, `/profile`).
- Suspense splits: synchronous chrome appears first; the async section briefly shows its fallback. Throttle to "Slow 4G" in DevTools to make this visible.

- [ ] **Step 6: Quantitative spot-check (optional)**

Open Chrome DevTools → Performance. Throttle to Slow 4G. Record a `/` → `/leaderboard` navigation. Compare time-to-first-paint vs. the same trace on `main`. Target: ≥300 ms drop on time-to-first-non-blank-frame.

- [ ] **Step 7: Final commit (only if any cleanup was needed)**

If the above steps surfaced a bug or unused import, fix and commit:

```bash
git add <files>
git commit -m "fix(streaming): <what was broken>"
```

Otherwise, the existing per-task commits are the deliverable.

---

## Self-review

**Spec coverage:**

- Section 1 (page inventory + skeletons): Tasks 1–11 cover every page in the spec table. ✅
- Section 2 (Suspense splits): Tasks 12–16 cover all 5 split pages. The `/` split was upgraded from one boundary to two (per the in-flight spec correction); the spec doc was updated accordingly. ✅
- Section 3 (testing): Task 17 runs the full automated + manual checklist. ✅
- "Out of scope" items (force-dynamic audit, layout refactor, middleware auth gate, e2e harness): not implemented, as designed. ✅

**Placeholder scan:** plan contains no "TBD/TODO/implement later". The two notes that say "if X breaks, do Y" are concrete contingencies (Task 13 grid placement, Task 15 `lastOpenedTime`), not unfinished work.

**Type consistency:** `fetchHomeYearData(userId, today, year)`, `fetchProfileData(userId, userCreatedAt)`, and the per-page Suspense child props are referenced consistently across tasks. Skeleton primitives (`SkeletonBox`, `MastheadSkeleton`) keep their names. The reusable per-page skeletons (`HomeHeroSkeleton`, `HomeYearSkeleton`, `YearStatsAndScrollSkeleton`, `LeaderboardPanelSkeleton`, `ProfileBodySkeleton`, `AchievementsBodySkeleton`, `GameShellSkeleton`) are referenced consistently between their definition (Tasks 6–11) and use as Suspense fallback (Tasks 12–16).
