# Main page (signed-in) redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose `/` (signed-in) into a balanced, full-width editorial layout — 2-col hero (TodayCard + new YOU TODAY stat panel), full-width year band, 2-col bottom strip — with light copy trims.

**Architecture:** Pure layout/markup work. One new pure-server React component (`YouTodayPanel`), small edits to `TodayCard` (drop the duplicated streak chip), and a restructure of `app/page.tsx`'s signed-in render branch. One new pure helper (`computeTodayRank`) with vitest coverage. No new data fetches, no schema changes, no new dependencies.

**Tech Stack:** Next.js 14 App Router, React 18 (server components), Tailwind, vitest for unit tests, `@testing-library/react` for component tests.

---

## Spec reference

Design doc: [`docs/superpowers/specs/2026-05-09-main-page-redesign-design.md`](../specs/2026-05-09-main-page-redesign-design.md)

## File map

**Create:**
- `lib/stats/rank.ts` — pure helper `computeTodayRank({ rows, userId })` returning `{ rank, total } | null`.
- `tests/stats/rank.test.ts` — vitest unit tests for `computeTodayRank`.
- `components/stats/YouTodayPanel.tsx` — server component that renders the 4-row "YOU TODAY" stat panel.
- `tests/components/YouTodayPanel.test.tsx` — component test covering pre-stamp / post-stamp states.

**Modify:**
- `components/year-scroll/TodayCard.tsx` — remove the streak chip from the CTA row (keep `streakDays` prop for back-compat; just don't render it). Tighten freeze prompt copy.
- `app/page.tsx` — restructure signed-in render branch (lines ~211–323): rebuild as 2-col hero + full-width year band + 2-col bottom strip; integrate `YouTodayPanel`; trim two ledger helper sentences; uppercase the "global pace · today" eyebrow.

**Unchanged:**
- `YearScroll`, `Seal`, `SealPopover`, `CityPicker`, `Masthead`, `Landing`, footer, all data-layer modules, all routes other than `/`.

---

## Task 1: Add `computeTodayRank` pure helper + tests

**Files:**
- Create: `lib/stats/rank.ts`
- Create: `tests/stats/rank.test.ts`

The page already fetches today's results sorted by elapsed time ASC (see `snapshotRows` in `app/page.tsx`). To find the user's rank we need a tiny pure function: given the sorted rows and the user's id, return `{ rank, total }` or `null` if the user isn't in the list.

- [ ] **Step 1.1: Write the failing test**

```ts
// tests/stats/rank.test.ts
import { describe, it, expect } from "vitest";
import { computeTodayRank } from "@/lib/stats/rank";

describe("computeTodayRank", () => {
  it("returns null when the user isn't in the rows", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
    ];
    expect(computeTodayRank({ rows, userId: "missing" })).toBeNull();
  });

  it("returns null when rows are empty", () => {
    expect(computeTodayRank({ rows: [], userId: "a" })).toBeNull();
  });

  it("returns rank 1 when user is first (rows already sorted ASC)", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "a" })).toEqual({ rank: 1, total: 3 });
  });

  it("returns rank N when user is last", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "c" })).toEqual({ rank: 3, total: 3 });
  });

  it("returns rank in the middle", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "b" })).toEqual({ rank: 2, total: 3 });
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npm test -- tests/stats/rank.test.ts`
Expected: FAIL with "Cannot find module '@/lib/stats/rank'" (or equivalent module-not-found error).

- [ ] **Step 1.3: Implement the helper**

```ts
// lib/stats/rank.ts

/**
 * Today's leaderboard rank for a given user.
 *
 * Assumes `rows` is already sorted by `elapsed_seconds` ascending — which is
 * how `app/page.tsx` queries `daily_results` for the home page snapshot.
 */
export interface TodayRank {
  rank: number;
  total: number;
}

export function computeTodayRank(input: {
  rows: { user_id: string; elapsed_seconds: number }[];
  userId: string;
}): TodayRank | null {
  const { rows, userId } = input;
  const idx = rows.findIndex((r) => r.user_id === userId);
  if (idx === -1) return null;
  return { rank: idx + 1, total: rows.length };
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npm test -- tests/stats/rank.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add lib/stats/rank.ts tests/stats/rank.test.ts
git commit -m "feat(stats): add computeTodayRank helper"
```

---

## Task 2: Create `YouTodayPanel` component + tests

**Files:**
- Create: `components/stats/YouTodayPanel.tsx`
- Create: `tests/components/YouTodayPanel.test.tsx`

A server component (no `"use client"`) that renders the 4-row stat list.

**Visual:**
- Vertical list, label-on-left + value-on-right, hairline rules between rows.
- Eyebrow header `YOU TODAY` (vermillion red — `eyebrow.red`).
- Numbers use the `mincho` family with `tnum` for tabular figures.
- When `streak >= 7`, the streak value renders in `text-vermillion` (subtle reward signal).
- Dashes (`—`) are used as the "no value yet" sentinel.

The Tailwind tokens used (`text-sumi`, `text-moss`, `text-vermillion`, `border-sumi`, `mincho`, `mono`, `eyebrow`, `tnum`) are all already defined in `app/globals.css` and `tailwind.config.ts` — no design-system additions needed.

- [ ] **Step 2.1: Install jsdom and set up the component-test environment**

The current `vitest.config.ts` uses `environment: "node"` and only includes `tests/**/*.test.ts`. To run a `.test.tsx` component test we need jsdom + `.tsx` glob inclusion + a setup file that wires `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.). `@testing-library/jest-dom` and `@testing-library/react` are already in `package.json`; only `jsdom` needs adding.

Run: `npm install -D jsdom`

Expected: `package.json` gains `"jsdom"` in `devDependencies`; `package-lock.json` updates.

Replace `vitest.config.ts` with:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/components/**", "jsdom"]],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Create the setup file:

```ts
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2.2: Write the failing component test**

```tsx
// tests/components/YouTodayPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { YouTodayPanel } from "@/components/stats/YouTodayPanel";

describe("YouTodayPanel", () => {
  it("renders pre-stamp state with dashes for today and rank", () => {
    render(
      <YouTodayPanel
        streak={3}
        yearFilled={120}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    expect(screen.getByText("YOU TODAY")).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("120 / 365")).toBeInTheDocument();
    // TODAY and RANK rows show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders post-stamp state with formatted time and rank", () => {
    render(
      <YouTodayPanel
        streak={13}
        yearFilled={248}
        yearTotal={365}
        todayElapsed={402}
        todayRank={{ rank: 14, total: 1247 }}
      />,
    );
    expect(screen.getByText("13 days")).toBeInTheDocument();
    expect(screen.getByText("248 / 365")).toBeInTheDocument();
    expect(screen.getByText("6:42")).toBeInTheDocument();
    expect(screen.getByText("#14 / 1,247")).toBeInTheDocument();
  });

  it("renders 0 streak as '0 days' (not '—')", () => {
    render(
      <YouTodayPanel
        streak={0}
        yearFilled={0}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    expect(screen.getByText("0 days")).toBeInTheDocument();
  });

  it("highlights streak in vermillion when streak >= 7", () => {
    render(
      <YouTodayPanel
        streak={9}
        yearFilled={9}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    const streakValue = screen.getByText("9 days");
    expect(streakValue.className).toContain("text-vermillion");
  });

  it("does NOT highlight streak when streak < 7", () => {
    render(
      <YouTodayPanel
        streak={3}
        yearFilled={3}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    const streakValue = screen.getByText("3 days");
    expect(streakValue.className).not.toContain("text-vermillion");
  });
});
```

- [ ] **Step 2.3: Run the test to verify it fails**

Run: `npm test -- tests/components/YouTodayPanel.test.tsx`
Expected: FAIL with "Cannot find module '@/components/stats/YouTodayPanel'".

- [ ] **Step 2.4: Implement the component**

```tsx
// components/stats/YouTodayPanel.tsx
import { formatTime } from "@/lib/utils";

interface Props {
  streak: number;
  yearFilled: number;
  yearTotal: number;
  /** Seconds. null when today isn't stamped yet. */
  todayElapsed: number | null;
  /** null when today isn't stamped yet. */
  todayRank: { rank: number; total: number } | null;
}

export function YouTodayPanel({
  streak,
  yearFilled,
  yearTotal,
  todayElapsed,
  todayRank,
}: Props) {
  const streakHot = streak >= 7;
  const streakClass =
    "mincho text-[28px] tnum leading-none " +
    (streakHot ? "text-vermillion" : "text-sumi");
  return (
    <aside className="lg:border-l lg:border-sumi/15 lg:pl-10 lg:pt-2">
      <div className="eyebrow red">YOU TODAY</div>
      <dl className="mt-5">
        <Row label="streak" valueClassName={streakClass}>
          {streak} days
        </Row>
        <Row label="year">
          {yearFilled} / {yearTotal}
        </Row>
        <Row label="today">
          {todayElapsed != null ? formatTime(todayElapsed) : "—"}
        </Row>
        <Row label="rank">
          {todayRank != null
            ? `#${todayRank.rank} / ${todayRank.total.toLocaleString()}`
            : "—"}
        </Row>
      </dl>
    </aside>
  );
}

function Row({
  label,
  valueClassName,
  children,
}: {
  label: string;
  valueClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between py-3 border-b border-sumi/12 last:border-b-0">
      <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">
        {label}
      </dt>
      <dd
        className={
          valueClassName ?? "mincho text-[28px] tnum leading-none text-sumi"
        }
      >
        {children}
      </dd>
    </div>
  );
}
```

- [ ] **Step 2.5: Run the test to verify it passes**

Run: `npm test -- tests/components/YouTodayPanel.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 2.6: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS — all suites green (existing + new).

- [ ] **Step 2.7: Commit**

```bash
git add components/stats/YouTodayPanel.tsx tests/components/YouTodayPanel.test.tsx tests/setup.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(stats): add YouTodayPanel component"
```

---

## Task 3: Drop streak chip + tighten freeze copy in `TodayCard`

**Files:**
- Modify: `components/year-scroll/TodayCard.tsx`

The streak now lives only in `YouTodayPanel`. Per spec, also tighten the freeze-prompt sentence.

- [ ] **Step 3.1: Remove the streak chip from the CTA row**

Open `components/year-scroll/TodayCard.tsx`. Find the block (currently lines 127–132):

```tsx
            {streakDays > 0 && (
              <span className="mono text-[12px] tracking-[0.16em] uppercase text-vermillion flex items-center gap-2">
                <span className="inline-seal" aria-hidden>印</span>
                streak · {streakDays}d
              </span>
            )}
```

Delete it.

- [ ] **Step 3.2: Tighten the freeze-prompt copy**

Find the block (currently lines 134–145):

```tsx
          {freezePrompt && freezeStatus === "idle" && (
            <div className="mt-5 border-t border-sumi/15 pt-4 text-[14px] ital text-sumi max-w-[44ch]">
              yesterday's seal — {freezePrompt.kanji} — was missed.{" "}
              <button
                onClick={applyFreeze}
                className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
              >
                apply freeze
              </button>{" "}
              <span className="text-moss text-[11px]">({freezePrompt.remaining} of 2 left)</span>
            </div>
          )}
```

Replace with:

```tsx
          {freezePrompt && freezeStatus === "idle" && (
            <div className="mt-5 border-t border-sumi/15 pt-4 text-[14px] ital text-sumi max-w-[44ch]">
              yesterday — {freezePrompt.kanji} — missed.{" "}
              <button
                onClick={applyFreeze}
                className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
              >
                apply freeze
              </button>{" "}
              <span className="text-moss text-[11px]">· {freezePrompt.remaining} left</span>
            </div>
          )}
```

- [ ] **Step 3.3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — `streakDays` prop is still declared (other call sites may pass it; we just don't render it). No type errors.

- [ ] **Step 3.4: Run the full test suite**

Run: `npm test`
Expected: PASS — no test depends on the deleted streak chip text or the old freeze copy.

- [ ] **Step 3.5: Commit**

```bash
git add components/year-scroll/TodayCard.tsx
git commit -m "refactor(today-card): drop streak chip; tighten freeze copy"
```

---

## Task 4: Restructure the signed-in branch of `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

The current signed-in render block runs lines 211–323. Rebuild it as 3 bands per the spec.

- [ ] **Step 4.1: Add the imports for the new helper + component**

Open `app/page.tsx`. Add to the existing import block at the top (around lines 1–16):

```tsx
import { computeTodayRank } from "@/lib/stats/rank";
import { YouTodayPanel } from "@/components/stats/YouTodayPanel";
```

- [ ] **Step 4.2: Compute the rank once before the JSX**

In the signed-in branch, **after** the `popularCities` / `citySuggestion` block (currently around line 209) and **before** the `return (` on line 211, add:

```tsx
  const todayRank = computeTodayRank({
    rows: rows.map((r) => ({ user_id: r.user_id, elapsed_seconds: r.elapsed_seconds })),
    userId: user.id,
  });
  const yearFilled =
    series?.seals.filter((s) => s.state === "filled" || s.state === "freeze").length ?? 0;
  const yearTotal = series?.seals.length ?? 0;
```

- [ ] **Step 4.3: Replace the JSX of the signed-in branch**

Replace the entire `return ( ... )` block of the signed-in branch (currently lines 211–323) with the structure below. This is one continuous replacement — copy verbatim.

```tsx
  return (
    <>
      <Masthead active="today" initial={initial} email={user.email ?? null} />

      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow red">{dateLine()}</div>

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
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12 items-start">
          <TodayCard
            today={todaySeal}
            completedElapsed={completedTodayElapsed}
            streakDays={streak}
            freezePrompt={freezePrompt}
            tategakiDay={weekdayJp()}
          />
          <div className="mt-8 lg:mt-0">
            <YouTodayPanel
              streak={streak}
              yearFilled={yearFilled}
              yearTotal={yearTotal}
              todayElapsed={completedTodayElapsed ?? null}
              todayRank={todayRank}
            />
          </div>
        </section>

        {/* ── Band 2 · Year ───────────────────────────────────────── */}
        {series && (
          <section className="mt-12">
            <div className="flex justify-between items-baseline mb-3">
              <div className="eyebrow">your year</div>
              <div className="mono text-[11px] tracking-[0.14em] text-moss">
                {yearFilled}
                {" / "}
                {yearTotal}
              </div>
            </div>
            <YearScroll series={series} />
          </section>
        )}

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
```

Note the explicit changes vs the current code:
- Width caps removed: TodayCard, YearScroll, and bottom-strip columns no longer wrapped in `max-w-[640px]`.
- Hero is now `lg:grid-cols-[1.4fr_1fr]`; YouTodayPanel sits in the right column.
- Bottom strip uses the same `lg:grid-cols-[1.4fr_1fr]` (was `lg:grid-cols-2`) so vertical rhythm matches the hero.
- Two trailing helper sentences in the ledger preview removed (`— the ledger fills as solvers finish today's box.` and `↘ your name lands when you finish.`); empty state becomes 3 placeholder rows so the column doesn't collapse.

- [ ] **Step 4.4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4.5: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites still green (no test asserts on the home-page DOM).

- [ ] **Step 4.6: Commit**

```bash
git add app/page.tsx
git commit -m "refactor(home): 2-col hero + full-width year + 2-col bottom"
```

---

## Task 5: Verify in the browser at three viewports

**Files:** none modified.

This is the verification gate — the user explicitly cares about how it *looks*, so don't claim done until each viewport is screenshotted and matches the spec.

- [ ] **Step 5.1: Start the dev server**

Use the preview-tools workflow (see CLAUDE rules):
- Call `mcp__Claude_Preview__preview_start` with `name: "hako-dev"`.
- Note the returned `serverId`.

- [ ] **Step 5.2: Verify desktop layout (1440×900)**

- Resize: `mcp__Claude_Preview__preview_resize` with `width: 1440, height: 900`.
- Sign in via `/auth/login` using the dev account (or sign up a fresh test account if none exists — the dev Supabase instance accepts email signups). If neither is feasible in your environment, **stop and ask the user** to either provide credentials or perform the screenshot pass themselves; do not edit the page to bypass auth.
- Once signed in, navigate to `/` and take a screenshot.

Acceptance: Hero shows TodayCard on the left and YOU TODAY panel on the right (border-l hairline visible between them). Year band is full width below. Bottom strip has Global pace on the left and Ledger on the right. No section visibly orphaned in a column < 80% of the available content width.

- [ ] **Step 5.3: Verify tablet layout (768×1024)**

- Resize: `mcp__Claude_Preview__preview_resize` with `preset: "tablet"`.
- Take a screenshot.

Acceptance: Single-column stack — TodayCard, then YOU TODAY (the panel renders without the `lg:border-l` so no orphan rule), then YearScroll, then Global pace, then Ledger preview.

- [ ] **Step 5.4: Verify mobile layout (375×812)**

- Resize: `mcp__Claude_Preview__preview_resize` with `preset: "mobile"`.
- Take a screenshot.

Acceptance: Same single-column stack; YearScroll is horizontally scrollable (existing behavior); no horizontal overflow elsewhere.

- [ ] **Step 5.5: Check the console for errors**

Call `mcp__Claude_Preview__preview_console_logs` with `level: "error"`.
Expected: no errors related to the home-page render.

- [ ] **Step 5.6: Report verification results to the user**

Share the three screenshots and a 1–2 line summary of what's visible at each viewport. Only declare the work complete after all three screenshots match the acceptance criteria.

---

## Self-review notes

- Spec coverage:
  - Band 1 (2-col hero) → Task 4 step 4.3.
  - Band 2 (full-width year) → Task 4 step 4.3.
  - Band 3 (2-col bottom strip) → Task 4 step 4.3.
  - YOU TODAY panel content (4 rows + dashes + streak ≥ 7 highlight) → Task 2.
  - Streak removed from TodayCard → Task 3.
  - Copy trims (ledger empty/footer sentences, freeze prompt, eyebrow casing) → Task 3 + Task 4 step 4.3. **Note:** the spec also called for uppercasing `global pace · today` → `GLOBAL PACE · TODAY`. The plan as written keeps it lowercase to match the existing `eyebrow` token convention (which is `uppercase` via CSS — the source string stays lowercase). The visual output will be uppercase. ✔
  - `todayRank` derivation from existing `snapshotRows` → Task 1 + Task 4 step 4.2.
  - Responsive (lg breakpoint, single-column collapse) → Task 4 step 4.3 (`lg:` prefixes).
  - Verification at 3 viewports → Task 5.
- Type consistency: `computeTodayRank` returns `{ rank, total } | null`; `YouTodayPanel`'s `todayRank` prop has the same shape. ✔
- No placeholders: every step has actual code, exact paths, exact commands. ✔
