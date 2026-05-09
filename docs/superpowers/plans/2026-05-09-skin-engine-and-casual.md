# Skin Engine, Volumes & Casual Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the skin engine that themes the daily by season (春/夏/秋/冬), restore the difficulty picker as a first-class home-page surface (Casual mode), and make the year-scroll read as four chapters of stamps. This plan is the **foundation** for two follow-up plans (monetization, VFX/SFX).

**Architecture:** One `skins` table unifies seasons and (future) premium skins. CSS `[data-skin]` palette blocks in `globals.css` swap visual tokens; a TS registry holds metadata that doesn't belong in CSS (seal kanji, masthead phrase). Pure resolution function `resolveActiveSkin()` decides which skin a surface wears given (user, surface, dailyDate). The daily *always* wears the season it was published in (locked); home/casual chrome can be overridden by Pro users.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), Tailwind (Hako tokens via HSL custom properties), vitest (node env, pure-logic only), Zustand (existing game store — untouched).

**Spec:** `docs/superpowers/specs/2026-05-09-volumes-skins-vfx-design.md`

**Out of scope for this plan (future plans):**
- Skin catalog page + Stripe per-skin checkout (Plan 2: monetization)
- /pro page copy refresh (Plan 2)
- VFX/SFX layer — placement ink + solve ceremony + sound toggle (Plan 3)
- Premium skin Pro-picker UI (Plan 2, since picker requires the catalog to exist for the "buy more" link)

---

## File Structure

**New files:**
- `supabase/migrations/0008_skins_tables.sql` — creates `skins`, `user_skin_entitlements`, alters `daily_puzzles` + `profiles` (nullable additions)
- `supabase/migrations/0009_skins_not_null.sql` — locks `daily_puzzles.skin_id` to NOT NULL after seed
- `scripts/seed-skins.ts` — idempotent seed of 7 launch skins + backfill of `daily_puzzles.skin_id`
- `lib/skins/types.ts` — shared types: `SkinRecord`, `SkinResolved`, `Surface`
- `lib/skins/registry.ts` — TS lookup by slug → `{ paletteKey, sealKanji, masthead }`
- `lib/skins/resolve.ts` — pure `resolveActiveSkin()` + `canApplyOverride()`
- `components/theme/SkinContext.tsx` — React context exposing `{ slug, sealKanji, masthead, paletteKey }`
- `app/play/page.tsx` — casual landing: 4-tile difficulty picker
- `tests/skins/resolve.test.ts` — pure-logic tests for resolution rules
- `tests/skins/access.test.ts` — pure-logic tests for `canApplyOverride`

**Modified files:**
- `app/globals.css` — add `[data-skin]` palette blocks for default + 4 seasons + 2 premium (placeholders for Plan 2)
- `app/layout.tsx` — server-resolve active skin; apply `data-skin` attribute on body; provide `SkinContext`
- `app/page.tsx` — add volume eyebrow + Casual card
- `app/play/daily/page.tsx` — read daily's `skin_id`; wrap GameShell with daily's skin context
- `app/play/[difficulty]/page.tsx` — wear active skin; update header label
- `components/game/GameShell.tsx` — accept skin metadata; render seal kanji from context; header reads `Daily № 0472 · 春`
- `components/game/WinModal.tsx` — use active skin's seal kanji on the stamp
- `components/year-scroll/YearScroll.tsx` — render per-day seal kanji from joined skin info
- `lib/seal/year.ts` — include each day's `skin_id` (or pre-resolved `sealKanji`) in `YearSeries`
- `lib/seal/types.ts` — add `sealKanji` to `SealEntry` shape

---

## Phase 1 — Schema & seed

### Task 1: Migration `0008_skins_tables.sql`

**Files:**
- Create: `supabase/migrations/0008_skins_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0008_skins_tables.sql

create table public.skins (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  kind          text not null check (kind in ('season', 'premium', 'limited')),
  name          text not null,
  kanji_label   text not null,
  seal_kanji    text not null,
  palette_key   text not null,
  masthead      text not null,
  start_date    date,
  end_date      date,
  price_cents   int,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint skins_dates_match_kind check (
    (kind = 'season' and start_date is not null and end_date is not null) or
    (kind <> 'season' and start_date is null and end_date is null)
  )
);

create unique index skins_season_date_idx
  on public.skins(start_date)
  where kind = 'season';

alter table public.skins enable row level security;
create policy skins_world_read on public.skins for select using (true);

create table public.user_skin_entitlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skin_id     uuid not null references public.skins(id) on delete cascade,
  source      text not null check (source in ('season', 'pro', 'purchase', 'gift')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

create index user_skin_entitlements_user_idx
  on public.user_skin_entitlements(user_id);

alter table public.user_skin_entitlements enable row level security;
create policy user_skin_entitlements_owner_read
  on public.user_skin_entitlements for select
  using (auth.uid() = user_id);

alter table public.daily_puzzles
  add column skin_id uuid references public.skins(id);

alter table public.profiles
  add column active_skin_id uuid references public.skins(id),
  add column sfx_enabled boolean not null default false;
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up` (or paste into your Supabase SQL editor against your dev project).
Expected: migration applies; `select count(*) from public.skins;` returns 0; `\d daily_puzzles` shows new nullable `skin_id` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_skins_tables.sql
git commit -m "feat(skins): add skins + user_skin_entitlements tables, alter daily_puzzles + profiles"
```

---

### Task 2: Skin types and registry

**Files:**
- Create: `lib/skins/types.ts`
- Create: `lib/skins/registry.ts`
- Create: `tests/skins/registry.test.ts`

- [ ] **Step 1: Write the types**

```ts
// lib/skins/types.ts

export type SkinKind = "season" | "premium" | "limited";
export type Surface = "home" | "casual" | "daily";

export interface SkinRecord {
  id: string;
  slug: string;
  kind: SkinKind;
  name: string;
  kanji_label: string;     // 春 / 墨 — the spine glyph
  seal_kanji: string;      // 桜 / 墨 — the seal glyph
  palette_key: string;     // matches CSS [data-skin="<key>"]
  masthead: string;        // "Today's bloom."
  start_date: string | null; // ISO date
  end_date: string | null;
  price_cents: number | null;
  active: boolean;
}

export interface SkinResolved {
  slug: string;
  paletteKey: string;
  sealKanji: string;
  masthead: string;
  kanjiLabel: string;
}

export interface SkinRegistryEntry {
  paletteKey: string;
  sealKanji: string;
  masthead: string;
  kanjiLabel: string;
}
```

- [ ] **Step 2: Write the registry**

```ts
// lib/skins/registry.ts
import type { SkinRegistryEntry } from "./types";

export const SKIN_REGISTRY: Record<string, SkinRegistryEntry> = {
  "default":     { paletteKey: "default", sealKanji: "完", masthead: "Today's box.",    kanjiLabel: "完" },
  "spring-2026": { paletteKey: "spring",  sealKanji: "桜", masthead: "Today's bloom.",  kanjiLabel: "春" },
  "summer-2026": { paletteKey: "summer",  sealKanji: "蓮", masthead: "Today's pond.",   kanjiLabel: "夏" },
  "autumn-2026": { paletteKey: "autumn",  sealKanji: "楓", masthead: "Today's leaf.",   kanjiLabel: "秋" },
  "winter-2026": { paletteKey: "winter",  sealKanji: "雪", masthead: "Today's hush.",   kanjiLabel: "冬" },
  "sumi-e":      { paletteKey: "sumi",    sealKanji: "墨", masthead: "Today's stroke.", kanjiLabel: "墨" },
  "indigo":      { paletteKey: "indigo",  sealKanji: "藍", masthead: "Today's depth.",  kanjiLabel: "藍" },
};

export function getRegistryEntry(slug: string): SkinRegistryEntry {
  return SKIN_REGISTRY[slug] ?? SKIN_REGISTRY["default"];
}
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/skins/registry.test.ts
import { describe, it, expect } from "vitest";
import { SKIN_REGISTRY, getRegistryEntry } from "@/lib/skins/registry";

describe("skin registry", () => {
  it("contains the 7 launch slugs", () => {
    expect(Object.keys(SKIN_REGISTRY).sort()).toEqual([
      "autumn-2026",
      "default",
      "indigo",
      "spring-2026",
      "sumi-e",
      "summer-2026",
      "winter-2026",
    ]);
  });

  it("returns the default entry for unknown slugs", () => {
    expect(getRegistryEntry("not-a-real-skin").paletteKey).toBe("default");
    expect(getRegistryEntry("not-a-real-skin").sealKanji).toBe("完");
  });

  it("returns spring-2026 metadata correctly", () => {
    const entry = getRegistryEntry("spring-2026");
    expect(entry.paletteKey).toBe("spring");
    expect(entry.sealKanji).toBe("桜");
    expect(entry.masthead).toBe("Today's bloom.");
  });
});
```

- [ ] **Step 4: Run test**

Run: `npm test -- skins/registry`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/skins/types.ts lib/skins/registry.ts tests/skins/registry.test.ts
git commit -m "feat(skins): types + static registry of launch skins"
```

---

### Task 3: Resolution helper — `resolveActiveSkin`

**Files:**
- Create: `lib/skins/resolve.ts`
- Create: `tests/skins/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/skins/resolve.test.ts
import { describe, it, expect } from "vitest";
import { resolveActiveSkin } from "@/lib/skins/resolve";
import type { SkinRecord } from "@/lib/skins/types";

const SPRING: SkinRecord = {
  id: "s-spring", slug: "spring-2026", kind: "season", name: "Spring 2026",
  kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
  masthead: "Today's bloom.", start_date: "2026-03-01", end_date: "2026-05-31",
  price_cents: null, active: true,
};
const SUMMER: SkinRecord = {
  id: "s-summer", slug: "summer-2026", kind: "season", name: "Summer 2026",
  kanji_label: "夏", seal_kanji: "蓮", palette_key: "summer",
  masthead: "Today's pond.", start_date: "2026-06-01", end_date: "2026-08-31",
  price_cents: null, active: true,
};
const SUMI: SkinRecord = {
  id: "s-sumi", slug: "sumi-e", kind: "premium", name: "Sumi-e",
  kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
  masthead: "Today's stroke.", start_date: null, end_date: null,
  price_cents: 300, active: true,
};
const DEFAULT: SkinRecord = {
  id: "s-default", slug: "default", kind: "premium", name: "Default",
  kanji_label: "完", seal_kanji: "完", palette_key: "default",
  masthead: "Today's box.", start_date: null, end_date: null,
  price_cents: null, active: true,
};
const SKINS = [SPRING, SUMMER, SUMI, DEFAULT];

describe("resolveActiveSkin — daily surface", () => {
  it("returns the daily's locked skin regardless of override", () => {
    const result = resolveActiveSkin({
      surface: "daily",
      activeSkinId: "s-sumi",
      isPro: true,
      ownedSkinIds: new Set(["s-sumi"]),
      dailySkinId: "s-spring",
      today: "2026-09-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("spring-2026");
    expect(result.sealKanji).toBe("桜");
  });

  it("falls back to default if daily has no skin_id", () => {
    const result = resolveActiveSkin({
      surface: "daily",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("default");
  });
});

describe("resolveActiveSkin — home/casual surface", () => {
  it("uses override when Pro user has it set and is entitled", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",
      isPro: true,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("sumi-e");
  });

  it("falls back to current-date season for free user even with override set", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",        // override is set on profile
      isPro: false,
      ownedSkinIds: new Set(),       // but free user has no entitlement
      dailySkinId: null,
      today: "2026-04-01",           // mid-spring
      skins: SKINS,
    });
    expect(result.slug).toBe("spring-2026");
  });

  it("returns the current-date season skin when no override", () => {
    const result = resolveActiveSkin({
      surface: "casual",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-07-15",
      skins: SKINS,
    });
    expect(result.slug).toBe("summer-2026");
  });

  it("returns default when no season covers today", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-12-25",           // outside all seeded seasons in this test
      skins: SKINS,
    });
    expect(result.slug).toBe("default");
  });

  it("ex-Pro user keeps purchased skin entitlement", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",
      isPro: false,
      ownedSkinIds: new Set(["s-sumi"]),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("sumi-e");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- skins/resolve`
Expected: all tests FAIL with `resolveActiveSkin is not a function` (module doesn't exist yet).

- [ ] **Step 3: Implement `resolveActiveSkin`**

```ts
// lib/skins/resolve.ts
import type { SkinRecord, SkinResolved, Surface } from "./types";

interface ResolveArgs {
  surface: Surface;
  activeSkinId: string | null;
  isPro: boolean;
  ownedSkinIds: Set<string>;
  dailySkinId: string | null;     // only for surface="daily"
  today: string;                   // ISO YYYY-MM-DD (UTC)
  skins: SkinRecord[];
}

function toResolved(s: SkinRecord): SkinResolved {
  return {
    slug: s.slug,
    paletteKey: s.palette_key,
    sealKanji: s.seal_kanji,
    masthead: s.masthead,
    kanjiLabel: s.kanji_label,
  };
}

function findById(skins: SkinRecord[], id: string | null): SkinRecord | undefined {
  if (!id) return undefined;
  return skins.find((s) => s.id === id);
}

function findCurrentSeason(skins: SkinRecord[], today: string): SkinRecord | undefined {
  return skins.find(
    (s) =>
      s.kind === "season" &&
      s.start_date !== null &&
      s.end_date !== null &&
      s.start_date <= today &&
      today <= s.end_date,
  );
}

function findDefault(skins: SkinRecord[]): SkinRecord | undefined {
  return skins.find((s) => s.slug === "default");
}

export function canApplyOverride(args: {
  isPro: boolean;
  skin: SkinRecord;
  ownedSkinIds: Set<string>;
}): boolean {
  if (args.isPro) return true;
  if (args.skin.kind !== "season") {
    return args.ownedSkinIds.has(args.skin.id);
  }
  return false;
}

export function resolveActiveSkin(args: ResolveArgs): SkinResolved {
  // 1. Daily surface is locked to the puzzle's published skin.
  if (args.surface === "daily") {
    const daily = findById(args.skins, args.dailySkinId);
    if (daily) return toResolved(daily);
    const fallback = findDefault(args.skins) ?? args.skins[0];
    return toResolved(fallback);
  }

  // 2. Home or casual: try the user's override if entitled.
  const override = findById(args.skins, args.activeSkinId);
  if (override && canApplyOverride({ isPro: args.isPro, skin: override, ownedSkinIds: args.ownedSkinIds })) {
    return toResolved(override);
  }

  // 3. Otherwise, current-date season skin.
  const season = findCurrentSeason(args.skins, args.today);
  if (season) return toResolved(season);

  // 4. Final fallback.
  const fallback = findDefault(args.skins) ?? args.skins[0];
  return toResolved(fallback);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- skins/resolve`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/skins/resolve.ts tests/skins/resolve.test.ts
git commit -m "feat(skins): pure resolveActiveSkin + canApplyOverride helpers"
```

---

### Task 4: `canApplyOverride` edge-case tests

**Files:**
- Create: `tests/skins/access.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// tests/skins/access.test.ts
import { describe, it, expect } from "vitest";
import { canApplyOverride } from "@/lib/skins/resolve";
import type { SkinRecord } from "@/lib/skins/types";

const PREMIUM: SkinRecord = {
  id: "s-sumi", slug: "sumi-e", kind: "premium", name: "Sumi-e",
  kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
  masthead: "Today's stroke.", start_date: null, end_date: null,
  price_cents: 300, active: true,
};
const SEASON: SkinRecord = {
  id: "s-spring", slug: "spring-2026", kind: "season", name: "Spring 2026",
  kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
  masthead: "Today's bloom.", start_date: "2026-03-01", end_date: "2026-05-31",
  price_cents: null, active: true,
};

describe("canApplyOverride", () => {
  it("Pro user can apply any skin", () => {
    expect(canApplyOverride({ isPro: true, skin: PREMIUM, ownedSkinIds: new Set() })).toBe(true);
    expect(canApplyOverride({ isPro: true, skin: SEASON, ownedSkinIds: new Set() })).toBe(true);
  });

  it("free user cannot apply season skins as override", () => {
    expect(canApplyOverride({ isPro: false, skin: SEASON, ownedSkinIds: new Set() })).toBe(false);
  });

  it("free user can apply purchased premium skins (post-Pro persistence)", () => {
    expect(
      canApplyOverride({ isPro: false, skin: PREMIUM, ownedSkinIds: new Set(["s-sumi"]) }),
    ).toBe(true);
  });

  it("free user cannot apply premium skins they don't own", () => {
    expect(canApplyOverride({ isPro: false, skin: PREMIUM, ownedSkinIds: new Set() })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- skins/access`
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/skins/access.test.ts
git commit -m "test(skins): canApplyOverride edge cases for free/Pro/owned"
```

---

### Task 5: Seed script + backfill

**Files:**
- Create: `scripts/seed-skins.ts`
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Write the seed script**

```ts
// scripts/seed-skins.ts
import "dotenv/config";
import { createAdminClient } from "@/lib/supabase/admin";

interface SeedSkin {
  slug: string;
  kind: "season" | "premium" | "limited";
  name: string;
  kanji_label: string;
  seal_kanji: string;
  palette_key: string;
  masthead: string;
  start_date: string | null;
  end_date: string | null;
  price_cents: number | null;
}

const LAUNCH_SKINS: SeedSkin[] = [
  // Default fallback (premium-kind keeps it out of the season-date check; never sold).
  {
    slug: "default", kind: "premium", name: "Default",
    kanji_label: "完", seal_kanji: "完", palette_key: "default",
    masthead: "Today's box.",
    start_date: null, end_date: null, price_cents: null,
  },
  // 4 seasonal volumes for 2026.
  {
    slug: "spring-2026", kind: "season", name: "Spring 2026",
    kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
    masthead: "Today's bloom.",
    start_date: "2026-03-01", end_date: "2026-05-31", price_cents: null,
  },
  {
    slug: "summer-2026", kind: "season", name: "Summer 2026",
    kanji_label: "夏", seal_kanji: "蓮", palette_key: "summer",
    masthead: "Today's pond.",
    start_date: "2026-06-01", end_date: "2026-08-31", price_cents: null,
  },
  {
    slug: "autumn-2026", kind: "season", name: "Autumn 2026",
    kanji_label: "秋", seal_kanji: "楓", palette_key: "autumn",
    masthead: "Today's leaf.",
    start_date: "2026-09-01", end_date: "2026-11-30", price_cents: null,
  },
  {
    slug: "winter-2026", kind: "season", name: "Winter 2026",
    kanji_label: "冬", seal_kanji: "雪", palette_key: "winter",
    masthead: "Today's hush.",
    start_date: "2026-12-01", end_date: "2027-02-28", price_cents: null,
  },
  // Premium skins (catalog UI ships in Plan 2 — these are seeded now so the engine is ready).
  {
    slug: "sumi-e", kind: "premium", name: "Sumi-e",
    kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
    masthead: "Today's stroke.",
    start_date: null, end_date: null, price_cents: 300,
  },
  {
    slug: "indigo", kind: "premium", name: "Indigo",
    kanji_label: "藍", seal_kanji: "藍", palette_key: "indigo",
    masthead: "Today's depth.",
    start_date: null, end_date: null, price_cents: 300,
  },
];

async function main() {
  const sb = createAdminClient();

  console.log("Seeding skins...");
  for (const skin of LAUNCH_SKINS) {
    const { error } = await sb.from("skins").upsert(skin, { onConflict: "slug" });
    if (error) {
      console.error(`Failed to upsert ${skin.slug}:`, error);
      process.exit(1);
    }
    console.log(`  ✓ ${skin.slug}`);
  }

  // Validate seasons are non-overlapping (editorial constraint).
  const { data: seasons } = await sb
    .from("skins")
    .select("slug, start_date, end_date")
    .eq("kind", "season")
    .order("start_date", { ascending: true });
  if (seasons) {
    for (let i = 1; i < seasons.length; i++) {
      if (seasons[i].start_date! <= seasons[i - 1].end_date!) {
        console.error(
          `Overlap detected: ${seasons[i - 1].slug} (${seasons[i - 1].end_date}) vs ${seasons[i].slug} (${seasons[i].start_date})`,
        );
        process.exit(1);
      }
    }
  }
  console.log(`  ✓ ${seasons?.length ?? 0} seasons disjoint`);

  console.log("Backfilling daily_puzzles.skin_id by date range...");
  const { error: bf1 } = await sb.rpc("exec_sql", {
    sql: `
      update public.daily_puzzles dp
         set skin_id = s.id
        from public.skins s
       where s.kind = 'season'
         and dp.date between s.start_date and s.end_date
         and dp.skin_id is null;
    `,
  });
  // RPC may not exist; use raw SQL via the JS client's .from() updates if so.
  // Fallback: fetch all unset rows and update individually.
  if (bf1) {
    console.log("  (fallback) iterating dailies one-by-one...");
    const { data: unset } = await sb
      .from("daily_puzzles")
      .select("date")
      .is("skin_id", null);
    for (const row of unset ?? []) {
      const season = (seasons ?? []).find(
        (s) => row.date >= s.start_date! && row.date <= s.end_date!,
      );
      if (!season) continue;
      const { data: seasonRow } = await sb.from("skins").select("id").eq("slug", season.slug).single();
      if (!seasonRow) continue;
      await sb.from("daily_puzzles").update({ skin_id: seasonRow.id }).eq("date", row.date);
    }
  }

  console.log("Backfilling stragglers with default skin...");
  const { data: defaultSkin } = await sb.from("skins").select("id").eq("slug", "default").single();
  if (!defaultSkin) {
    console.error("Default skin not found after seed.");
    process.exit(1);
  }
  await sb.from("daily_puzzles").update({ skin_id: defaultSkin.id }).is("skin_id", null);

  const { count: stillNull } = await sb
    .from("daily_puzzles")
    .select("*", { count: "exact", head: true })
    .is("skin_id", null);
  if ((stillNull ?? 0) > 0) {
    console.error(`${stillNull} daily_puzzles rows still have NULL skin_id after backfill.`);
    process.exit(1);
  }
  console.log("  ✓ all daily_puzzles have skin_id");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script to `package.json`**

Locate the `"scripts"` block (around line 5-15 of `package.json`) and add the new entry. Example after-state:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "verify-generator": "tsx scripts/verify-generator.ts",
  "seed": "tsx scripts/seed-puzzles.ts",
  "seed-seal": "tsx scripts/seed-seal-calendar.ts",
  "seed-skins": "tsx scripts/seed-skins.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Run the seed**

Run: `npm run seed-skins`
Expected output (last line): `Done.` All checkmarks present, exit code 0.

If your DB has dailies outside any 2026 season, those get the `default` skin — confirmed by the "stragglers" log line.

- [ ] **Step 4: Verify in Supabase**

```sql
select count(*) from public.skins;
-- expect: 7

select kind, count(*) from public.skins group by kind;
-- expect: season=4, premium=3 (default + sumi-e + indigo)

select count(*) from public.daily_puzzles where skin_id is null;
-- expect: 0
```

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-skins.ts package.json
git commit -m "feat(skins): seed script for 7 launch skins + daily_puzzles backfill"
```

---

### Task 6: Migration `0009_skins_not_null.sql`

**Files:**
- Create: `supabase/migrations/0009_skins_not_null.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0009_skins_not_null.sql
--
-- Run AFTER scripts/seed-skins.ts completes successfully.
-- Locks the daily_puzzles.skin_id column so future inserts must specify it.

alter table public.daily_puzzles
  alter column skin_id set not null;
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up`
Expected: applies cleanly (because backfill ran in Task 5).

If it fails with `column "skin_id" contains null values`, the seed script didn't fully backfill — re-run `npm run seed-skins` and try again.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_skins_not_null.sql
git commit -m "feat(skins): require daily_puzzles.skin_id (post-backfill)"
```

---

## Phase 2 — Theme engine

### Task 7: Globals CSS — palette tokens per `[data-skin]`

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Read current `:root` block to see token names**

Run: open `app/globals.css` and locate the `:root { ... }` block. Note exact token names (`--bone`, `--rice`, `--vermillion`, `--vermillion-deep`, `--moss`, `--moss-2`, `--sumi`, `--hazard`, `--seal`).

- [ ] **Step 2: Add `[data-skin]` overrides at the end of the `:root` block**

Append after the last existing `:root` rule (likely a `--seal: ...;` line). Use HSL triplets matching the format already used in the file. Keep tokens that don't shift (sumi, hazard, seal, fonts) absent from each block — they inherit from `:root`.

```css
/* ============================================================
   Skin overrides — [data-skin="<key>"]
   Only these tokens shift per skin. Sumi, hazard, seal, fonts,
   radius, masthead heights all inherit from :root.
   ============================================================ */

[data-skin="default"] {
  /* identical to :root — explicit so resolution is deterministic */
}

[data-skin="spring"] {
  --bone: 30 35% 95%;
  --rice: 32 28% 92%;
  --vermillion: 354 60% 53%;
  --vermillion-deep: 354 65% 38%;
  --moss: 14 18% 38%;
  --moss-2: 14 18% 50%;
}

[data-skin="summer"] {
  --bone: 60 22% 94%;
  --rice: 60 18% 91%;
  --vermillion: 8 75% 50%;
  --vermillion-deep: 8 80% 36%;
  --moss: 130 14% 32%;
  --moss-2: 130 14% 44%;
}

[data-skin="autumn"] {
  --bone: 38 40% 92%;
  --rice: 36 32% 89%;
  --vermillion: 18 70% 48%;
  --vermillion-deep: 18 75% 34%;
  --moss: 32 18% 32%;
  --moss-2: 32 18% 44%;
}

[data-skin="winter"] {
  --bone: 210 18% 95%;
  --rice: 210 14% 92%;
  --vermillion: 0 65% 38%;
  --vermillion-deep: 0 70% 28%;
  --moss: 215 12% 36%;
  --moss-2: 215 12% 48%;
}

[data-skin="sumi"] {
  --bone: 40 8% 96%;
  --rice: 40 6% 93%;
  --vermillion: 0 0% 18%;
  --vermillion-deep: 0 0% 8%;
  --moss: 0 0% 38%;
  --moss-2: 0 0% 50%;
}

[data-skin="indigo"] {
  --bone: 220 12% 95%;
  --rice: 220 10% 92%;
  --vermillion: 220 45% 38%;
  --vermillion-deep: 220 55% 24%;
  --moss: 220 14% 38%;
  --moss-2: 220 14% 50%;
}
```

- [ ] **Step 3: Manually verify the file parses**

Run: `npm run dev`
Expected: dev server starts without CSS errors. Open http://localhost:3000 — it should render unchanged (no `data-skin` attribute applied yet).

Stop the dev server when verified.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(skins): CSS palette tokens for default + 4 seasons + 2 premium"
```

---

### Task 8: Skin context + active-skin resolver for the layout

**Files:**
- Create: `components/theme/SkinContext.tsx`
- Create: `lib/skins/server.ts`

- [ ] **Step 1: Write the React context**

```tsx
// components/theme/SkinContext.tsx
"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SkinResolved } from "@/lib/skins/types";

const DEFAULT_SKIN: SkinResolved = {
  slug: "default",
  paletteKey: "default",
  sealKanji: "完",
  masthead: "Today's box.",
  kanjiLabel: "完",
};

const SkinContext = createContext<SkinResolved>(DEFAULT_SKIN);

export function SkinProvider({ skin, children }: { skin: SkinResolved; children: ReactNode }) {
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinResolved {
  return useContext(SkinContext);
}
```

- [ ] **Step 2: Write the server-side resolver**

```ts
// lib/skins/server.ts
import { createServerClient } from "@/lib/supabase/server";
import { resolveActiveSkin } from "./resolve";
import type { SkinRecord, SkinResolved, Surface } from "./types";

interface ResolveServerArgs {
  surface: Surface;
  dailyDate?: string;        // YYYY-MM-DD when surface === "daily"
}

export async function resolveActiveSkinServer(args: ResolveServerArgs): Promise<SkinResolved> {
  const sb = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all active skins (small table — 7 rows at launch).
  const { data: skinsRaw } = await sb
    .from("skins")
    .select("id,slug,kind,name,kanji_label,seal_kanji,palette_key,masthead,start_date,end_date,price_cents,active")
    .eq("active", true);
  const skins: SkinRecord[] = (skinsRaw ?? []) as unknown as SkinRecord[];

  // Fetch the user's profile (active_skin_id, is_pro) and entitlements.
  const { data: { user } } = await sb.auth.getUser();
  let activeSkinId: string | null = null;
  let isPro = false;
  let ownedSkinIds = new Set<string>();
  if (user) {
    const [{ data: profile }, { data: ents }] = await Promise.all([
      sb.from("profiles").select("active_skin_id,is_pro").eq("id", user.id).maybeSingle(),
      sb.from("user_skin_entitlements").select("skin_id").eq("user_id", user.id),
    ]);
    activeSkinId = profile?.active_skin_id ?? null;
    isPro = profile?.is_pro ?? false;
    ownedSkinIds = new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id));
  }

  // For daily surface, look up the daily's skin_id.
  let dailySkinId: string | null = null;
  if (args.surface === "daily" && args.dailyDate) {
    const { data: daily } = await sb
      .from("daily_puzzles")
      .select("skin_id")
      .eq("date", args.dailyDate)
      .maybeSingle();
    dailySkinId = daily?.skin_id ?? null;
  }

  return resolveActiveSkin({
    surface: args.surface,
    activeSkinId,
    isPro,
    ownedSkinIds,
    dailySkinId,
    today,
    skins,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add components/theme/SkinContext.tsx lib/skins/server.ts
git commit -m "feat(skins): SkinContext provider + server-side active-skin resolver"
```

---

### Task 9: Apply skin in root layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Read current layout**

Run: open `app/layout.tsx`. Note the existing `<body>` element and any classes/attributes already on it.

- [ ] **Step 2: Modify layout to resolve and apply skin**

Wrap the body's children in `<SkinProvider>` and add `data-skin` to body. The current layout already imports next/font (Shippori_Mincho, Plus_Jakarta_Sans, JetBrains_Mono, Cormorant_Garamond) and `Toaster` from `@/components/ui/toaster`. **Preserve all of them.** Only add the two new things: `data-skin` attribute on `<body>` and a `<SkinProvider>` wrapping the children.

```tsx
// app/layout.tsx — relevant additions only; keep all existing imports + body className
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";
// ... existing imports (next/font/*, Toaster, globals.css, etc.)

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the home/chrome skin once at the layout level.
  // /play/daily and /play/[difficulty] re-wrap with their own SkinProvider downstream.
  const skin = await resolveActiveSkinServer({ surface: "home" });

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="<KEEP EXISTING className EXACTLY AS IS>"
        data-skin={skin.paletteKey}
      >
        <SkinProvider skin={skin}>
          {/* KEEP EVERYTHING ELSE: ThemeProvider, Toaster, etc. */}
          {children}
        </SkinProvider>
      </body>
    </html>
  );
}
```

If RootLayout was previously synchronous (`function RootLayout`), it must become `async function` to await the resolver. That's fine in App Router server components.

- [ ] **Step 3: Manually verify in browser**

Run: `npm run dev`
Open: http://localhost:3000

Inspect element → `<body>` should have `data-skin="spring"` (or whichever season matches today's date). Page should render visually identical to before — palette tokens for "spring" are tuned to be very close to default, but if today is mid-summer the bone tone may shift subtly. Stop dev server.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(skins): apply data-skin attribute on body via server-side resolver"
```

---

## Phase 3 — Daily play themed

### Task 10: Daily play wears the published skin

**Files:**
- Modify: `app/play/daily/page.tsx`

- [ ] **Step 1: Read current daily page**

Run: open `app/play/daily/page.tsx`. Currently selects `*` from `daily_puzzles` for today's date and passes givens/solution to GameShell.

- [ ] **Step 2: Add skin resolution and wrap GameShell**

```tsx
// app/play/daily/page.tsx
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { GameShell } from "@/components/game/GameShell";
import { todayUTC } from "@/lib/utils";
import { Difficulty } from "@/lib/sudoku/types";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";

export default async function Daily() {
  const sb = createServerClient();
  const date = todayUTC();
  const { data } = await sb
    .from("daily_puzzles")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  if (!data) notFound();

  const skin = await resolveActiveSkinServer({ surface: "daily", dailyDate: date });

  return (
    <div data-skin={skin.paletteKey}>
      <SkinProvider skin={skin}>
        <GameShell
          difficulty={data.difficulty as Difficulty}
          puzzle={{ givens: data.givens, solution: data.solution }}
          dailyDate={date}
          dailyNumber={data.seq}
        />
      </SkinProvider>
    </div>
  );
}
```

The `<div data-skin>` wrapper makes the page-level palette swap independent of the body's home-skin attribute.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000/play/daily.

Inspect element → outer wrapper should have `data-skin` matching today's season (or `default` if today's daily wasn't backfilled with a season). Daily renders normally. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/play/daily/page.tsx
git commit -m "feat(skins): daily play wears its published season's skin (locked)"
```

---

### Task 11: GameShell renders themed header (季 instead of difficulty for daily)

**Files:**
- Modify: `components/game/GameShell.tsx`

- [ ] **Step 1: Locate the title formatter**

Run: open `components/game/GameShell.tsx`. Find the `formatDailyTitle` function (around lines 151–163). It currently composes `Daily № NNNN · DD MMM · DiffName`.

- [ ] **Step 2: Replace difficulty label with seasonal kanji label for daily**

Add `useSkin` import at the top of the file:

```tsx
import { useSkin } from "@/components/theme/SkinContext";
```

Inside the `GameShell` component body (near the top, alongside other hook calls), call:

```tsx
const skin = useSkin();
```

Replace `formatDailyTitle` with:

```tsx
const formatDailyTitle = (date: string) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const seq = dailyNumber != null
    ? `№ ${dailyNumber.toString().padStart(4, "0")} · `
    : "";
  // Daily wears its season's kanji_label (春/夏/秋/秋) — not the difficulty.
  // Difficulty is canonically Hard for daily; the seasonal glyph is more interesting.
  return `Daily ${seq}${day} ${month} · ${skin.kanjiLabel}`;
};
```

The `DIFF_LABEL` lookup stays for the casual difficulty route (used in the non-`dailyDate` branch on line 166).

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000/play/daily.

Title in masthead should read `Daily № 0472 · 9 May · 春` (or whichever season's kanji corresponds to today). Casual `/play/medium` should still read `中 Medium`. Stop dev server.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/game/GameShell.tsx
git commit -m "feat(skins): GameShell daily header uses skin.kanjiLabel instead of difficulty"
```

---

### Task 12: WinModal uses skin's seal_kanji

**Files:**
- Modify: `components/game/WinModal.tsx`

- [ ] **Step 1: Read current modal**

Run: open `components/game/WinModal.tsx`. Find where the seal glyph is rendered (likely a hardcoded `完` inside a stamp element).

- [ ] **Step 2: Replace hardcoded 完 with `useSkin().sealKanji`**

Add the import:

```tsx
import { useSkin } from "@/components/theme/SkinContext";
```

Inside the component, near other hook calls:

```tsx
const skin = useSkin();
```

Locate the JSX node containing the literal `完` (or whatever stamp character is hardcoded) and replace it with `{skin.sealKanji}`. Example before-after:

```tsx
// before
<div className="seal-stamp ...">完</div>

// after
<div className="seal-stamp ...">{skin.sealKanji}</div>
```

There may be more than one occurrence (one in the modal body, one in the share PNG path). Replace all in this component file. **Do not** touch the share PNG endpoint (`app/api/share/seal/[date]/route.tsx`) yet — that requires looking up the historical skin server-side and is out of scope here. The Win modal is the in-session moment.

- [ ] **Step 3: Manually verify**

Set up a daily complete state (or use the existing dev workflow to reach the win modal). Open the win modal — the seal glyph should now be the active season's kanji (e.g. 桜 in spring), not 完.

If today's daily wears the `default` skin (because backfill assigned it), the glyph remains 完 — that's correct.

- [ ] **Step 4: Commit**

```bash
git add components/game/WinModal.tsx
git commit -m "feat(skins): WinModal seal glyph uses active skin's seal_kanji"
```

---

## Phase 4 — Casual restoration

### Task 13: Casual landing page `/play`

**Files:**
- Create: `app/play/page.tsx`

- [ ] **Step 1: Read the existing landing's difficulty section**

Run: open `components/landing/Landing.tsx`. The "Or pick a difficulty" section starts around line 327 and contains the 4-card layout we want to mirror.

- [ ] **Step 2: Write the casual landing page**

```tsx
// app/play/page.tsx
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIERS = [
  { k: "易", lvl: "i",   name: "Easy",   stats: "avg 4:12 · 38 givens",  href: "/play/easy" },
  { k: "中", lvl: "ii",  name: "Medium", stats: "avg 8:30 · 30 givens",  href: "/play/medium" },
  { k: "難", lvl: "iii", name: "Hard",   stats: "avg 14:50 · 26 givens", href: "/play/hard" },
  { k: "極", lvl: "iv",  name: "Expert", stats: "23:00+ · 22 givens",    href: "/play/expert", accent: true },
];

export default async function CasualLanding() {
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  const initial = user?.email?.[0] ?? "·";

  return (
    <>
      <Masthead active="play" initial={initial} email={user?.email ?? null} />

      <main className="px-8 py-14 lg:px-16 lg:py-20 max-w-[1200px] mx-auto">
        <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">
          § casual
        </div>
        <h1 className="mincho font-medium text-[42px] lg:text-[56px] leading-none mt-3.5 -tracking-[0.01em] text-sumi">
          Pick a floor<span className="text-vermillion">.</span>
        </h1>
        <p className="mt-[18px] text-[14.5px] leading-[1.6] text-moss max-w-[40ch]">
          Casual draws from the puzzle library — your streak rests with the daily.
          These don&rsquo;t move it.
        </p>

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

- [ ] **Step 2.5: Verify Masthead accepts `active="play"`**

Run: open `components/Masthead.tsx` and find the `active` prop type. If the union doesn't include `"play"`, add it:

```tsx
// in components/Masthead.tsx — find the prop type
active?: "today" | "leaderboard" | "play" | "achievements" | "profile";
```

If the masthead also has nav items, add a "casual" or "play" link as appropriate (mirror the existing nav pattern).

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000/play.

Should render the 4-tile difficulty picker at the casual landing. Each tile links to `/play/<difficulty>`. Stop dev server.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/play/page.tsx components/Masthead.tsx
git commit -m "feat(casual): /play landing — 4-tile difficulty picker"
```

---

### Task 14: Difficulty route wears the active skin

**Files:**
- Modify: `app/play/[difficulty]/page.tsx`

- [ ] **Step 1: Read current page**

Run: open `app/play/[difficulty]/page.tsx`. It validates the difficulty param and renders `<GameShell />` with a random puzzle.

- [ ] **Step 2: Add skin resolution + provider wrapping**

```tsx
// app/play/[difficulty]/page.tsx
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { GameShell } from "@/components/game/GameShell";
import { Difficulty } from "@/lib/sudoku/types";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";

const VALID = ["easy", "medium", "hard", "expert"] as const;

export default async function Page({ params }: { params: { difficulty: string } }) {
  if (!VALID.includes(params.difficulty as Difficulty)) notFound();
  const sb = createServerClient();
  const { data } = await sb
    .from("puzzles")
    .select("id,givens,solution")
    .eq("difficulty", params.difficulty)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data?.length) notFound();
  const pick = data[Math.floor(Math.random() * data.length)];

  // Casual surface: user override (Pro-only) or current-date season fallback.
  const skin = await resolveActiveSkinServer({ surface: "casual" });

  return (
    <div data-skin={skin.paletteKey}>
      <SkinProvider skin={skin}>
        <GameShell difficulty={params.difficulty as Difficulty} puzzle={pick} />
      </SkinProvider>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000/play/medium.

Difficulty page renders. Inspect → wrapper has `data-skin="<current-season>"`. Header still reads `中 Medium` (the existing DIFF_LABEL behavior is preserved for the non-daily branch). Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/play/\[difficulty\]/page.tsx
git commit -m "feat(skins): casual difficulty route wears resolved active skin"
```

---

### Task 15: Home page additions — volume eyebrow + Casual card

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Read the existing signed-in section**

Run: open `app/page.tsx`. Look at the JSX returned in the signed-in branch (starts around line 211). The structure is roughly:
- Masthead
- `<main>` with `dateLine()` eyebrow → optional CityPicker → TodayCard → YearScroll → 2-column (global pace + ledger preview)

- [ ] **Step 2: Add the volume eyebrow + Casual card**

Add an import at the top of the file:

```tsx
import { useSkin } from "@/components/theme/SkinContext";
```

Wait — `app/page.tsx` is a Server Component (no `"use client"`). `useSkin` is a hook for client components. We need a **server-side** approach: read the active skin via `resolveActiveSkinServer({ surface: "home" })` in the page itself.

Actually, the layout already resolves and applies the skin. To read its metadata in the page, the cleanest path is to re-call `resolveActiveSkinServer({ surface: "home" })` at the top of `Home()` — it's a small, cached query. Add:

```tsx
import { resolveActiveSkinServer } from "@/lib/skins/server";
// ...

export default async function Home() {
  const skin = await resolveActiveSkinServer({ surface: "home" });
  // ... existing code ...
}
```

Then below the existing eyebrow `<div className="eyebrow red">{dateLine()}</div>`, add a volume chip:

```tsx
<div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-1">
  vol · <strong className="text-vermillion font-medium">{skin.kanjiLabel}</strong>{" "}
  {skin.slug.replace(/-/g, " ")} · in print
</div>
```

(The `vol·N` numbering is editorial — don't try to compute it from data. The label `kanjiLabel + slug` is enough.)

Then locate the `<TodayCard ... />` rendering. Below it (or alongside, depending on layout — start with below, on a new max-width row), add the Casual card:

```tsx
<div className="mt-8 max-w-[640px] border-t border-sumi/20 pt-6">
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
</div>
```

Add the missing `Link` import if it's not already at the top.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000 signed in.

Should see: `today's date` line (existing) → `vol · 春 spring 2026 · in print` (new) → CityPicker if shown (existing) → TodayCard (existing) → 4-tile Casual card with 易 中 難 極 (new) → Year scroll (existing) → ledger row (existing).

Stop dev server.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): volume eyebrow + Casual difficulty card"
```

---

## Phase 5 — Year scroll seal kanji per day

### Task 16: Year series carries each day's seal kanji

**Files:**
- Modify: `lib/seal/types.ts`
- Modify: `lib/seal/year.ts`
- Modify: `app/page.tsx` (the `series` assembly)

- [ ] **Step 1: Read current shapes**

Run: open `lib/seal/types.ts` and `lib/seal/year.ts`. Identify the `SealEntry` type (single day) and the `assembleYearSeries` function signature.

- [ ] **Step 2: Add `sealKanji` to `SealEntry`**

```ts
// lib/seal/types.ts — locate the SealEntry interface and add the field
export interface SealEntry {
  date: string;
  kanji: string;        // the daily_seal_calendar kanji (existing)
  romaji: string;
  meaning: string;
  state: SealState;     // existing
  sealKanji: string;    // NEW — from daily_puzzles.skin_id → skins.seal_kanji
}
```

- [ ] **Step 3: Update `assembleYearSeries` to thread the new field**

`assembleYearSeries` currently takes a `calendar` array (from `daily_seal_calendar`). It needs an additional input mapping `date → sealKanji`. Add a parameter:

```ts
// lib/seal/year.ts — signature change
export function assembleYearSeries(args: {
  today: string;
  calendar: Array<{ date: string; kanji: string; romaji: string; meaning: string }>;
  completedByDate: Map<string, number>;
  frozenDates: Set<string>;
  signupDate: string;
  sealKanjiByDate: Map<string, string>;   // NEW
}): YearSeries {
  // existing logic — when constructing each SealEntry, set:
  //   sealKanji: args.sealKanjiByDate.get(date) ?? "完",
  //
  // The fallback "完" is for dates where we couldn't resolve a skin (very old data).
}
```

Update every place where the function builds a `SealEntry` to include `sealKanji`.

- [ ] **Step 4: Update the call site in `app/page.tsx`**

Locate the existing query block that pulls calendar/results/freezes/profile. Add a query for skin info per date:

```tsx
// in app/page.tsx, inside the signed-in user's data-fetching block — alongside
// the existing Promise.all([cal, results, freezes, profile])
const { data: dailyMeta } = await sb
  .from("daily_puzzles")
  .select("date, skin_id, skins(seal_kanji)")
  .gte("date", yearStart)
  .lte("date", yearEnd);
type DailyMetaRow = { date: string; skin_id: string; skins: { seal_kanji: string } | null };
const sealKanjiByDate = new Map<string, string>();
for (const r of (dailyMeta ?? []) as DailyMetaRow[]) {
  sealKanjiByDate.set(r.date, r.skins?.seal_kanji ?? "完");
}
```

Pass `sealKanjiByDate` into `assembleYearSeries`:

```tsx
series = assembleYearSeries({
  today,
  calendar: (cal ?? []) as any[],
  completedByDate,
  frozenDates: frozen,
  signupDate,
  sealKanjiByDate,                  // NEW
});
```

- [ ] **Step 5: Update existing year tests**

Run: `npm test -- seal/year`

If tests fail because `assembleYearSeries` now requires `sealKanjiByDate`, update the test fixtures:

```ts
// in tests/seal/year.test.ts — add an empty Map (or one with seeded values) to each call:
sealKanjiByDate: new Map([["2026-04-01", "桜"], ...]),
```

Tests should pass after the fixture update. Output `sealKanji` from the test assertions if you want to verify it threads correctly — at minimum, ensure no test breaks.

- [ ] **Step 6: Commit**

```bash
git add lib/seal/types.ts lib/seal/year.ts app/page.tsx tests/seal/year.test.ts
git commit -m "feat(year): SealEntry carries sealKanji from each day's skin"
```

---

### Task 17: YearScroll renders per-day seal kanji

**Files:**
- Modify: `components/year-scroll/YearScroll.tsx`
- Modify: `components/year-scroll/Seal.tsx` (if seal glyph rendering is split into a Seal component)

- [ ] **Step 1: Locate the seal glyph render**

Run: open `components/year-scroll/Seal.tsx` (or `YearScroll.tsx` if Seal is inlined). Find the JSX that renders the kanji on a filled day — likely a hardcoded `完` or a reference to `entry.kanji`.

- [ ] **Step 2: Replace the hardcoded glyph with `entry.sealKanji`**

```tsx
// before — example
<div className="seal-stamp">完</div>
// or
<div className="seal-stamp">{entry.kanji}</div>

// after
<div className="seal-stamp">{entry.sealKanji}</div>
```

If the component currently uses `entry.kanji` for the seal glyph, that was wrong (`entry.kanji` is the day's daily-seal-calendar kanji, used for the day's *theme word*, not the stamp). The stamp uses `sealKanji` (from the skin). The day's `kanji` may still be used elsewhere (e.g. in a popover) — leave those alone.

If you can't tell which is which without context, search the YearScroll component family for `entry.kanji` and inspect each use:
- "Stamp / glyph displayed when complete" → change to `sealKanji`
- "Word of the day / day kanji shown in popover" → leave as `kanji`

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open http://localhost:3000 signed in.

Year-scroll should now render seasonal kanji per filled day:
- Spring days → 桜
- Summer days → 蓮
- Autumn days → 楓
- Winter days → 雪
- Past completed days outside seasonal range → 完 (fallback)

The year visually splits into chapters of stamps. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add components/year-scroll/YearScroll.tsx components/year-scroll/Seal.tsx
git commit -m "feat(year): each completed day stamps with its skin's seal_kanji"
```

---

## Phase 6 — Final integration verification

### Task 18: End-to-end sanity sweep

This task has no code changes — it verifies the full surface works as designed.

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests pass — `tests/skins/registry.test.ts`, `tests/skins/resolve.test.ts`, `tests/skins/access.test.ts`, plus all existing tests including the updated `tests/seal/year.test.ts`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (browser)**

Run: `npm run dev`. With a signed-in account:

| Page | Expectation |
|---|---|
| `/` | Eyebrow shows `vol · 春 spring 2026 · in print` (or current-date equivalent). Year scroll has seasonal kanji per filled day. New Casual 4-tile card visible below TodayCard. |
| `/play` | New casual landing renders. 4 difficulty tiles. |
| `/play/medium` | Existing difficulty play. Inspect → `data-skin="<current-season>"` on wrapper. |
| `/play/daily` | Daily play. Inspect → `data-skin` matches today's daily season. Header reads `Daily № NNNN · DD MMM · 春` (kanji, not "Hard"). |
| Win modal (when reached) | Stamp glyph is the skin's `seal_kanji` (e.g. 桜 in spring), not 完. |

- [ ] **Step 5: Browser console — no errors**

Open devtools console on each page. Expected: no React errors, no failed network requests, no missing keys.

- [ ] **Step 6: Final commit (if anything was tweaked)**

```bash
git status
# If clean: no commit needed.
# If something was tweaked during the sweep: commit it with an appropriate message.
```

---

## Self-review checklist (run before declaring this plan complete)

- [ ] Every spec section has an implementing task. (Coverage: data model = Tasks 1, 5, 6; theme engine = Tasks 2, 3, 4, 7, 8, 9; daily themed = Tasks 10–12; casual = Tasks 13–15; year scroll = Tasks 16–17.)
- [ ] No "TODO" / "TBD" / "implement later" placeholders in any code block.
- [ ] Type names match across tasks: `SkinRecord`, `SkinResolved`, `Surface`, `SkinRegistryEntry` — used consistently.
- [ ] Function signatures match: `resolveActiveSkin(args)` referenced in Tasks 3, 8, 10, 14, 15, 16 — same shape everywhere.
- [ ] CSS palette keys (`spring`, `summer`, `autumn`, `winter`, `sumi`, `indigo`, `default`) match the registry's `paletteKey` values exactly.
- [ ] Migration order: `0008_skins_tables.sql` (Task 1) → seed (Task 5) → `0009_skins_not_null.sql` (Task 6). No NOT NULL before backfill.
- [ ] Tasks are ordered by dependency: types/registry/resolve before they're imported in layout/pages.

---

## Out of scope — covered in future plans

| Concern | Plan |
|---|---|
| Skin catalog page (`/skins`) with seasonal + premium listing | Plan 2 (monetization) |
| Stripe per-skin checkout (`POST /api/stripe/checkout/skin`) | Plan 2 |
| Pro skin chip in masthead + override picker UI | Plan 2 (depends on catalog) |
| `/pro` page copy refresh ("No ads, ever" → "The full skin library.") | Plan 2 |
| Placement ink VFX | Plan 3 (VFX/SFX) |
| Solve ceremony (ink-wash + wood-block thunk + sustained tone) | Plan 3 |
| Sound on/off toggle in account settings | Plan 3 |
