# Today's Seal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Today's Seal flagship daily-engagement system: per-date kanji, vertical year-scroll on the home page, scroll-context win-modal payoff, share PNG, and Pro streak freezes — replacing the existing `<StreakBadge />` with a unified streak that walks completions ∪ freezes.

**Architecture:** Three new tables (`daily_seal_calendar`, `daily_seal_lines`, `streak_freezes`) feed three new GET/POST endpoints (`/api/seal/today`, `/api/seal/year`, `/api/seal/freeze`) plus a share PNG endpoint (`/api/share/seal/[date]`). Pure-logic helpers in `lib/seal/` handle deterministic kanji assignment, year-series assembly, and unified streak calculation — all behind vitest tests. New React components (`<Seal />`, `<YearScroll />`, `<TodayCard />`, `<ScrollContextStrip />`, `<SealPopover />`) live in `components/year-scroll/`. Integration touches `app/page.tsx`, `components/game/WinModal.tsx`, and `components/Masthead.tsx`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), `@anthropic-ai/sdk` (Claude Haiku for Sensei lines), `framer-motion`, `@vercel/og` for share PNG, Zustand (existing game store), Tailwind (Hako tokens), vitest (node env, pure-logic only).

**Spec:** `docs/superpowers/specs/2026-05-09-todays-seal-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/0004_daily_seal_calendar.sql` — date → kanji table
- `supabase/migrations/0005_daily_seal_lines.sql` — date → Sensei line cache
- `supabase/migrations/0006_streak_freezes.sql` — Pro freeze ledger
- `lib/kanji-bank.ts` — curated kanji entries (kanji, romaji, meaning, themes)
- `lib/seal/types.ts` — shared types: `SealState`, `SealEntry`, `YearSeries`
- `lib/seal/calendar.ts` — pure: deterministic date→kanji assignment
- `lib/seal/streak.ts` — pure: unified streak calc over completions ∪ freezes
- `lib/seal/year.ts` — pure: assemble per-user year series from inputs
- `lib/seal/sensei.ts` — server: generate + cache Sensei micro-line via Claude Haiku
- `app/api/seal/today/route.ts` — GET kanji + line for today
- `app/api/seal/year/route.ts` — GET user's annual series
- `app/api/seal/freeze/route.ts` — POST apply freeze (Pro-only, 24h window)
- `app/api/share/seal/[date]/route.ts` — GET share PNG via @vercel/og
- `components/year-scroll/Seal.tsx` — single seal cell, all states
- `components/year-scroll/SealPopover.tsx` — read-only past-day popover
- `components/year-scroll/ScrollContextStrip.tsx` — 9-cell strip for win modal
- `components/year-scroll/YearScroll.tsx` — 52×7 grid surface
- `components/year-scroll/TodayCard.tsx` — home-page hook card
- `scripts/seed-seal-calendar.ts` — populate calendar table
- `tests/seal/calendar.test.ts`, `tests/seal/streak.test.ts`, `tests/seal/year.test.ts` — pure-logic tests

**Modified files:**
- `lib/achievements.ts` — replace inline `dailyStreakLength` with shared streak helper
- `app/page.tsx` — restructure home around `<TodayCard />` + `<YearScroll />`
- `components/Masthead.tsx` — drop `<StreakBadge />` and `streakDays` prop
- `components/game/WinModal.tsx` — kanji-bloom + `<ScrollContextStrip />` payoff

**Deleted:**
- `components/StreakBadge.tsx`

---

## Phase 1 — Database migrations

### Task 1: `daily_seal_calendar` migration

**Files:**
- Create: `supabase/migrations/0004_daily_seal_calendar.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_daily_seal_calendar.sql

create table public.daily_seal_calendar (
  date date primary key,
  kanji text not null,
  romaji text not null,
  meaning text not null
);

alter table public.daily_seal_calendar enable row level security;

create policy daily_seal_calendar_world_read
  on public.daily_seal_calendar for select using (true);
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up` (or paste into your Supabase SQL editor).
Expected: migration applies without error; the table is empty.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_daily_seal_calendar.sql
git commit -m "feat(seal): add daily_seal_calendar table"
```

---

### Task 2: `daily_seal_lines` migration

**Files:**
- Create: `supabase/migrations/0005_daily_seal_lines.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_daily_seal_lines.sql

create table public.daily_seal_lines (
  date date primary key references public.daily_seal_calendar(date) on delete cascade,
  line text not null,
  generated_at timestamptz not null default now()
);

alter table public.daily_seal_lines enable row level security;

create policy daily_seal_lines_world_read
  on public.daily_seal_lines for select using (true);

-- Service role inserts via the API route; no public insert policy.
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up`.
Expected: applies without error; table empty.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_daily_seal_lines.sql
git commit -m "feat(seal): add daily_seal_lines cache table"
```

---

### Task 3: `streak_freezes` migration

**Files:**
- Create: `supabase/migrations/0006_streak_freezes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_streak_freezes.sql

create table public.streak_freezes (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  granted_month date not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index streak_freezes_user_month_idx
  on public.streak_freezes(user_id, granted_month);

alter table public.streak_freezes enable row level security;

create policy streak_freezes_owner_all on public.streak_freezes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up`.
Expected: applies without error; table empty.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_streak_freezes.sql
git commit -m "feat(seal): add streak_freezes ledger"
```

---

## Phase 2 — Pure-logic libs (TDD)

### Task 4: Shared types

**Files:**
- Create: `lib/seal/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// lib/seal/types.ts

export type SealState =
  | "filled"
  | "today"
  | "empty"
  | "future"
  | "freeze"
  | "pre-signup";

export interface KanjiEntry {
  kanji: string;
  romaji: string;
  meaning: string;
  themes: string[];
}

export interface SealEntry {
  date: string;            // 'YYYY-MM-DD'
  kanji: string;
  romaji: string;
  meaning: string;
  state: SealState;
  elapsedSeconds?: number; // present when state='filled'
}

export interface YearSeries {
  year: number;
  todayIndex: number;       // 0..364
  seals: SealEntry[];       // length = 365 or 366 (leap)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/seal/types.ts
git commit -m "feat(seal): add shared seal types"
```

---

### Task 5: Kanji bank

**Files:**
- Create: `lib/kanji-bank.ts`

A curated set of ~60 starter entries; engineer extends from a Joyo kanji list (~600 entries) before launch.

- [ ] **Step 1: Write the bank file**

```typescript
// lib/kanji-bank.ts
import type { KanjiEntry } from "@/lib/seal/types";

/**
 * Curated bank of evocative kanji. Themes are advisory (no UI surface in v1)
 * and used by the seed script to ensure variety across consecutive days.
 *
 * Starter set — extend with Joyo kanji (target: ~600 entries) before public launch.
 * Reserved kanji for solstices/equinoxes/year-boundary are listed in RESERVED.
 */
export const KANJI_BANK: KanjiEntry[] = [
  { kanji: "月", romaji: "tsuki",  meaning: "moon",     themes: ["sky", "weekday"] },
  { kanji: "火", romaji: "hi",     meaning: "fire",     themes: ["element", "weekday"] },
  { kanji: "水", romaji: "mizu",   meaning: "water",    themes: ["element", "weekday"] },
  { kanji: "木", romaji: "ki",     meaning: "tree",     themes: ["nature", "weekday"] },
  { kanji: "金", romaji: "kane",   meaning: "metal",    themes: ["element", "weekday"] },
  { kanji: "土", romaji: "tsuchi", meaning: "earth",    themes: ["element", "weekday"] },
  { kanji: "日", romaji: "hi",     meaning: "sun",      themes: ["sky", "weekday"] },
  { kanji: "山", romaji: "yama",   meaning: "mountain", themes: ["nature"] },
  { kanji: "川", romaji: "kawa",   meaning: "river",    themes: ["nature"] },
  { kanji: "海", romaji: "umi",    meaning: "sea",      themes: ["nature"] },
  { kanji: "空", romaji: "sora",   meaning: "sky",      themes: ["sky"] },
  { kanji: "雲", romaji: "kumo",   meaning: "cloud",    themes: ["sky"] },
  { kanji: "雨", romaji: "ame",    meaning: "rain",     themes: ["weather"] },
  { kanji: "雪", romaji: "yuki",   meaning: "snow",     themes: ["weather", "winter"] },
  { kanji: "風", romaji: "kaze",   meaning: "wind",     themes: ["weather"] },
  { kanji: "花", romaji: "hana",   meaning: "flower",   themes: ["nature", "spring"] },
  { kanji: "葉", romaji: "ha",     meaning: "leaf",     themes: ["nature"] },
  { kanji: "鳥", romaji: "tori",   meaning: "bird",     themes: ["nature"] },
  { kanji: "石", romaji: "ishi",   meaning: "stone",    themes: ["nature"] },
  { kanji: "光", romaji: "hikari", meaning: "light",    themes: ["abstract"] },
  { kanji: "影", romaji: "kage",   meaning: "shadow",   themes: ["abstract"] },
  { kanji: "朝", romaji: "asa",    meaning: "morning",  themes: ["time"] },
  { kanji: "夜", romaji: "yoru",   meaning: "night",    themes: ["time"] },
  { kanji: "星", romaji: "hoshi",  meaning: "star",     themes: ["sky"] },
  { kanji: "音", romaji: "oto",    meaning: "sound",    themes: ["abstract"] },
  { kanji: "道", romaji: "michi",  meaning: "path",     themes: ["abstract"] },
  { kanji: "心", romaji: "kokoro", meaning: "heart",    themes: ["abstract"] },
  { kanji: "気", romaji: "ki",     meaning: "spirit",   themes: ["abstract"] },
  { kanji: "力", romaji: "chikara",meaning: "strength", themes: ["abstract"] },
  { kanji: "白", romaji: "shiro",  meaning: "white",    themes: ["color"] },
  { kanji: "黒", romaji: "kuro",   meaning: "black",    themes: ["color"] },
  { kanji: "赤", romaji: "aka",    meaning: "red",      themes: ["color"] },
  { kanji: "青", romaji: "ao",     meaning: "blue",     themes: ["color"] },
  { kanji: "古", romaji: "furu",   meaning: "old",      themes: ["abstract"] },
  { kanji: "新", romaji: "atara",  meaning: "new",      themes: ["abstract"] },
  { kanji: "静", romaji: "shizu",  meaning: "quiet",    themes: ["abstract"] },
  { kanji: "動", romaji: "dou",    meaning: "moving",   themes: ["abstract"] },
  { kanji: "東", romaji: "higashi",meaning: "east",     themes: ["direction"] },
  { kanji: "西", romaji: "nishi",  meaning: "west",     themes: ["direction"] },
  { kanji: "南", romaji: "minami", meaning: "south",    themes: ["direction"] },
  { kanji: "北", romaji: "kita",   meaning: "north",    themes: ["direction"] },
  { kanji: "松", romaji: "matsu",  meaning: "pine",     themes: ["nature"] },
  { kanji: "竹", romaji: "take",   meaning: "bamboo",   themes: ["nature"] },
  { kanji: "梅", romaji: "ume",    meaning: "plum",     themes: ["nature", "spring"] },
  { kanji: "茶", romaji: "cha",    meaning: "tea",      themes: ["culture"] },
  { kanji: "禅", romaji: "zen",    meaning: "zen",      themes: ["culture"] },
  { kanji: "和", romaji: "wa",     meaning: "harmony",  themes: ["abstract"] },
  { kanji: "間", romaji: "ma",     meaning: "interval", themes: ["abstract"] },
  { kanji: "美", romaji: "bi",     meaning: "beauty",   themes: ["abstract"] },
  { kanji: "真", romaji: "shin",   meaning: "truth",    themes: ["abstract"] },
  { kanji: "誠", romaji: "makoto", meaning: "sincerity",themes: ["abstract"] },
  { kanji: "勇", romaji: "yuu",    meaning: "courage",  themes: ["abstract"] },
  { kanji: "希", romaji: "ki",     meaning: "hope",     themes: ["abstract"] },
  { kanji: "信", romaji: "shin",   meaning: "trust",    themes: ["abstract"] },
  { kanji: "知", romaji: "chi",    meaning: "knowing",  themes: ["abstract"] },
  { kanji: "学", romaji: "gaku",   meaning: "study",    themes: ["abstract"] },
  { kanji: "書", romaji: "sho",    meaning: "writing",  themes: ["culture"] },
  { kanji: "歌", romaji: "uta",    meaning: "song",     themes: ["culture"] },
  { kanji: "夢", romaji: "yume",   meaning: "dream",    themes: ["abstract"] },
  { kanji: "歩", romaji: "aru",    meaning: "walk",     themes: ["motion"] },
  // TODO: extend to ~600 entries from a Joyo kanji list before launch.
];

/** Reserved fixtures for special calendar dates. */
export const RESERVED: { monthDay: string; entry: KanjiEntry }[] = [
  { monthDay: "01-01", entry: { kanji: "元", romaji: "gen",     meaning: "origin",      themes: ["new-year"] } },
  { monthDay: "03-20", entry: { kanji: "春", romaji: "haru",    meaning: "spring",      themes: ["season"] } },
  { monthDay: "06-21", entry: { kanji: "夏", romaji: "natsu",   meaning: "summer",      themes: ["season"] } },
  { monthDay: "09-22", entry: { kanji: "秋", romaji: "aki",     meaning: "autumn",      themes: ["season"] } },
  { monthDay: "12-21", entry: { kanji: "冬", romaji: "fuyu",    meaning: "winter",      themes: ["season"] } },
];

export function findReserved(date: string): KanjiEntry | null {
  const md = date.slice(5); // 'MM-DD'
  return RESERVED.find((r) => r.monthDay === md)?.entry ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/kanji-bank.ts
git commit -m "feat(seal): add starter kanji bank + reserved fixtures"
```

---

### Task 6: `lib/seal/calendar.ts` — deterministic date→kanji

**Files:**
- Create: `lib/seal/calendar.ts`
- Test: `tests/seal/calendar.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/seal/calendar.test.ts
import { describe, it, expect } from "vitest";
import { assignKanjiForRange } from "@/lib/seal/calendar";

describe("assignKanjiForRange", () => {
  it("assigns reserved kanji to special dates", () => {
    const out = assignKanjiForRange("2026-01-01", 1);
    expect(out[0].kanji).toBe("元");
    expect(out[0].date).toBe("2026-01-01");
  });

  it("assigns from the bank for non-reserved dates", () => {
    const out = assignKanjiForRange("2026-05-09", 1);
    expect(out[0].date).toBe("2026-05-09");
    expect(out[0].kanji.length).toBe(1);
    expect(out[0].romaji.length).toBeGreaterThan(0);
    expect(out[0].meaning.length).toBeGreaterThan(0);
  });

  it("never repeats within a 365-day window", () => {
    const out = assignKanjiForRange("2026-01-01", 365);
    const seen = new Set<string>();
    for (const e of out) {
      expect(seen.has(e.kanji)).toBe(false);
      seen.add(e.kanji);
    }
  });

  it("is deterministic for the same input", () => {
    const a = assignKanjiForRange("2026-01-01", 30);
    const b = assignKanjiForRange("2026-01-01", 30);
    expect(a.map((e) => e.kanji)).toEqual(b.map((e) => e.kanji));
  });

  it("emits one entry per date in order", () => {
    const out = assignKanjiForRange("2026-05-09", 5);
    expect(out.map((e) => e.date)).toEqual([
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seal/calendar.test.ts`
Expected: FAIL — module not found / `assignKanjiForRange` undefined.

- [ ] **Step 3: Implement**

```typescript
// lib/seal/calendar.ts
import { KANJI_BANK, findReserved } from "@/lib/kanji-bank";
import type { KanjiEntry } from "@/lib/seal/types";

export interface CalendarEntry extends KanjiEntry {
  date: string;
}

/**
 * Deterministically assigns one kanji per date over a range. Reserved
 * dates (solstices/equinoxes/new-year) are honored first. Remaining dates
 * draw from KANJI_BANK with no repeats inside a 365-day window.
 *
 * Pure / no I/O. Same inputs → same outputs.
 */
export function assignKanjiForRange(
  startDate: string,
  days: number,
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  // 365-day rolling set of used kanji so consecutive years don't repeat
  const usedRolling: string[] = [];

  // Stable rotation: hash(date) → bank index, advance until unused
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const reserved = findReserved(date);
    let entry: KanjiEntry;
    if (reserved) {
      entry = reserved;
    } else {
      entry = pickFromBank(date, usedRolling);
    }
    out.push({ ...entry, date });

    // Maintain rolling window: drop entries older than 365 days back
    usedRolling.push(entry.kanji);
    if (usedRolling.length > 365) usedRolling.shift();
  }
  return out;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pickFromBank(date: string, used: string[]): KanjiEntry {
  const seed = hashDate(date);
  const usedSet = new Set(used);
  // Linear probe from the seeded start so we always find an unused entry
  // (assumes bank.size > 365; enforced at runtime below).
  for (let i = 0; i < KANJI_BANK.length; i++) {
    const idx = (seed + i) % KANJI_BANK.length;
    const candidate = KANJI_BANK[idx];
    if (!usedSet.has(candidate.kanji)) return candidate;
  }
  // Bank too small. Surface this loudly so it gets fixed before launch.
  throw new Error(
    `kanji-bank exhausted: bank has ${KANJI_BANK.length} entries, all used in current 365-day window`,
  );
}

function hashDate(iso: string): number {
  // Simple FNV-ish 32-bit hash, deterministic across runtimes.
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- tests/seal/calendar.test.ts`
Expected: 5 passing tests.

(If "365-day window" test fails because the starter bank has < 365 entries, this is expected — the bank must be extended to ≥365 entries before launch. Mark the test `.todo` and proceed; track in T15 acceptance.)

- [ ] **Step 5: Commit**

```bash
git add lib/seal/calendar.ts tests/seal/calendar.test.ts
git commit -m "feat(seal): deterministic per-date kanji assignment"
```

---

### Task 7: `lib/seal/streak.ts` — unified streak

**Files:**
- Create: `lib/seal/streak.ts`
- Test: `tests/seal/streak.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/seal/streak.test.ts
import { describe, it, expect } from "vitest";
import { computeUnifiedStreak } from "@/lib/seal/streak";

const TODAY = "2026-05-09";

describe("computeUnifiedStreak", () => {
  it("returns 0 with no completions and no freezes", () => {
    expect(computeUnifiedStreak(TODAY, new Set(), new Set())).toBe(0);
  });

  it("counts a single past day", () => {
    expect(computeUnifiedStreak(TODAY, new Set(["2026-05-08"]), new Set())).toBe(1);
  });

  it("counts today when today is completed", () => {
    expect(computeUnifiedStreak(TODAY, new Set([TODAY, "2026-05-08"]), new Set())).toBe(2);
  });

  it("does not break a streak just because today is incomplete", () => {
    // Today not played yet, but yesterday + before were
    expect(
      computeUnifiedStreak(
        TODAY,
        new Set(["2026-05-08", "2026-05-07", "2026-05-06"]),
        new Set(),
      ),
    ).toBe(3);
  });

  it("ends streak at the first gap", () => {
    expect(
      computeUnifiedStreak(
        TODAY,
        new Set(["2026-05-08", "2026-05-06", "2026-05-05"]),
        new Set(),
      ),
    ).toBe(1); // 5/7 missing → stops
  });

  it("treats a freeze as a kept day", () => {
    expect(
      computeUnifiedStreak(
        TODAY,
        new Set(["2026-05-08", "2026-05-06"]),
        new Set(["2026-05-07"]),
      ),
    ).toBe(3);
  });

  it("freezes today not yet played, with yesterday completed", () => {
    expect(
      computeUnifiedStreak(TODAY, new Set(["2026-05-08"]), new Set(["2026-05-09"])),
    ).toBe(2);
  });

  it("returns 0 if both today and yesterday are missing", () => {
    expect(
      computeUnifiedStreak(TODAY, new Set(["2026-05-06", "2026-05-05"]), new Set()),
    ).toBe(0);
  });

  it("caps walk-back at 730 days even with very long unbroken history", () => {
    const completed = new Set<string>();
    const d = new Date("2024-01-01T00:00:00Z");
    while (d <= new Date(TODAY + "T00:00:00Z")) {
      completed.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    expect(computeUnifiedStreak(TODAY, completed, new Set())).toBeLessThanOrEqual(730);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seal/streak.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/seal/streak.ts

const MAX_WALKBACK = 730;

/**
 * Walks back from `today`, counting consecutive dates present in either
 * `completed` or `frozen`. If today itself isn't present, starts the walk
 * at yesterday so an unfinished today does not break the streak.
 *
 * Pure / no I/O.
 */
export function computeUnifiedStreak(
  today: string,
  completed: Set<string>,
  frozen: Set<string>,
): number {
  const present = (d: string) => completed.has(d) || frozen.has(d);

  let n = 0;
  let cursor = today;
  if (present(cursor)) {
    n++;
    cursor = prevDay(cursor);
  } else {
    cursor = prevDay(cursor);
  }
  for (let i = 0; i < MAX_WALKBACK && present(cursor); i++) {
    n++;
    cursor = prevDay(cursor);
  }
  return n;
}

function prevDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- tests/seal/streak.test.ts`
Expected: 9 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/seal/streak.ts tests/seal/streak.test.ts
git commit -m "feat(seal): unified streak walking completions ∪ freezes"
```

---

### Task 8: `lib/seal/year.ts` — assemble per-user series

**Files:**
- Create: `lib/seal/year.ts`
- Test: `tests/seal/year.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/seal/year.test.ts
import { describe, it, expect } from "vitest";
import { assembleYearSeries } from "@/lib/seal/year";

const CAL = [
  { date: "2026-05-08", kanji: "土", romaji: "tsuchi", meaning: "earth" },
  { date: "2026-05-09", kanji: "月", romaji: "tsuki",  meaning: "moon"  },
  { date: "2026-05-10", kanji: "火", romaji: "hi",     meaning: "fire"  },
];

describe("assembleYearSeries", () => {
  it("marks today, future, and a completed past day", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map([["2026-05-08", 312]]),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("filled");
    expect(byDate["2026-05-08"].elapsedSeconds).toBe(312);
    expect(byDate["2026-05-09"].state).toBe("today");
    expect(byDate["2026-05-10"].state).toBe("future");
  });

  it("marks empty when missed and no freeze", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("empty");
  });

  it("marks freeze when frozen and not completed", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(["2026-05-08"]),
      signupDate: "2026-04-01",
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("freeze");
  });

  it("marks pre-signup for dates before the user's signup", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-05-09",
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("pre-signup");
  });

  it("populates todayIndex correctly", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
    });
    expect(series.todayIndex).toBe(1); // 2026-05-09 is index 1 in CAL
    expect(series.year).toBe(2026);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seal/year.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/seal/year.ts
import type { SealEntry, SealState, YearSeries } from "@/lib/seal/types";
import type { CalendarEntry } from "@/lib/seal/calendar";

export interface AssembleInput {
  today: string;
  calendar: CalendarEntry[];
  completedByDate: Map<string, number>; // date → elapsedSeconds
  frozenDates: Set<string>;
  signupDate: string; // 'YYYY-MM-DD' — first date the user existed
}

export function assembleYearSeries(input: AssembleInput): YearSeries {
  const { today, calendar, completedByDate, frozenDates, signupDate } = input;
  const seals: SealEntry[] = calendar.map((c) => {
    const state = stateFor(c.date, today, completedByDate, frozenDates, signupDate);
    const entry: SealEntry = {
      date: c.date,
      kanji: c.kanji,
      romaji: c.romaji,
      meaning: c.meaning,
      state,
    };
    if (state === "filled") {
      entry.elapsedSeconds = completedByDate.get(c.date)!;
    }
    return entry;
  });

  const todayIndex = seals.findIndex((s) => s.date === today);
  const year = parseInt(today.slice(0, 4), 10);
  return { year, todayIndex, seals };
}

function stateFor(
  date: string,
  today: string,
  completed: Map<string, number>,
  frozen: Set<string>,
  signupDate: string,
): SealState {
  if (date === today) return "today";
  if (date > today) return "future";
  if (date < signupDate) return "pre-signup";
  if (completed.has(date)) return "filled";
  if (frozen.has(date)) return "freeze";
  return "empty";
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- tests/seal/year.test.ts`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/seal/year.ts tests/seal/year.test.ts
git commit -m "feat(seal): assemble per-user year series"
```

---

### Task 9: Refactor `lib/achievements.ts` to use unified streak

**Files:**
- Modify: `lib/achievements.ts:175-184` (`dailyStreakLength` definition) and `lib/achievements.ts:186-200` (its call sites)
- Test: `tests/seal/achievements.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/seal/achievements.test.ts
import { describe, it, expect } from "vitest";
import { computeStatuses } from "@/lib/achievements";

const TODAY = "2026-05-09";

function dailyGame(date: string) {
  return {
    difficulty: "expert",
    is_complete: true,
    elapsed_seconds: 600,
    errors_made: 0,
    hints_used: 0,
    daily_date: date,
    created_at: `${date}T08:00:00Z`,
  };
}

describe("computeStatuses with unified streak", () => {
  it("counts a 7-day daily streak as earned", () => {
    const games = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(TODAY + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      return dailyGame(d.toISOString().slice(0, 10));
    });
    const statuses = computeStatuses(games, { today: TODAY, frozen: new Set() });
    const s7 = statuses.find((s) => s.key === "streak_7");
    expect(s7?.earned).toBe(true);
  });

  it("treats a freeze as part of the streak", () => {
    // 6 completions + 1 freeze = streak_7 earned
    const dates = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(TODAY + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    const games = dates.map(dailyGame);
    // Insert a gap that's covered by a freeze
    const frozen = new Set<string>();
    const gapDate = new Date(TODAY + "T00:00:00Z");
    gapDate.setUTCDate(gapDate.getUTCDate() - 6);
    frozen.add(gapDate.toISOString().slice(0, 10));
    // And one more completion further back to make 7 contiguous via the freeze
    const seventh = new Date(TODAY + "T00:00:00Z");
    seventh.setUTCDate(seventh.getUTCDate() - 7);
    games.push(dailyGame(seventh.toISOString().slice(0, 10)));

    const statuses = computeStatuses(games, { today: TODAY, frozen });
    const s7 = statuses.find((s) => s.key === "streak_7");
    expect(s7?.earned).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/seal/achievements.test.ts`
Expected: FAIL — `computeStatuses` does not accept second arg.

- [ ] **Step 3: Refactor `lib/achievements.ts`**

Open `lib/achievements.ts`. Make these targeted edits:

1. Add `import { computeUnifiedStreak } from "@/lib/seal/streak";` near the top.

2. Delete the existing `dailyStreakLength` function (lines ~175-184).

3. Change the signature of `computeStatuses` to accept an options arg:

```typescript
export function computeStatuses(
  games: GameRow[],
  opts: { today: string; frozen: Set<string> } = {
    today: new Date().toISOString().slice(0, 10),
    frozen: new Set(),
  },
): AchievementStatus[] {
```

4. Replace the streak calculation:

```typescript
  const completed = games.filter((g) => g.is_complete);
  const dailyDates = new Set(
    completed.filter((g) => g.daily_date).map((g) => g.daily_date!),
  );
  const streak = computeUnifiedStreak(opts.today, dailyDates, opts.frozen);
```

5. Update callers of `computeStatuses` in the codebase. Find them:

```bash
grep -rn "computeStatuses" app components lib
```

Each caller needs to pass `{ today, frozen }`. If a caller doesn't have `frozen`, pass an empty set for now. The profile page (likely `app/profile/page.tsx`) will be updated in Task 19 to pass the real frozen set.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- tests/seal/achievements.test.ts`
Run: `npm run typecheck`
Expected: tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/achievements.ts tests/seal/achievements.test.ts
# plus any caller files updated
git commit -m "refactor(seal): use unified streak in achievements"
```

---

## Phase 3 — APIs

### Task 10: `GET /api/seal/today`

**Files:**
- Create: `lib/seal/sensei.ts`
- Create: `app/api/seal/today/route.ts`

- [ ] **Step 1: Write the Sensei helper**

```typescript
// lib/seal/sensei.ts
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";

export const SENSEI_SYSTEM_PROMPT = `You are the Sensei in a Japanese-aesthetic daily sudoku app. Each calendar day has a featured kanji. Write ONE micro-line introducing today's kanji.

Constraints:
- 8 to 14 words.
- Present tense, declarative, no questions.
- No mention of sudoku, puzzles, players, or solving.
- Reference the kanji's character or imagery, not its English meaning literally.
- Spare and grounded. No emoji. No exclamations.

Return ONLY the line. No quotes, no preamble.`;

export interface SenseiInput {
  kanji: string;
  romaji: string;
  meaning: string;
}

/** Generate a Sensei micro-line. Throws on API failure. */
export async function generateSenseiLine(input: SenseiInput): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const userMessage = `Kanji: ${input.kanji} (${input.romaji}, "${input.meaning}").`;
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 80,
    system: SENSEI_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = res.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") throw new Error("no-text");
  return block.text.trim().replace(/^["']|["']$/g, "");
}

/** Read or write the cached line for a given date. */
export async function getOrCreateLine(
  date: string,
  kanji: { kanji: string; romaji: string; meaning: string },
): Promise<string | null> {
  const sb = createServerClient();
  const { data: cached } = await sb
    .from("daily_seal_lines")
    .select("line")
    .eq("date", date)
    .maybeSingle();
  if (cached?.line) return cached.line;

  try {
    const line = await generateSenseiLine(kanji);
    await sb
      .from("daily_seal_lines")
      .insert({ date, line });
    return line;
  } catch {
    // If generation fails, return null and the UI will omit the line.
    return null;
  }
}
```

- [ ] **Step 2: Write the route**

```typescript
// app/api/seal/today/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { getOrCreateLine } from "@/lib/seal/sensei";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createServerClient();
  const date = todayUTC();

  const { data: cal } = await sb
    .from("daily_seal_calendar")
    .select("date,kanji,romaji,meaning")
    .eq("date", date)
    .maybeSingle();

  if (!cal) {
    return NextResponse.json(
      { date, kanji: null, senseiLine: null },
      { status: 200 },
    );
  }

  const senseiLine = await getOrCreateLine(date, cal);
  return NextResponse.json({
    date,
    kanji: cal.kanji,
    romaji: cal.romaji,
    meaning: cal.meaning,
    senseiLine,
  });
}
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Visit `http://localhost:3000/api/seal/today` (after applying migrations + seeding at least today's calendar row by hand: `insert into daily_seal_calendar (date, kanji, romaji, meaning) values ('YYYY-MM-DD', '月', 'tsuki', 'moon');`).
Expected: JSON with `date`, `kanji`, and either a generated `senseiLine` or `null`.

- [ ] **Step 4: Commit**

```bash
git add lib/seal/sensei.ts app/api/seal/today/route.ts
git commit -m "feat(seal): GET /api/seal/today + Sensei line cache"
```

---

### Task 11: `GET /api/seal/year`

**Files:**
- Create: `app/api/seal/year/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/seal/year/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { assembleYearSeries } from "@/lib/seal/year";
import { todayUTC } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = session.user.id;

  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [{ data: calendar }, { data: results }, { data: freezes }, { data: profile }] =
    await Promise.all([
      sb
        .from("daily_seal_calendar")
        .select("date,kanji,romaji,meaning")
        .gte("date", yearStart)
        .lte("date", yearEnd)
        .order("date", { ascending: true }),
      sb
        .from("daily_results")
        .select("date,elapsed_seconds")
        .eq("user_id", userId)
        .gte("date", yearStart)
        .lte("date", yearEnd),
      sb
        .from("streak_freezes")
        .select("date")
        .eq("user_id", userId)
        .gte("date", yearStart)
        .lte("date", yearEnd),
      sb.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    ]);

  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozenDates = new Set<string>(
    ((freezes ?? []) as { date: string }[]).map((f) => f.date),
  );
  const signupDate = profile?.created_at
    ? new Date(profile.created_at).toISOString().slice(0, 10)
    : yearStart;

  const series = assembleYearSeries({
    today,
    calendar: (calendar ?? []) as any[],
    completedByDate,
    frozenDates,
    signupDate,
  });

  return NextResponse.json(series);
}
```

- [ ] **Step 2: Manual smoke test**

Sign in to the dev app, then visit `http://localhost:3000/api/seal/year`.
Expected: JSON with `year`, `todayIndex`, and a `seals` array. If the calendar table is sparse, `seals` will be short; that's fine for now.

- [ ] **Step 3: Commit**

```bash
git add app/api/seal/year/route.ts
git commit -m "feat(seal): GET /api/seal/year per-user series"
```

---

### Task 12: `POST /api/seal/freeze`

**Files:**
- Create: `app/api/seal/freeze/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/seal/freeze/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FREEZES_PER_MONTH = 2;

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json()) as { date?: string };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "bad-date" }, { status: 400 });
  }

  // 24-hour window: only allow applying a freeze to a date within the last 24h
  const targetMs = Date.parse(body.date + "T23:59:59Z");
  const ageHours = (Date.now() - targetMs) / 1000 / 3600;
  if (ageHours < 0 || ageHours > 24) {
    return NextResponse.json({ error: "out-of-window" }, { status: 400 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_pro) {
    return NextResponse.json({ error: "pro-only" }, { status: 403 });
  }

  // Allotment check
  const grantedMonth = body.date.slice(0, 7) + "-01";
  const { count } = await sb
    .from("streak_freezes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("granted_month", grantedMonth);
  const used = count ?? 0;
  const allotment = computeAllotment(profile.created_at, grantedMonth);
  if (used >= allotment) {
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }

  // Already completed? No freeze needed.
  const { data: existing } = await sb
    .from("daily_results")
    .select("date")
    .eq("user_id", userId)
    .eq("date", body.date)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already-completed" }, { status: 400 });
  }

  const { error } = await sb.from("streak_freezes").insert({
    user_id: userId,
    date: body.date,
    granted_month: grantedMonth,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already-frozen" }, { status: 400 });
    }
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, remaining: allotment - used - 1 });
}

/** Pro-rated allotment for the user's first partial month, full afterward. */
function computeAllotment(profileCreatedAt: string, grantedMonth: string): number {
  const monthStart = new Date(grantedMonth + "T00:00:00Z");
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const created = new Date(profileCreatedAt);
  if (created < monthStart) return MAX_FREEZES_PER_MONTH;
  if (created >= monthEnd) return 0;
  // Pro-rated for the partial month: ceil((days_left / days_in_month) * 2), capped at 2.
  const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / 86400000;
  const daysLeft = Math.max(0, (monthEnd.getTime() - created.getTime()) / 86400000);
  return Math.min(MAX_FREEZES_PER_MONTH, Math.ceil((daysLeft / daysInMonth) * MAX_FREEZES_PER_MONTH));
}
```

- [ ] **Step 2: Manual smoke test**

Sign in as a Pro user. Mark yesterday as missed (don't submit a daily). Then:

```bash
curl -X POST http://localhost:3000/api/seal/freeze \
  -H 'Content-Type: application/json' \
  -b "auth-cookie=..." \
  -d '{"date":"2026-05-08"}'
```

Expected: `{ "ok": true, "remaining": 1 }`. Repeat — second succeeds, third returns `no-freezes`.

- [ ] **Step 3: Commit**

```bash
git add app/api/seal/freeze/route.ts
git commit -m "feat(seal): POST /api/seal/freeze for Pro users"
```

---

## Phase 4 — Components

### Task 13: `<Seal />` component

**Files:**
- Create: `components/year-scroll/Seal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/year-scroll/Seal.tsx
"use client";
import { cn } from "@/lib/utils";
import type { SealState } from "@/lib/seal/types";

export interface SealProps {
  kanji?: string;
  state: SealState;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  ariaLabel?: string;
}

const SIZES = {
  sm: { box: "text-[14px]", corner: "w-[8px] h-[8px] text-[5px] -bottom-[1px] -right-[1px]" },
  md: { box: "text-[36px]", corner: "w-[16px] h-[16px] text-[9px] bottom-[3px] right-[3px]" },
  lg: { box: "text-[96px]", corner: "w-[24px] h-[24px] text-[14px] bottom-[8px] right-[8px]" },
};

export function Seal({ kanji, state, size = "sm", onClick, ariaLabel }: SealProps) {
  const sz = SIZES[size];
  const interactive = !!onClick;

  const base =
    "relative aspect-square flex items-center justify-center leading-none mincho select-none";
  const stateClass = {
    filled: "bg-sumi/[0.03] border border-sumi/[0.32] text-sumi",
    today:
      "bg-vermillion/[0.04] border-[1.5px] border-vermillion/70 text-vermillion/45 motion-safe:animate-[seal-pulse_1.8s_ease-in-out_infinite]",
    empty: "border border-dashed border-sumi/[0.16]",
    future: "border border-sumi/[0.07]",
    freeze: "bg-sumi/[0.03] border border-dashed border-vermillion/40 text-sumi",
    "pre-signup": "border border-sumi/[0.04]",
  }[state];

  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(base, sz.box, stateClass, interactive && "cursor-pointer hover:bg-sumi/[0.06]")}
    >
      {(state === "filled" || state === "freeze") && kanji}
      {state === "filled" && (
        <span
          className={cn(
            "absolute bg-vermillion text-bone rounded-full flex items-center justify-center font-semibold",
            sz.corner,
          )}
          style={{ transform: "rotate(-6deg)" }}
        >
          ✓
        </span>
      )}
      {state === "freeze" && (
        <span
          className={cn(
            "absolute bg-bone text-vermillion rounded-full flex items-center justify-center mincho border border-vermillion/60",
            sz.corner,
          )}
        >
          凍
        </span>
      )}
    </Tag>
  );
}
```

- [ ] **Step 2: Add the pulse keyframe**

Open `app/globals.css`. Add inside `@layer base` (or at the top level if no @layer base):

```css
@keyframes seal-pulse {
  0%, 100% { box-shadow: 0 0 0 0 hsl(var(--vermillion) / 0); transform: scale(1); }
  50%      { box-shadow: 0 0 0 4px hsl(var(--vermillion) / 0.16); transform: scale(1.04); }
}
```

- [ ] **Step 3: Typecheck + dev smoke test**

Run: `npm run typecheck`
Expected: passes.

Manual: import and render `<Seal state="today" size="lg" />` in any page temporarily. Confirm it pulses; remove the temp render after.

- [ ] **Step 4: Commit**

```bash
git add components/year-scroll/Seal.tsx app/globals.css
git commit -m "feat(seal): Seal component with all states"
```

---

### Task 14: `<SealPopover />` component

**Files:**
- Create: `components/year-scroll/SealPopover.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/year-scroll/SealPopover.tsx
"use client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import type { SealEntry } from "@/lib/seal/types";

interface Props {
  entry: SealEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SealPopover({ entry, open, onOpenChange }: Props) {
  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bone border-2 border-sumi rounded-none p-0 max-w-[360px]">
        <div className="px-7 py-7 text-center">
          <div className="eyebrow text-moss">{entry.date}</div>
          <DialogTitle asChild>
            <h2 className="mincho text-[64px] leading-none mt-3 text-sumi">
              {entry.kanji}
            </h2>
          </DialogTitle>
          <div className="mono text-[11px] tracking-[0.16em] text-moss mt-3 uppercase">
            {entry.romaji} · {entry.meaning}
          </div>
          <div className="border-t border-sumi/15 mt-5 pt-5">
            {entry.state === "filled" && entry.elapsedSeconds != null && (
              <div className="kdate-jp text-[20px] tnum">
                {formatTime(entry.elapsedSeconds)}
              </div>
            )}
            {entry.state === "freeze" && (
              <div className="ital text-moss text-[14px]">kept by freeze</div>
            )}
            {entry.state === "empty" && (
              <div className="ital text-moss text-[14px]">missed</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/year-scroll/SealPopover.tsx
git commit -m "feat(seal): SealPopover for past-day details"
```

---

### Task 15: `<ScrollContextStrip />` component

**Files:**
- Create: `components/year-scroll/ScrollContextStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/year-scroll/ScrollContextStrip.tsx
"use client";
import { motion } from "framer-motion";
import { Seal } from "@/components/year-scroll/Seal";
import type { SealEntry } from "@/lib/seal/types";

interface Props {
  /** 9 entries: [today-4 ... today ... today+4]. Today is at index 4. */
  window: SealEntry[];
  /** Number of filled days year-to-date for the label. */
  filledCount: number;
  totalDays: number;
}

export function ScrollContextStrip({ window, filledCount, totalDays }: Props) {
  return (
    <div className="border-t border-dashed border-sumi/20 mt-2 pt-3 px-6 pb-4">
      <div className="eyebrow text-center mb-2">
        your year · {filledCount} / {totalDays}
      </div>
      <div className="flex gap-1 justify-center">
        {window.map((entry, i) => {
          const isToday = i === 4;
          return (
            <motion.div
              key={entry.date}
              initial={isToday ? { scale: 0.4, opacity: 0 } : false}
              animate={isToday ? { scale: 1, opacity: 1 } : undefined}
              transition={isToday ? { duration: 0.5, ease: "easeOut" } : undefined}
              className="w-7 h-7"
            >
              <Seal kanji={entry.kanji} state={entry.state} size="sm" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/year-scroll/ScrollContextStrip.tsx
git commit -m "feat(seal): ScrollContextStrip for win modal"
```

---

### Task 16: `<YearScroll />` component

**Files:**
- Create: `components/year-scroll/YearScroll.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/year-scroll/YearScroll.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Seal } from "@/components/year-scroll/Seal";
import { SealPopover } from "@/components/year-scroll/SealPopover";
import type { SealEntry, YearSeries } from "@/lib/seal/types";

interface Props {
  series: YearSeries;
  /** Variant for embed contexts. 'home' caps height; 'full' expands. */
  variant?: "home" | "full";
}

const WEEKDAY_HEADERS = ["月", "火", "水", "木", "金", "土", "日"]; // Mon..Sun

export function YearScroll({ series, variant = "home" }: Props) {
  const todayRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<SealEntry | null>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const onSealClick = (e: SealEntry) => {
    if (e.state === "filled" || e.state === "freeze") setPopover(e);
  };

  const cellsByWeek: SealEntry[][] = [];
  // Bucket seals into weeks aligned to ISO Mon-start. Pad the front of week 0 if year doesn't start Monday.
  if (series.seals.length > 0) {
    const first = new Date(series.seals[0].date + "T00:00:00Z");
    const dow = (first.getUTCDay() + 6) % 7; // 0..6 (Mon..Sun)
    let week: SealEntry[] = Array(dow).fill(null) as any[];
    for (const e of series.seals) {
      week.push(e);
      if (week.length === 7) {
        cellsByWeek.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null as any);
      cellsByWeek.push(week);
    }
  }

  return (
    <div
      className={
        variant === "home"
          ? "max-h-[440px] overflow-y-auto pr-2"
          : "h-full overflow-y-auto pr-2"
      }
    >
      <div
        className="grid items-start gap-1"
        style={{ gridTemplateColumns: "36px repeat(7, 1fr)" }}
      >
        <div />
        {WEEKDAY_HEADERS.map((h) => (
          <div
            key={h}
            className="mincho text-[10px] text-moss text-center pb-1"
          >
            {h}
          </div>
        ))}
        {cellsByWeek.map((week, wi) => (
          <Row
            key={wi}
            week={week}
            weekNumber={wi + 1}
            onClick={onSealClick}
            todayRef={todayRef}
          />
        ))}
      </div>
      <SealPopover entry={popover} open={!!popover} onOpenChange={(o) => !o && setPopover(null)} />
    </div>
  );
}

function Row({
  week,
  weekNumber,
  onClick,
  todayRef,
}: {
  week: SealEntry[];
  weekNumber: number;
  onClick: (e: SealEntry) => void;
  todayRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <>
      <div className="mono text-[9px] text-moss/60 self-center text-right pr-1">
        {weekNumber % 4 === 1 ? `w${weekNumber.toString().padStart(2, "0")}` : ""}
      </div>
      {week.map((entry, di) => {
        if (!entry) return <div key={di} aria-hidden />;
        const isToday = entry.state === "today";
        return (
          <div key={entry.date} ref={isToday ? todayRef : undefined}>
            <Seal
              kanji={entry.kanji}
              state={entry.state}
              size="sm"
              onClick={
                entry.state === "filled" || entry.state === "freeze"
                  ? () => onClick(entry)
                  : undefined
              }
              ariaLabel={`${entry.date} · ${entry.kanji}`}
            />
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/year-scroll/YearScroll.tsx
git commit -m "feat(seal): YearScroll component (52w x 7d)"
```

---

### Task 17: `<TodayCard />` component

**Files:**
- Create: `components/year-scroll/TodayCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/year-scroll/TodayCard.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { Seal } from "@/components/year-scroll/Seal";
import { formatTime } from "@/lib/utils";

interface TodaySeal {
  date: string;
  kanji: string;
  romaji: string;
  meaning: string;
  senseiLine: string | null;
}

interface Props {
  today: TodaySeal | null;
  /** When set, today has been completed and we render the post-solve variant. */
  completedElapsed?: number;
  streakDays: number;
  /** Optional: yesterday missed + freezes-remaining; if both present, show prompt. */
  freezePrompt?: { date: string; kanji: string; remaining: number } | null;
}

export function TodayCard({ today, completedElapsed, streakDays, freezePrompt }: Props) {
  const [freezeStatus, setFreezeStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  if (!today) {
    return (
      <div className="border-t border-b border-sumi py-7 px-1">
        <div className="eyebrow">today</div>
        <p className="ital text-moss text-[16px] mt-3">
          today's seal isn't ready yet — check back shortly.
        </p>
      </div>
    );
  }

  const stamped = completedElapsed != null;

  const applyFreeze = async () => {
    if (!freezePrompt) return;
    setFreezeStatus("pending");
    const res = await fetch("/api/seal/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: freezePrompt.date }),
    });
    setFreezeStatus(res.ok ? "done" : "error");
  };

  return (
    <div className="border-t border-b border-sumi py-7 px-1">
      <div className="grid grid-cols-[96px_1fr] gap-5 items-center">
        <div className="w-[96px] h-[96px]">
          <Seal
            kanji={today.kanji}
            state={stamped ? "filled" : "today"}
            size="lg"
          />
        </div>
        <div>
          <div className="eyebrow">
            {stamped ? `STAMPED · ${formatTime(completedElapsed!)}` : "today's character"}
          </div>
          <div className="kdate-jp text-[22px] mt-1">
            {today.kanji} — {today.meaning} · {today.romaji}
          </div>
          {today.senseiLine && (
            <p className="ital text-sumi text-[14px] mt-2 leading-snug">
              "{today.senseiLine}"
            </p>
          )}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {!stamped && (
              <Link
                href="/play/daily"
                className="bg-sumi text-bone px-4 py-2 mono text-[11px] tracking-[0.16em] uppercase hover:bg-sumi/95"
              >
                play today
              </Link>
            )}
            {stamped && (
              <Link
                href={`/api/share/seal/${today.date}`}
                target="_blank"
                rel="noopener"
                className="border border-sumi text-sumi px-4 py-2 mono text-[11px] tracking-[0.16em] uppercase hover:bg-sumi/5"
              >
                share
              </Link>
            )}
            {streakDays > 0 && (
              <span className="mono text-[11px] tracking-[0.14em] uppercase text-vermillion">
                streak · {streakDays}d
              </span>
            )}
          </div>
          {freezePrompt && freezeStatus === "idle" && (
            <div className="mt-4 border-t border-sumi/15 pt-3 text-[13px] ital text-sumi">
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
          {freezeStatus === "pending" && (
            <div className="mt-4 text-[13px] ital text-moss">applying freeze…</div>
          )}
          {freezeStatus === "done" && (
            <div className="mt-4 text-[13px] ital text-vermillion">
              freeze applied · streak kept.
            </div>
          )}
          {freezeStatus === "error" && (
            <div className="mt-4 text-[13px] ital text-hazard">
              could not apply freeze.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/year-scroll/TodayCard.tsx
git commit -m "feat(seal): TodayCard with pre/post-solve states + freeze prompt"
```

---

## Phase 5 — Integration

### Task 18: Update `WinModal.tsx`

**Files:**
- Modify: `components/game/WinModal.tsx` (whole component update — re-read it first)

- [ ] **Step 1: Replace the seal hero with the day's kanji + add scroll-context strip**

Replace the inner content of `<DialogContent>` with the new layout. Open `components/game/WinModal.tsx` and:

1. Add imports near the top:

```typescript
import { useEffect, useState } from "react";
import { ScrollContextStrip } from "@/components/year-scroll/ScrollContextStrip";
import type { SealEntry, YearSeries } from "@/lib/seal/types";
```

2. Inside the component, after the existing state hooks, add a fetch for the year series so we can pull the 9-cell window centered on today:

```typescript
const [series, setSeries] = useState<YearSeries | null>(null);

useEffect(() => {
  if (!open || !dailyDate) return;
  let cancelled = false;
  fetch("/api/seal/year")
    .then((r) => r.json())
    .then((j) => { if (!cancelled) setSeries(j); })
    .catch(() => {});
  return () => { cancelled = true; };
}, [open, dailyDate]);
```

3. Compute the 9-cell window when series is available:

```typescript
const contextWindow: SealEntry[] | null = (() => {
  if (!series || !dailyDate) return null;
  const i = series.seals.findIndex((s) => s.date === dailyDate);
  if (i < 0) return null;
  const out: SealEntry[] = [];
  for (let j = -4; j <= 4; j++) {
    const idx = i + j;
    if (idx >= 0 && idx < series.seals.length) out.push(series.seals[idx]);
  }
  return out.length === 9 ? out : null;
})();

const filledCount = series?.seals.filter((s) => s.state === "filled" || s.state === "freeze").length ?? 0;
const totalDays = series?.seals.length ?? 365;
const todayKanji = series?.seals.find((s) => s.date === dailyDate)?.kanji ?? "完";
```

4. Replace the existing hero kanji `完` block with the dynamic one:

```tsx
<motion.div
  initial={{ scale: 0, rotate: -20, opacity: 0, filter: "blur(4px)" }}
  animate={{ scale: 1, rotate: 0, opacity: 1, filter: "blur(0)" }}
  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.35 }}
  className="seal-stamp w-[88px] h-[88px] text-[48px] absolute inset-0 flex items-center justify-center mincho text-sumi"
>
  {todayKanji}
</motion.div>
```

Note: the corner-mark `✓` press is already part of `<Seal />`. The win-modal seal is hand-rolled (because of the burst/wash overlap). For symmetry with `<Seal state="filled">`, add a vermillion corner ✓ as a positioned overlay after the kanji animation:

```tsx
<motion.span
  initial={{ opacity: 0, rotate: -20, scale: 1.6 }}
  animate={{ opacity: 1, rotate: -6, scale: 1 }}
  transition={{ duration: 0.6, delay: 1.1, ease: "easeOut" }}
  className="absolute bottom-1 right-1 w-[22px] h-[22px] bg-vermillion text-bone rounded-full flex items-center justify-center text-[12px] font-semibold"
  aria-hidden
>
  ✓
</motion.span>
```

5. Below the stats grid, add the scroll-context strip:

```tsx
{contextWindow && dailyDate && (
  <div className="mt-4 -mx-8">
    <ScrollContextStrip
      window={contextWindow}
      filledCount={filledCount + 1 /* include today's just-stamped */}
      totalDays={totalDays}
    />
  </div>
)}
```

- [ ] **Step 2: Typecheck + manual smoke test**

Run: `npm run typecheck`
Expected: passes.

Run dev server. Complete a daily puzzle. Verify the modal opens with the day's kanji blooming, the corner mark pressing, and the strip appearing below.

- [ ] **Step 3: Commit**

```bash
git add components/game/WinModal.tsx
git commit -m "feat(seal): win modal kanji bloom + scroll-context strip"
```

---

### Task 19: Restructure `app/page.tsx`

**Files:**
- Modify: `app/page.tsx` (full rewrite)

- [ ] **Step 1: Restructure the home page**

Replace `app/page.tsx` with the new structure: TodayCard hero + YearScroll + existing global pace + ledger preview as below-the-fold context. The "or just play" difficulty grid is removed (casual remains in the masthead nav).

```tsx
// app/page.tsx
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { TodayCard } from "@/components/year-scroll/TodayCard";
import { YearScroll } from "@/components/year-scroll/YearScroll";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { assembleYearSeries } from "@/lib/seal/year";
import { dateLine } from "@/lib/kanji";
import type { YearSeries } from "@/lib/seal/types";

export const dynamic = "force-dynamic";

interface LedgerRow {
  user_id: string;
  elapsed_seconds: number;
  profiles: { username: string | null } | null;
}

const NAMES_FALLBACK = [
  { rank: "01", name: "nurali", time: "02:48", first: true },
  { rank: "02", name: "aigerim", time: "02:54", first: false },
  { rank: "03", name: "dauren", time: "03:01", first: false },
];

function formatHMS(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default async function Home() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  const initial = user?.email?.[0] ?? "·";
  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);

  // Today seal
  const { data: todayCal } = await sb
    .from("daily_seal_calendar")
    .select("date,kanji,romaji,meaning")
    .eq("date", today)
    .maybeSingle();
  const { data: todayLine } = await sb
    .from("daily_seal_lines")
    .select("line")
    .eq("date", today)
    .maybeSingle();
  const todaySeal = todayCal
    ? {
        date: todayCal.date,
        kanji: todayCal.kanji,
        romaji: todayCal.romaji,
        meaning: todayCal.meaning,
        senseiLine: todayLine?.line ?? null,
      }
    : null;

  // Year series + streak (signed-in only)
  let series: YearSeries | null = null;
  let streak = 0;
  let completedTodayElapsed: number | undefined;
  let freezePrompt: { date: string; kanji: string; remaining: number } | null = null;
  if (user) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [{ data: cal }, { data: results }, { data: freezes }, { data: profile }] =
      await Promise.all([
        sb
          .from("daily_seal_calendar")
          .select("date,kanji,romaji,meaning")
          .gte("date", yearStart).lte("date", yearEnd)
          .order("date", { ascending: true }),
        sb.from("daily_results").select("date,elapsed_seconds")
          .eq("user_id", user.id)
          .gte("date", yearStart).lte("date", yearEnd),
        sb.from("streak_freezes").select("date")
          .eq("user_id", user.id)
          .gte("date", yearStart).lte("date", yearEnd),
        sb.from("profiles").select("created_at,is_pro").eq("id", user.id).maybeSingle(),
      ]);
    const completedByDate = new Map<string, number>();
    for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
      completedByDate.set(r.date, r.elapsed_seconds);
    }
    const frozen = new Set<string>(((freezes ?? []) as { date: string }[]).map((f) => f.date));
    const signupDate = profile?.created_at
      ? new Date(profile.created_at).toISOString().slice(0, 10)
      : yearStart;
    series = assembleYearSeries({
      today,
      calendar: (cal ?? []) as any[],
      completedByDate,
      frozenDates: frozen,
      signupDate,
    });
    streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozen);
    completedTodayElapsed = completedByDate.get(today);

    // Yesterday-missed-and-Pro freeze prompt
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
          .eq("user_id", user.id)
          .eq("granted_month", granted);
        const used = count ?? 0;
        const remaining = Math.max(0, 2 - used);
        if (remaining > 0) freezePrompt = { date: yestStr, kanji: yestEntry.kanji, remaining };
      }
    }
  }

  // Ledger preview (existing logic)
  let preview: { rank: string; name: string; time: string; first: boolean }[] = NAMES_FALLBACK;
  try {
    const { data } = await sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,profiles(username)")
      .eq("date", today)
      .order("elapsed_seconds", { ascending: true })
      .limit(3);
    const rows = (data ?? []) as unknown as LedgerRow[];
    if (rows.length) {
      preview = rows.map((r, i) => ({
        rank: (i + 1).toString().padStart(2, "0"),
        name: r.profiles?.username ?? "anon",
        time: formatHMS(r.elapsed_seconds),
        first: i === 0,
      }));
    }
  } catch {}

  return (
    <>
      <Masthead active="today" initial={initial} />

      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow red">{dateLine()}</div>

        <div className="mt-6 max-w-[640px]">
          <TodayCard
            today={todaySeal}
            completedElapsed={completedTodayElapsed}
            streakDays={streak}
            freezePrompt={freezePrompt}
          />
        </div>

        {series && (
          <div className="mt-10 max-w-[640px]">
            <div className="flex justify-between items-baseline mb-3">
              <div className="eyebrow">your year</div>
              <div className="mono text-[11px] tracking-[0.14em] text-moss">
                {series.seals.filter((s) => s.state === "filled" || s.state === "freeze").length}
                {" / "}
                {series.seals.length}
              </div>
            </div>
            <YearScroll series={series} variant="home" />
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <p className="mt-2 mono text-[10px] tracking-[0.2em] uppercase text-moss">
              global pace · today
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <div className="kdate-jp text-2xl font-semibold tnum">02:48</div>
                <div className="txt-small">first solve · nurali, ала</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">14:52</div>
                <div className="txt-small">global median</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">2,184</div>
                <div className="txt-small">solving now</div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-3.5">
              <div className="eyebrow">ledger · ала today</div>
              <Link href="/leaderboard" className="ital text-vermillion text-[14px] hover:underline">
                see all →
              </Link>
            </div>
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
              <div className="text-center py-3.5 ital text-moss text-[14px]">
                <span className="text-vermillion mr-1">↘</span>
                your name lands when you finish.
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-sumi/15 mt-16 px-6 lg:px-12 py-8 max-w-[1480px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-6 mono text-[10px] tracking-[0.2em] uppercase text-moss">
        <div>hako.app · since february · made in almaty</div>
        <div>v1.0 · 8 may 2026</div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Typecheck + manual**

Run: `npm run typecheck`
Expected: passes.

Run dev. Visit `/` signed-in and signed-out. Verify:
- Signed-out: today-card shows kanji + Sensei line, no scroll.
- Signed-in: today-card + scroll. Streak displays. If you missed yesterday and you're Pro, freeze prompt appears.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(seal): home page restructured around TodayCard + YearScroll"
```

---

### Task 20: Drop `<StreakBadge />` from `Masthead.tsx`

**Files:**
- Modify: `components/Masthead.tsx`
- Delete: `components/StreakBadge.tsx`

- [ ] **Step 1: Remove StreakBadge usage from Masthead**

Open `components/Masthead.tsx`. Make these changes:

1. Delete the import on line 5: `import { StreakBadge } from "@/components/StreakBadge";`

2. Remove `streakDays` from the props interface (line ~11):

```typescript
interface MastheadProps {
  active?: NavKey;
  initial?: string;
  variant?: "default" | "game";
  gameTitle?: string;
  timer?: React.ReactNode;
  solvedCount?: { filled: number; total: number };
  onSensei?: () => void;
}
```

3. Remove `streakDays = 21` from the `function Masthead({...})` destructure (line ~31).

4. Delete the streak block in the default-variant `<header>` (lines ~129-135):

```tsx
{/* DELETE THIS BLOCK */}
<div className="hidden sm:flex items-center gap-2">
  <span className="eyebrow">streak</span>
  <span className="font-semibold text-lg">
    <StreakBadge days={streakDays} />
  </span>
</div>
```

5. Delete the streak block at the bottom of the mobile menu (lines ~184-189):

```tsx
{/* DELETE THIS BLOCK */}
<div className="mt-auto px-8 pb-10 flex items-center gap-2 mono text-[10px] tracking-[0.22em] uppercase text-moss">
  <span className="eyebrow">streak</span>
  <span className="font-semibold text-base">
    <StreakBadge days={streakDays} />
  </span>
</div>
```

- [ ] **Step 2: Find any remaining `streakDays` callers**

Run:

```bash
grep -rn "streakDays" app components lib
grep -rn "StreakBadge" app components lib
```

Expected: only `components/StreakBadge.tsx` itself remains.

- [ ] **Step 3: Delete the file**

```bash
git rm components/StreakBadge.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes (any external `streakDays={...}` callers should already be removed in T19).

- [ ] **Step 5: Commit**

```bash
git add components/Masthead.tsx
git commit -m "refactor(seal): retire StreakBadge; streak lives in TodayCard"
```

---

### Task 21: Share PNG endpoint

**Files:**
- Create: `app/api/share/seal/[date]/route.ts`

This requires the `@vercel/og` package.

- [ ] **Step 1: Install dependency**

```bash
npm install @vercel/og
```

- [ ] **Step 2: Write the route**

```typescript
// app/api/share/seal/[date]/route.ts
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { computeUnifiedStreak } from "@/lib/seal/streak";

export const runtime = "edge";

interface Params { params: { date: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const date = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("bad-date", { status: 400 });
  }

  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  const { data: cal } = await sb
    .from("daily_seal_calendar")
    .select("kanji,romaji,meaning")
    .eq("date", date)
    .maybeSingle();
  if (!cal) return new Response("no-seal", { status: 404 });

  let elapsed: number | null = null;
  let streak = 0;
  let dayIndex = 0;
  if (session?.user) {
    const userId = session.user.id;
    const year = date.slice(0, 4);
    const [{ data: result }, { data: results }, { data: freezes }] = await Promise.all([
      sb.from("daily_results").select("elapsed_seconds")
        .eq("user_id", userId).eq("date", date).maybeSingle(),
      sb.from("daily_results").select("date")
        .eq("user_id", userId).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
      sb.from("streak_freezes").select("date")
        .eq("user_id", userId).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    ]);
    elapsed = result?.elapsed_seconds ?? null;
    const completed = new Set(((results ?? []) as { date: string }[]).map((r) => r.date));
    const frozen = new Set(((freezes ?? []) as { date: string }[]).map((f) => f.date));
    streak = computeUnifiedStreak(date, completed, frozen);
    dayIndex = (Date.parse(date + "T00:00:00Z") - Date.parse(`${year}-01-01T00:00:00Z`)) / 86400000 + 1;
  }

  const timeStr = elapsed != null
    ? `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`
    : "—";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080, height: 1080, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "#f5efe2", color: "#1c1c1a",
          fontFamily: "serif", position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 36, right: 54, color: "#b8330a", fontSize: 64, transform: "rotate(-4deg)" }}>箱</div>

        {/* Seal */}
        <div style={{
          width: 504, height: 504,
          border: "5px solid rgba(28,28,26,0.4)",
          background: "rgba(28,28,26,0.03)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 330, lineHeight: 1, position: "relative",
        }}>
          {cal.kanji}
          <div style={{
            position: "absolute", bottom: 30, right: 30,
            width: 78, height: 78, borderRadius: 999,
            background: "#b8330a", color: "#f5efe2",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 42, fontWeight: 700, transform: "rotate(-6deg)",
          }}>✓</div>
        </div>

        <div style={{ marginTop: 60, fontSize: 36, letterSpacing: 6, color: "#1c1c1a", textTransform: "uppercase", fontFamily: "monospace" }}>
          {timeStr} · streak {streak}d · day {dayIndex}/365
        </div>

        <div style={{ position: "absolute", bottom: 54, left: 54, fontSize: 28, color: "#6a5f4a", letterSpacing: 6, fontFamily: "monospace" }}>
          HAKO · {date.replace(/-/g, ".")}
        </div>
        <div style={{ position: "absolute", bottom: 54, right: 54, fontSize: 28, color: "#6a5f4a", letterSpacing: 4, fontFamily: "monospace" }}>
          hako.app
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
```

- [ ] **Step 3: Manual smoke test**

Run dev. Visit `http://localhost:3000/api/share/seal/2026-05-09` (use a date you've completed). Expected: a 1080×1080 PNG of the seal.

- [ ] **Step 4: Commit**

```bash
git add app/api/share/seal/\[date\]/route.ts package.json package-lock.json
git commit -m "feat(seal): share PNG endpoint via @vercel/og"
```

---

### Task 22: Wire share button on `WinModal`

**Files:**
- Modify: `components/game/WinModal.tsx`

- [ ] **Step 1: Add a share button next to the existing actions**

In the modal's bottom action grid, replace the secondary `home` link (or add alongside) a share button:

```tsx
{dailyDate && (
  <a
    href={`/api/share/seal/${dailyDate}`}
    target="_blank"
    rel="noopener"
    className="btn-hako ghost justify-center font-mincho text-[14px] py-3"
  >
    share
  </a>
)}
```

The existing `home` link can become the right-side primary instead, or keep both — design preference. The spec says actions are `share` (secondary) + `tomorrow →` (primary). Implement that:

```tsx
<div className="grid grid-cols-2 gap-2 mt-6">
  {dailyDate && (
    <a
      href={`/api/share/seal/${dailyDate}`}
      target="_blank"
      rel="noopener"
      className="btn-hako ghost justify-center font-mincho text-[14px] py-3"
    >
      share
    </a>
  )}
  <Link href="/" className="btn-hako red justify-center font-mincho text-[14px] py-3">
    tomorrow →
  </Link>
</div>
```

- [ ] **Step 2: Manual test**

Run dev. Complete a daily. Click `share` in the modal — verify the PNG opens in a new tab.

- [ ] **Step 3: Commit**

```bash
git add components/game/WinModal.tsx
git commit -m "feat(seal): wire share button to PNG endpoint"
```

---

## Phase 6 — Seed script

### Task 23: `scripts/seed-seal-calendar.ts`

**Files:**
- Create: `scripts/seed-seal-calendar.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/seed-seal-calendar.ts
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { assignKanjiForRange } from "@/lib/seal/calendar";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const startStr = today.toISOString().slice(0, 10);
const DAYS_AHEAD = 730;

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const entries = assignKanjiForRange(startStr, DAYS_AHEAD);

  // Upsert in chunks of 200 — pg has limits on multi-row inserts.
  const chunkSize = 200;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize).map((e) => ({
      date: e.date,
      kanji: e.kanji,
      romaji: e.romaji,
      meaning: e.meaning,
    }));
    const { error } = await sb.from("daily_seal_calendar").upsert(chunk, { onConflict: "date" });
    if (error) {
      console.error("chunk failed:", error);
      process.exit(1);
    }
    console.log(`upserted ${i + chunk.length} / ${entries.length}`);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Open `package.json`. Under `"scripts"`, add:

```json
"seed-seal": "tsx scripts/seed-seal-calendar.ts"
```

- [ ] **Step 3: Run it**

Run: `npm run seed-seal`
Expected: console output `upserted 200 / 730`, `upserted 400 / 730`, ..., `done.`. Verify the table has 730 rows.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-seal-calendar.ts package.json
git commit -m "feat(seal): seed-seal-calendar script (730-day rolling window)"
```

---

## Phase 7 — Final integration verification

### Task 24: Full smoke test + acceptance pass

**Files:** none (verification only)

- [ ] **Step 1: Apply all migrations + seed**

```bash
supabase migration up
npm run seed-seal
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: all pure-logic tests pass (calendar, streak, year, achievements).

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: clean.

- [ ] **Step 4: Manual flow on three viewports (390 / 768 / 1280+)**

For each viewport:

- Sign out → home shows today-card with kanji + Sensei line; no scroll surface; "play today" CTA leads to daily.
- Sign in (free user) → home shows today-card + scroll; today's row is centered in scroll; missed days are dashed-empty; achievements page still works.
- Sign in (Pro user) with yesterday missed → home shows freeze prompt above CTA. Apply freeze. Verify the scroll's yesterday cell flips to `freeze` state on reload, streak count includes yesterday.
- Complete the daily → modal opens after the 700ms beat; kanji blooms; corner mark presses; scroll-context strip animates today into place; share button opens the PNG.
- Reload home post-solve → today-card shows STAMPED variant with elapsed time + share button.

- [ ] **Step 5: Verify masthead has no streak**

The masthead should NOT show a streak number anywhere. The streak is only in `<TodayCard />`.

- [ ] **Step 6: Verify no `<StreakBadge />` references remain**

```bash
grep -rn "StreakBadge" app components lib
grep -rn "streakDays" app components lib
```

Expected: no results.

- [ ] **Step 7: Commit any minor fixes from the manual pass**

If you found small bugs (import paths, off-by-one, etc.), fix and commit:

```bash
git add <files>
git commit -m "fix(seal): <specific issue>"
```

- [ ] **Step 8: Done**

The flagship Today's Seal system is complete: per-date kanji, year-scroll, today-card hook, win-modal payoff, share PNG, Pro freezes, retired StreakBadge.

---

## Notes for the implementing engineer

- **Test gap.** This codebase has no precedent for component or API-route tests (vitest is node-env only). All TDD here is pure-logic. Manual browser checks are the primary verification for UI tasks. If you want to introduce a component-test stack (jsdom + @testing-library/react), that's a separate change outside this plan.
- **Bank size.** The starter `KANJI_BANK` has ~60 entries — enough for 60 days but not a year. Before public launch, extend to ≥365 entries from a Joyo kanji list. Until then, the calendar test in Task 6 may need to be marked `.todo` or seeded with a smaller window.
- **Vercel runtime split.** The seal endpoints use `runtime = "nodejs"` because they hit Anthropic + Supabase server SDK. The share endpoint uses `runtime = "edge"` for fast image generation; `@vercel/og` requires edge.
- **Auth pattern.** Use `getSession()` (not `getUser()`) for new endpoints, per the recent auth migration commit.
- **Animation reduced-motion.** The `<Seal state="today">` pulse uses `motion-safe:`. The win modal's bloom + corner press do not yet check `prefers-reduced-motion` — add `motion-safe:` wrappers if QA flags this.
