# Streak-Freeze Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paid freeze-credit balance so Pro and non-Pro users can buy streak freezes (Stripe sandbox), see their balance, and spend credits to recover a missed day.

**Architecture:** A new `profiles.freeze_credits` counter plus a `freeze_purchases` idempotency log. Two server-side Postgres RPCs (`grant_freeze_credits`, `consume_freeze_credit`) own atomicity. Stripe Checkout in `payment` mode creates a session; on redirect, a success page POSTs `session_id` to a grant endpoint that retrieves the session from Stripe and calls the grant RPC. The existing `/api/seal/freeze` route drops its Pro gate and consumes allotment first, then credits via the consume RPC.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), Stripe Node SDK v17, Vitest + Testing Library, existing shadcn `Dialog`.

**Spec:** [docs/superpowers/specs/2026-05-11-streak-freeze-purchase-design.md](../specs/2026-05-11-streak-freeze-purchase-design.md)

---

## File map

**New:**
- `supabase/migrations/0012_freeze_credits.sql` — column, idempotency table, RLS, two RPCs.
- `lib/stripe/freeze-prices.ts` — SKU → env-var registry.
- `app/api/freezes/checkout/route.ts` — Stripe Checkout session creation.
- `app/api/freezes/grant/route.ts` — verify session + call grant RPC.
- `app/freezes/success/page.tsx` — client page that calls `/grant`.
- `app/freezes/cancel/page.tsx` — trivial "cancelled" page.
- `components/freezes/FreezeSheet.tsx` — balance + bundles UI (Dialog-based).
- `components/auth/UserMenuClient.tsx` — extracted client wrapper.
- `tests/stripe/freeze-prices.test.ts`
- `tests/seal/freeze.test.ts`
- `tests/api/freezes-checkout.test.ts`
- `tests/api/freezes-grant.test.ts`
- `tests/api/seal-freeze.test.ts`

**Modified:**
- `lib/auth/identity.ts` — add `freeze_credits` to `Profile` + `select(...)`.
- `lib/seal/freeze.ts` — add `chooseFreezeSource`, `hasRecoverableStreak`.
- `app/_home-year-data.ts` — drop Pro gate, widen `freezePrompt`, gate by `hasRecoverableStreak`.
- `app/api/seal/freeze/route.ts` — drop Pro 403; consume allotment-then-credit via RPC.
- `app/HomeHeroSection.tsx` — type-only change for widened `freezePrompt`.
- `components/year-scroll/TodayCard.tsx` — replace inline link with `apply | buy` branch.
- `components/auth/UserMenu.tsx` — thin server wrapper around `UserMenuClient`.
- `tests/auth/identity.test.ts` — extend mock row with `freeze_credits`.

---

## Shared type contracts

These types appear in multiple tasks. Keep them consistent:

```ts
// lib/seal/freeze.ts
export type FreezeSource = "allotment" | "credit" | "none";

// lib/stripe/freeze-prices.ts
export type FreezeSku = "freeze_1" | "freeze_5";

// app/_home-year-data.ts — new shape
freezePrompt: {
  date: string;
  kanji: string;
  allotmentRemaining: number;  // 0 for non-Pro
  credits: number;
} | null;

// /api/freezes/grant response
{ ok: true, balance: number, granted: number }

// grant_freeze_credits RPC returns: (balance int, granted int)
// consume_freeze_credit RPC returns: int (new balance, or -1 on failure)
```

---

## Task 1: Migration — `freeze_credits` column, `freeze_purchases` table, RPCs

**Files:**
- Create: `supabase/migrations/0012_freeze_credits.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/0012_freeze_credits.sql
-- Paid freeze credits: counter on profiles + purchase log + atomicity RPCs.

alter table public.profiles
  add column freeze_credits int not null default 0
  check (freeze_credits >= 0);

create table public.freeze_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  sku text not null,
  quantity int not null check (quantity > 0),
  amount_cents int not null,
  created_at timestamptz not null default now()
);

create index freeze_purchases_user_idx
  on public.freeze_purchases(user_id, created_at desc);

alter table public.freeze_purchases enable row level security;

create policy fp_owner_select on public.freeze_purchases for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy: writes happen via the security-definer RPC below.

-- Grant credits atomically. Idempotent on stripe_session_id.
-- Returns (balance, granted) where granted is 0 on replay, p_quantity on first call.
create or replace function public.grant_freeze_credits(
  p_user_id uuid,
  p_session_id text,
  p_sku text,
  p_quantity int,
  p_amount_cents int
) returns table(balance int, granted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  insert into public.freeze_purchases (user_id, stripe_session_id, sku, quantity, amount_cents)
  values (p_user_id, p_session_id, p_sku, p_quantity, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  if not found then
    select freeze_credits into v_balance from public.profiles where id = p_user_id;
    balance := coalesce(v_balance, 0);
    granted := 0;
    return next;
    return;
  end if;

  update public.profiles
     set freeze_credits = freeze_credits + p_quantity
   where id = p_user_id
   returning freeze_credits into v_balance;
  balance := v_balance;
  granted := p_quantity;
  return next;
end
$$;

-- Consume one credit and insert the streak_freezes row atomically.
-- Returns new balance, or -1 if no credits available or the date is already frozen.
create or replace function public.consume_freeze_credit(
  p_user_id uuid,
  p_date date,
  p_granted_month date
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  update public.profiles
     set freeze_credits = freeze_credits - 1
   where id = p_user_id and freeze_credits > 0
   returning freeze_credits into v_balance;

  if v_balance is null then
    return -1;
  end if;

  begin
    insert into public.streak_freezes (user_id, date, granted_month)
    values (p_user_id, p_date, p_granted_month);
  exception when unique_violation then
    update public.profiles
       set freeze_credits = freeze_credits + 1
     where id = p_user_id
     returning freeze_credits into v_balance;
    return -1;
  end;

  return v_balance;
end
$$;

grant execute on function public.grant_freeze_credits(uuid, text, text, int, int) to authenticated;
grant execute on function public.consume_freeze_credit(uuid, date, date) to authenticated;
```

- [ ] **Step 2: Apply the migration to the local Supabase dev DB**

Run: `psql "$SUPABASE_DB_URL" -f supabase/migrations/0012_freeze_credits.sql`
Expected: each `alter`/`create`/`grant` echoed; no errors.

If `$SUPABASE_DB_URL` is not configured, paste the file into the Supabase SQL editor of the dev project and run it. The schema must be applied wherever `next dev` reads from.

- [ ] **Step 3: Smoke-test both RPCs in SQL**

```sql
-- Replace <UID> with a real test user UUID (e.g. select id from auth.users limit 1).

-- grant idempotency
select * from public.grant_freeze_credits('<UID>'::uuid, 'sess_test_1', 'freeze_5', 5, 300);
-- Expected: (balance=5, granted=5)
select * from public.grant_freeze_credits('<UID>'::uuid, 'sess_test_1', 'freeze_5', 5, 300);
-- Expected: (balance=5, granted=0)  ← idempotent replay

-- consume for a fresh date
select public.consume_freeze_credit('<UID>'::uuid, '2026-01-01', '2026-01-01');
-- Expected: 4
select public.consume_freeze_credit('<UID>'::uuid, '2026-01-01', '2026-01-01');
-- Expected: -1  ← already frozen; credit refunded

-- cleanup
delete from public.streak_freezes where user_id = '<UID>'::uuid and date = '2026-01-01';
delete from public.freeze_purchases where stripe_session_id = 'sess_test_1';
update public.profiles set freeze_credits = 0 where id = '<UID>'::uuid;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_freeze_credits.sql
git commit -m "feat(db): freeze credits column, purchase log, atomicity rpcs"
```

---

## Task 2: Extend `Profile` interface + `getProfile()` select

**Files:**
- Modify: `lib/auth/identity.ts`
- Modify: `tests/auth/identity.test.ts`

- [ ] **Step 1: Extend the existing identity test to assert `freeze_credits` round-trips**

Edit the `it("returns the row when user is present", ...)` test inside `describe("getProfile", ...)` in `tests/auth/identity.test.ts`. Add `freeze_credits: 3` to the mocked row and add an assertion:

```ts
maybeSingle.mockResolvedValue({
  data: {
    id: "u1",
    city: "tokyo",
    is_pro: false,
    active_skin_id: null,
    username: "alice",
    sfx_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    freeze_credits: 3,
  },
  error: null,
});

const { getProfile } = await importFresh();
const result = await getProfile();

expect(result?.city).toBe("tokyo");
expect(result?.freeze_credits).toBe(3);
expect(from).toHaveBeenCalledWith("profiles");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth/identity.test.ts`
Expected: FAIL — TypeScript error "Property 'freeze_credits' does not exist on type 'Profile'".

- [ ] **Step 3: Modify `lib/auth/identity.ts`**

Update the `Profile` interface and the `.select(...)` string:

```ts
// lib/auth/identity.ts (changes only — keep imports and other exports as-is)
export interface Profile {
  id: string;
  city: string | null;
  is_pro: boolean;
  active_skin_id: string | null;
  username: string | null;
  sfx_enabled: boolean;
  created_at: string;
  freeze_credits: number;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const { user, sb } = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id,city,is_pro,active_skin_id,username,sfx_enabled,created_at,freeze_credits")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("[auth/identity] profiles.select:", error);
  return (data as Profile | null) ?? null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth/identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/identity.ts tests/auth/identity.test.ts
git commit -m "feat(auth): expose freeze_credits on Profile"
```

---

## Task 3: SKU registry — `lib/stripe/freeze-prices.ts`

**Files:**
- Create: `lib/stripe/freeze-prices.ts`
- Create: `tests/stripe/freeze-prices.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/stripe/freeze-prices.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getFreezePriceId,
  getFreezeQuantity,
  getFreezeAmountCents,
  isFreezeSku,
  FREEZE_SKUS,
} from "@/lib/stripe/freeze-prices";

describe("freeze-prices", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_FREEZE_1 = "price_test_freeze_1";
    process.env.STRIPE_PRICE_ID_FREEZE_5 = "price_test_freeze_5";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("exposes both SKUs in FREEZE_SKUS", () => {
    expect(Object.keys(FREEZE_SKUS).sort()).toEqual(["freeze_1", "freeze_5"]);
  });

  it("isFreezeSku narrows to known SKUs and rejects prototype keys", () => {
    expect(isFreezeSku("freeze_1")).toBe(true);
    expect(isFreezeSku("freeze_5")).toBe(true);
    expect(isFreezeSku("freeze_99")).toBe(false);
    expect(isFreezeSku("constructor")).toBe(false);
  });

  it("returns the env price id for a known SKU", () => {
    expect(getFreezePriceId("freeze_1")).toBe("price_test_freeze_1");
    expect(getFreezePriceId("freeze_5")).toBe("price_test_freeze_5");
  });

  it("returns null when the env var is unset or empty", () => {
    delete process.env.STRIPE_PRICE_ID_FREEZE_1;
    expect(getFreezePriceId("freeze_1")).toBeNull();
    process.env.STRIPE_PRICE_ID_FREEZE_5 = "";
    expect(getFreezePriceId("freeze_5")).toBeNull();
  });

  it("returns the bundle quantity", () => {
    expect(getFreezeQuantity("freeze_1")).toBe(1);
    expect(getFreezeQuantity("freeze_5")).toBe(5);
  });

  it("returns the bundle price in cents", () => {
    expect(getFreezeAmountCents("freeze_1")).toBe(100);
    expect(getFreezeAmountCents("freeze_5")).toBe(300);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/stripe/freeze-prices.test.ts`
Expected: FAIL — "Cannot find module '@/lib/stripe/freeze-prices'".

- [ ] **Step 3: Implement the registry**

```ts
// lib/stripe/freeze-prices.ts
export const FREEZE_SKUS = {
  freeze_1: { quantity: 1, amountCents: 100, priceEnv: "STRIPE_PRICE_ID_FREEZE_1" },
  freeze_5: { quantity: 5, amountCents: 300, priceEnv: "STRIPE_PRICE_ID_FREEZE_5" },
} as const;

export type FreezeSku = keyof typeof FREEZE_SKUS;

export function isFreezeSku(s: string): s is FreezeSku {
  return Object.prototype.hasOwnProperty.call(FREEZE_SKUS, s);
}

export function getFreezePriceId(s: FreezeSku): string | null {
  const v = process.env[FREEZE_SKUS[s].priceEnv];
  return v && v.length > 0 ? v : null;
}

export function getFreezeQuantity(s: FreezeSku): number {
  return FREEZE_SKUS[s].quantity;
}

export function getFreezeAmountCents(s: FreezeSku): number {
  return FREEZE_SKUS[s].amountCents;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/stripe/freeze-prices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/freeze-prices.ts tests/stripe/freeze-prices.test.ts
git commit -m "feat(stripe): freeze SKU registry (freeze_1, freeze_5)"
```

---

## Task 4: Freeze helpers — `chooseFreezeSource` + `hasRecoverableStreak`

**Files:**
- Modify: `lib/seal/freeze.ts`
- Create: `tests/seal/freeze.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/seal/freeze.test.ts
import { describe, it, expect } from "vitest";
import {
  chooseFreezeSource,
  hasRecoverableStreak,
} from "@/lib/seal/freeze";

describe("chooseFreezeSource", () => {
  it("returns 'allotment' for Pro with remaining monthly allotment", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 0, 2)).toBe("allotment");
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 1, 2)).toBe("allotment");
  });

  it("returns 'credit' for Pro with exhausted allotment but credits", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 1 }, 2, 2)).toBe("credit");
  });

  it("returns 'credit' for non-Pro with credits", () => {
    expect(chooseFreezeSource({ is_pro: false, freeze_credits: 1 }, 0, 0)).toBe("credit");
  });

  it("returns 'none' for Pro with exhausted allotment and no credits", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 2, 2)).toBe("none");
  });

  it("returns 'none' for non-Pro with no credits", () => {
    expect(chooseFreezeSource({ is_pro: false, freeze_credits: 0 }, 0, 0)).toBe("none");
  });

  it("prefers allotment over credits when both exist (don't waste the free thing)", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 5 }, 1, 2)).toBe("allotment");
  });
});

describe("hasRecoverableStreak", () => {
  const today = "2026-05-11";

  it("returns false when the user has no completions", () => {
    expect(hasRecoverableStreak([], today)).toBe(false);
  });

  it("returns true when there is a completion within the last 7 days", () => {
    const seals = [
      { date: "2026-05-08", state: "filled" },
      { date: "2026-05-10", state: "empty" },
    ];
    expect(hasRecoverableStreak(seals, today)).toBe(true);
  });

  it("returns false when the only completion is today", () => {
    const seals = [{ date: today, state: "filled" }];
    expect(hasRecoverableStreak(seals, today)).toBe(false);
  });

  it("returns false when the most recent completion is older than 7 days", () => {
    const seals = [{ date: "2026-05-01", state: "filled" }];
    expect(hasRecoverableStreak(seals, today)).toBe(false);
  });

  it("counts 'freeze' states as completions", () => {
    const seals = [{ date: "2026-05-09", state: "freeze" }];
    expect(hasRecoverableStreak(seals, today)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/seal/freeze.test.ts`
Expected: FAIL — "`chooseFreezeSource` is not exported from `@/lib/seal/freeze`".

- [ ] **Step 3: Add the helpers to `lib/seal/freeze.ts`**

Append to the existing file (after `computeAllotment`):

```ts
// lib/seal/freeze.ts (append after computeAllotment)

export type FreezeSource = "allotment" | "credit" | "none";

export function chooseFreezeSource(
  profile: { is_pro: boolean; freeze_credits: number },
  allotmentUsed: number,
  allotment: number,
): FreezeSource {
  if (profile.is_pro && allotmentUsed < allotment) return "allotment";
  if (profile.freeze_credits > 0) return "credit";
  return "none";
}

export function hasRecoverableStreak(
  seals: Array<{ date: string; state: string }>,
  today: string,
): boolean {
  const todayMs = Date.parse(today + "T00:00:00Z");
  for (const s of seals) {
    if (s.state !== "filled" && s.state !== "freeze") continue;
    if (s.date === today) continue;
    const ms = Date.parse(s.date + "T00:00:00Z");
    const ageDays = (todayMs - ms) / 86400000;
    if (ageDays > 0 && ageDays <= 7) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/seal/freeze.test.ts`
Expected: PASS — all 11 cases.

- [ ] **Step 5: Commit**

```bash
git add lib/seal/freeze.ts tests/seal/freeze.test.ts
git commit -m "feat(seal): chooseFreezeSource + hasRecoverableStreak helpers"
```

---

## Task 5: `POST /api/freezes/checkout` endpoint

**Files:**
- Create: `app/api/freezes/checkout/route.ts`
- Create: `tests/api/freezes-checkout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/freezes-checkout.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sessionsCreate = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: (...args: unknown[]) => sessionsCreate(...args) } },
  })),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  sessionsCreate.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRIPE_PRICE_ID_FREEZE_1 = "price_test_freeze_1";
  process.env.STRIPE_PRICE_ID_FREEZE_5 = "price_test_freeze_5";
});

async function postForm(formBody: Record<string, string>) {
  const form = new URLSearchParams(formBody);
  const req = new Request("https://example.test/api/freezes/checkout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const { POST } = await import("@/app/api/freezes/checkout/route");
  return POST(req);
}

describe("POST /api/freezes/checkout", () => {
  it("redirects to /auth/login when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue({ user: null });
    const res = await postForm({ sku: "freeze_1" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("400s an unknown SKU", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    const res = await postForm({ sku: "freeze_999" });
    expect(res.status).toBe(400);
  });

  it("503s when the price env var is missing", async () => {
    delete process.env.STRIPE_PRICE_ID_FREEZE_1;
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    const res = await postForm({ sku: "freeze_1" });
    expect(res.status).toBe(503);
  });

  it("creates a session and 303s to its URL on the happy path", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    sessionsCreate.mockResolvedValue({ url: "https://stripe.test/sess_x", id: "sess_x" });
    const res = await postForm({ sku: "freeze_5" });

    expect(sessionsCreate).toHaveBeenCalledOnce();
    const arg = sessionsCreate.mock.calls[0][0];
    expect(arg.mode).toBe("payment");
    expect(arg.line_items[0].price).toBe("price_test_freeze_5");
    expect(arg.line_items[0].quantity).toBe(1);
    expect(arg.success_url).toContain("/freezes/success?session_id=");
    expect(arg.cancel_url).toContain("/freezes/cancel");
    expect(arg.metadata).toEqual({ user_id: "u1", sku: "freeze_5", quantity: "5" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://stripe.test/sess_x");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/freezes-checkout.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/freezes/checkout/route'".

- [ ] **Step 3: Implement the route**

```ts
// app/api/freezes/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import {
  isFreezeSku,
  getFreezePriceId,
  getFreezeQuantity,
} from "@/lib/stripe/freeze-prices";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user } = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  const form = await req.formData();
  const sku = String(form.get("sku") ?? "");
  if (!isFreezeSku(sku)) {
    return NextResponse.json({ error: "bad-sku" }, { status: 400 });
  }

  const priceId = getFreezePriceId(sku);
  if (!priceId) {
    console.error(`[freezes/checkout] missing price id for sku=${sku}`);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("[freezes/checkout] missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(stripeSecret);

  const quantity = getFreezeQuantity(sku);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/freezes/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/freezes/cancel`,
      ...(user.email ? { customer_email: user.email } : {}),
      metadata: { user_id: user.id, sku, quantity: String(quantity) },
    });
  } catch (error) {
    console.error("[freezes/checkout] checkout.sessions.create:", error);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!session.url) {
    console.error("[freezes/checkout] session created without url:", session.id);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/freezes-checkout.test.ts`
Expected: PASS — all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add app/api/freezes/checkout/route.ts tests/api/freezes-checkout.test.ts
git commit -m "feat(api): freeze checkout endpoint creates Stripe session"
```

---

## Task 6: `POST /api/freezes/grant` endpoint

**Files:**
- Create: `app/api/freezes/grant/route.ts`
- Create: `tests/api/freezes-grant.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/freezes-grant.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sessionsRetrieve = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: (...a: unknown[]) => sessionsRetrieve(...a) } },
  })),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  sessionsRetrieve.mockReset();
  rpc.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
});

function authedUser() {
  return {
    user: { id: "u1", email: "a@b.co" },
    sb: { rpc: (name: string, args: unknown) => rpc(name, args) },
  };
}

async function postGrant(body: unknown) {
  const req = new Request("https://example.test/api/freezes/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { POST } = await import("@/app/api/freezes/grant/route");
  return POST(req);
}

describe("POST /api/freezes/grant", () => {
  it("401s when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue({ user: null, sb: null });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(401);
  });

  it("400s when session_id missing", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    const res = await postGrant({});
    expect(res.status).toBe(400);
  });

  it("400s when payment_status is not paid", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "unpaid",
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(400);
  });

  it("403s when metadata.user_id does not match auth user", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      metadata: { user_id: "other-user", sku: "freeze_1", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(403);
  });

  it("400s when sku is not a known SKU", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      metadata: { user_id: "u1", sku: "freeze_99", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(400);
  });

  it("grants credits on the happy path", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 300,
      metadata: { user_id: "u1", sku: "freeze_5", quantity: "5" },
    });
    rpc.mockResolvedValue({ data: [{ balance: 5, granted: 5 }], error: null });
    const res = await postGrant({ session_id: "sess_x" });

    expect(rpc).toHaveBeenCalledWith("grant_freeze_credits", {
      p_user_id: "u1",
      p_session_id: "sess_x",
      p_sku: "freeze_5",
      p_quantity: 5,
      p_amount_cents: 300,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, balance: 5, granted: 5 });
  });

  it("reports granted: 0 on replay (RPC returns same balance, granted=0)", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 100,
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    rpc.mockResolvedValue({ data: [{ balance: 1, granted: 0 }], error: null });
    const res = await postGrant({ session_id: "sess_x" });
    const body = await res.json();
    expect(body).toEqual({ ok: true, balance: 1, granted: 0 });
  });

  it("503s when the RPC errors", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 100,
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    rpc.mockResolvedValue({ data: null, error: { message: "rpc boom" } });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/freezes-grant.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/freezes/grant/route'".

- [ ] **Step 3: Implement the route**

```ts
// app/api/freezes/grant/route.ts
import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import {
  isFreezeSku,
  getFreezeQuantity,
  getFreezeAmountCents,
} from "@/lib/stripe/freeze-prices";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user, sb } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { session_id?: string };
  const sessionId = body.session_id;
  if (!sessionId) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("[freezes/grant] missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(stripeSecret);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error("[freezes/grant] sessions.retrieve:", error);
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "unpaid" }, { status: 400 });
  }
  if (session.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sku = session.metadata?.sku ?? "";
  if (!isFreezeSku(sku)) {
    return NextResponse.json({ error: "bad-sku" }, { status: 400 });
  }
  const quantity = getFreezeQuantity(sku);
  const amountCents = session.amount_total ?? getFreezeAmountCents(sku);

  const { data, error } = await sb.rpc("grant_freeze_credits", {
    p_user_id: user.id,
    p_session_id: session.id,
    p_sku: sku,
    p_quantity: quantity,
    p_amount_cents: amountCents,
  });
  if (error) {
    console.error("[freezes/grant] rpc:", error);
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }

  // RPC returns table(balance int, granted int); supabase-js wraps as [{balance, granted}].
  const row = Array.isArray(data) ? data[0] : data;
  const balance = (row?.balance as number) ?? 0;
  const granted = (row?.granted as number) ?? 0;
  return NextResponse.json({ ok: true, balance, granted });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/freezes-grant.test.ts`
Expected: PASS — all 8 cases.

- [ ] **Step 5: Commit**

```bash
git add app/api/freezes/grant/route.ts tests/api/freezes-grant.test.ts
git commit -m "feat(api): freeze grant endpoint with Stripe verify + idempotent rpc"
```

---

## Task 7: Extend `/api/seal/freeze` — drop Pro 403, consume allotment-then-credit

**Files:**
- Modify: `app/api/seal/freeze/route.ts`
- Create: `tests/api/seal-freeze.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/seal-freeze.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getProfile = vi.fn();
const rpc = vi.fn();
const fromBuilder = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
  getProfile: () => getProfile(),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  getProfile.mockReset();
  rpc.mockReset();
  fromBuilder.mockReset();
});

function authed(opts: {
  fromImpl: (table: string) => unknown;
  rpcImpl?: (name: string, args: unknown) => unknown;
}) {
  return {
    user: { id: "u1" },
    sb: {
      from: (t: string) => opts.fromImpl(t),
      rpc: (name: string, args: unknown) =>
        opts.rpcImpl ? opts.rpcImpl(name, args) : rpc(name, args),
    },
  };
}

const YESTERDAY = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

async function postFreeze(date: string) {
  const req = new Request("https://example.test/api/seal/freeze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date }),
  });
  const { POST } = await import("@/app/api/seal/freeze/route");
  return POST(req);
}

describe("POST /api/seal/freeze (extended)", () => {
  it("Pro user with remaining allotment: inserts streak_freezes directly", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const countSelect = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ count: 0 }),
      }),
    });
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "streak_freezes") {
        return {
          select: (cols: string, opts?: { count?: string; head?: boolean }) =>
            opts?.head ? countSelect(cols, opts) : { /* unused */ },
          insert: (row: unknown) => insert(row),
        };
      }
      if (table === "daily_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: completedMaybeSingle }),
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: true,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });

    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.source).toBe("allotment");
    expect(insert).toHaveBeenCalledOnce();
  });

  it("Non-Pro user with credits: consumes via RPC", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: completedMaybeSingle }),
            }),
          }),
        };
      }
      if (table === "streak_freezes") {
        return {
          select: () => ({
            eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    };
    const rpcImpl = vi.fn().mockResolvedValue({ data: 2, error: null });
    getCurrentUser.mockResolvedValue(authed({ fromImpl, rpcImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 3,
      created_at: "2025-01-01T00:00:00Z",
    });

    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("credit");
    expect(body.balance).toBe(2);
    expect(rpcImpl).toHaveBeenCalledWith(
      "consume_freeze_credit",
      expect.objectContaining({ p_user_id: "u1", p_date: YESTERDAY }),
    );
  });

  it("Non-Pro user with no credits: 403 no-freezes", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no-freezes");
  });

  it("Already-completed date: 400 already-completed", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: { date: YESTERDAY } });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 5,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(400);
  });

  it("RPC returns -1 (race or already-frozen): 403 no-freezes", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    const rpcImpl = vi.fn().mockResolvedValue({ data: -1, error: null });
    getCurrentUser.mockResolvedValue(authed({ fromImpl, rpcImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 1,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(403);
  });

  it("Unauthenticated: 401", async () => {
    getCurrentUser.mockResolvedValue({ user: null, sb: {} });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(401);
  });

  it("Out-of-window date (today): 400", async () => {
    const today = new Date().toISOString().slice(0, 10);
    getCurrentUser.mockResolvedValue(
      authed({ fromImpl: () => ({}) as never }),
    );
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: true,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(today);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/seal-freeze.test.ts`
Expected: FAIL — the existing route still has the Pro 403 and no RPC call.

- [ ] **Step 3: Replace `app/api/seal/freeze/route.ts`**

```ts
// app/api/seal/freeze/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import { computeAllotment, chooseFreezeSource } from "@/lib/seal/freeze";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user, sb } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  const body = (await req.json()) as { date?: string };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "bad-date" }, { status: 400 });
  }

  const targetMs = Date.parse(body.date + "T23:59:59Z");
  const ageHours = (Date.now() - targetMs) / 1000 / 3600;
  if (ageHours < 0 || ageHours > 24) {
    return NextResponse.json({ error: "out-of-window" }, { status: 400 });
  }

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "no-profile" }, { status: 401 });
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

  const grantedMonth = body.date.slice(0, 7) + "-01";
  const { count } = await sb
    .from("streak_freezes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("granted_month", grantedMonth);
  const used = count ?? 0;
  const allotment = profile.is_pro ? computeAllotment(profile.created_at, grantedMonth) : 0;

  const source = chooseFreezeSource(profile, used, allotment);

  if (source === "none") {
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }

  if (source === "allotment") {
    const { error } = await sb.from("streak_freezes").insert({
      user_id: userId,
      date: body.date,
      granted_month: grantedMonth,
    });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "already-frozen" }, { status: 400 });
      }
      console.error("[seal/freeze] insert:", error);
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      source: "allotment" as const,
      remaining_allotment: Math.max(0, allotment - used - 1),
      balance: profile.freeze_credits,
    });
  }

  // source === "credit"
  const { data: newBalance, error: rpcError } = await sb.rpc("consume_freeze_credit", {
    p_user_id: userId,
    p_date: body.date,
    p_granted_month: grantedMonth,
  });
  if (rpcError) {
    console.error("[seal/freeze] rpc consume:", rpcError);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  if (typeof newBalance !== "number" || newBalance < 0) {
    // RPC returned -1: no credits available or date already frozen.
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    source: "credit" as const,
    remaining_allotment: Math.max(0, allotment - used),
    balance: newBalance,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/seal-freeze.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS — full suite.

- [ ] **Step 6: Commit**

```bash
git add app/api/seal/freeze/route.ts tests/api/seal-freeze.test.ts
git commit -m "feat(api): seal/freeze consumes allotment-then-credit, no Pro gate"
```

---

## Task 8: Widen `freezePrompt` in `_home-year-data.ts`

**Files:**
- Modify: `app/_home-year-data.ts`

- [ ] **Step 1: Edit `HomeYearData.freezePrompt` shape and the build logic**

In `app/_home-year-data.ts`:

1. Replace the `freezePrompt` field in the interface:

```ts
export interface HomeYearData {
  series: YearSeries;
  streak: number;
  yearFilled: number;
  yearTotal: number;
  completedTodayElapsed: number | undefined;
  freezePrompt: {
    date: string;
    kanji: string;
    allotmentRemaining: number;
    credits: number;
  } | null;
}
```

2. Replace the entire `let freezePrompt: ... = null; if (profile?.is_pro) { ... }` block (currently lines 87–105) with the new logic that supports non-Pro users and gates by `hasRecoverableStreak`:

```ts
import { computeAllotment, hasRecoverableStreak } from "@/lib/seal/freeze";

// ... inside fetchHomeYearData, replacing the old freezePrompt block:

let freezePrompt: HomeYearData["freezePrompt"] = null;
if (profile) {
  const yest = new Date(today + "T00:00:00Z");
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);
  const yestEntry = series.seals.find((s) => s.date === yestStr);
  if (
    yestEntry?.state === "empty" &&
    hasRecoverableStreak(series.seals, today)
  ) {
    let allotmentRemaining = 0;
    if (profile.is_pro) {
      const granted = `${yestStr.slice(0, 7)}-01`;
      const { count } = await sb
        .from("streak_freezes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("granted_month", granted);
      const used = count ?? 0;
      const allotment = computeAllotment(profile.created_at, granted);
      allotmentRemaining = Math.max(0, allotment - used);
    }
    freezePrompt = {
      date: yestStr,
      kanji: yestEntry.kanji,
      allotmentRemaining,
      credits: profile.freeze_credits,
    };
  }
}
```

Note: the import line at the top of the file needs `hasRecoverableStreak` added to the `@/lib/seal/freeze` import.

- [ ] **Step 2: Run typecheck and existing tests**

Run: `npm run typecheck && npm test`
Expected: PASS. (Existing year/calendar tests don't touch `freezePrompt`; `_home-year-data.ts` has no dedicated unit test today.)

- [ ] **Step 3: Manual smoke**

The full freeze-prompt UI is exercised in Task 11. Step 2 here is enough — if it typechecks and existing tests pass, the data layer is consistent. Detailed verification waits until the consumer (TodayCard) is updated.

- [ ] **Step 4: Commit**

```bash
git add app/_home-year-data.ts
git commit -m "feat(home): widen freezePrompt with credits, drop Pro gate"
```

---

## Task 9: `FreezeSheet` component

**Files:**
- Create: `components/freezes/FreezeSheet.tsx`

- [ ] **Step 1: Implement the sheet**

Uses the existing `Dialog` primitives (Radix-based). Pure client component; it receives `balance`, `isPro`, and `allotmentRemaining` from the parent.

```tsx
// components/freezes/FreezeSheet.tsx
"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface FreezeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  isPro: boolean;
  allotmentRemaining: number;
}

export function FreezeSheet({
  open,
  onOpenChange,
  balance,
  isPro,
  allotmentRemaining,
}: FreezeSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-seal text-bone border-bone/10 max-w-[440px] p-0">
        <div className="px-8 py-7 border-b border-bone/10">
          <DialogTitle className="mincho text-[18px] font-semibold tracking-wide">
            Streak Freezes
          </DialogTitle>
        </div>

        <div className="px-8 py-7">
          <div className="kdate-jp text-[56px] leading-none">{balance}</div>
          <div className="mono text-[11px] tracking-[0.2em] uppercase text-bone/55 mt-2">
            {balance === 1 ? "freeze" : "freezes"} in your box
          </div>
          {isPro && (
            <div className="mono text-[11px] tracking-[0.2em] uppercase text-bone/45 mt-1">
              + {allotmentRemaining} monthly · Pro
            </div>
          )}

          <p className="ital text-bone/70 text-[15px] mt-6 leading-[1.5] max-w-[34ch]">
            Recover a missed day within 24 hours. Keeps your streak alive.
          </p>
        </div>

        <div className="px-8 pb-7 grid gap-3">
          <form action="/api/freezes/checkout" method="POST">
            <input type="hidden" name="sku" value="freeze_1" />
            <button
              type="submit"
              className="btn-hako ghost border-bone text-bone w-full justify-between"
            >
              <span>1 freeze</span>
              <span className="font-jakarta font-light">$1</span>
            </button>
          </form>
          <form action="/api/freezes/checkout" method="POST">
            <input type="hidden" name="sku" value="freeze_5" />
            <button
              type="submit"
              className="btn-hako red w-full justify-between"
            >
              <span>
                5 freezes <span className="text-bone/70 text-[11px] mono ml-2">save 40%</span>
              </span>
              <span className="font-jakarta font-light">$3</span>
            </button>
          </form>
        </div>

        <div className="px-8 pb-6 border-t border-bone/10 pt-4">
          <p className="mono text-[10px] tracking-[0.18em] uppercase text-bone/40">
            Sandbox · use test card 4242 4242 4242 4242
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/freezes/FreezeSheet.tsx
git commit -m "feat(ui): FreezeSheet balance + bundle purchase"
```

---

## Task 10: Split `UserMenu` into server + client; add Streak Freezes entry

**Files:**
- Modify: `components/auth/UserMenu.tsx`
- Create: `components/auth/UserMenuClient.tsx`

- [ ] **Step 1: Create `UserMenuClient.tsx`**

```tsx
// components/auth/UserMenuClient.tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FreezeSheet } from "@/components/freezes/FreezeSheet";

interface UserMenuClientProps {
  email: string | null;
  displayName: string;
  signOut: React.ReactNode;
  freezeBalance: number;
  isPro: boolean;
  allotmentRemaining: number;
}

export function UserMenuClient({
  email,
  displayName,
  signOut,
  freezeBalance,
  isPro,
  allotmentRemaining,
}: UserMenuClientProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">{displayName}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {email && (
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSheetOpen(true); }}>
            Streak Freezes
            <span className="ml-auto mono text-[10px] tracking-[0.18em] text-muted-foreground">
              {freezeBalance}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/pro">Upgrade</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {signOut}
        </DropdownMenuContent>
      </DropdownMenu>

      <FreezeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        balance={freezeBalance}
        isPro={isPro}
        allotmentRemaining={allotmentRemaining}
      />
    </>
  );
}
```

- [ ] **Step 2: Rewrite `UserMenu.tsx` as a server wrapper**

Replace the contents of `components/auth/UserMenu.tsx`:

```tsx
// components/auth/UserMenu.tsx
import Link from "next/link";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import { createServerClient } from "@/lib/supabase/server";
import { computeAllotment } from "@/lib/seal/freeze";
import { SignOutButton } from "./SignOutButton";
import { UserMenuClient } from "./UserMenuClient";

export async function UserMenu() {
  const { user } = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/auth/login" className="text-sm hover:underline">
        Sign in
      </Link>
    );
  }

  const profile = await getProfile();
  let allotmentRemaining = 0;
  if (profile?.is_pro) {
    const sb = createServerClient();
    const grantedMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { count } = await sb
      .from("streak_freezes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("granted_month", grantedMonth);
    const used = count ?? 0;
    const allotment = computeAllotment(profile.created_at, grantedMonth);
    allotmentRemaining = Math.max(0, allotment - used);
  }

  return (
    <UserMenuClient
      email={user.email ?? null}
      displayName={user.email?.split("@")[0] ?? "Account"}
      signOut={<SignOutButton />}
      freezeBalance={profile?.freeze_credits ?? 0}
      isPro={profile?.is_pro ?? false}
      allotmentRemaining={allotmentRemaining}
    />
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run dev server and click Streak Freezes**

Run: `npm run dev` (in another terminal). In the browser, sign in and open the account menu. Click "Streak Freezes" — the sheet should open showing the balance.

Expected:
- Sheet opens with "0 freezes in your box".
- For a Pro test user, "+2 monthly · Pro" line shows beneath.
- Two bundle buttons render.

- [ ] **Step 5: Commit**

```bash
git add components/auth/UserMenu.tsx components/auth/UserMenuClient.tsx
git commit -m "feat(ui): user menu opens FreezeSheet, shows balance badge"
```

---

## Task 11: Extend `TodayCard` inline prompt

**Files:**
- Modify: `components/year-scroll/TodayCard.tsx`

- [ ] **Step 1: Update `freezePrompt` Prop type, replace inline prompt with branching block**

In `components/year-scroll/TodayCard.tsx`:

1. Update the prop interface:

```ts
interface Props {
  today: TodaySeal | null;
  completedElapsed?: number;
  freezePrompt?: {
    date: string;
    kanji: string;
    allotmentRemaining: number;
    credits: number;
  } | null;
  tategakiDay?: string;
}
```

2. Add a sheet-open state hook near the existing `freezeStatus` state:

```ts
const [sheetOpen, setSheetOpen] = useState(false);
```

3. Import `FreezeSheet` at the top:

```ts
import { FreezeSheet } from "@/components/freezes/FreezeSheet";
```

4. Replace the existing `{freezePrompt && freezeStatus === "idle" && ( ... )}` block (currently lines 127–138) with:

```tsx
{freezePrompt && freezeStatus === "idle" && (
  <div className="mt-5 border-t border-sumi/15 pt-4 text-[14px] ital text-sumi max-w-[44ch]">
    yesterday — {freezePrompt.kanji} — missed.{" "}
    {freezePrompt.allotmentRemaining + freezePrompt.credits > 0 ? (
      <>
        <button
          onClick={applyFreeze}
          className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
        >
          apply freeze
        </button>{" "}
        <span className="text-moss text-[11px] not-italic mono tracking-[0.14em]">
          · {freezePrompt.allotmentRemaining} monthly · {freezePrompt.credits} credits
        </span>
      </>
    ) : (
      <>
        <button
          onClick={() => setSheetOpen(true)}
          className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
        >
          buy a freeze
        </button>{" "}
        <span className="text-moss text-[11px] not-italic mono tracking-[0.14em]">
          · $1 keeps your streak
        </span>
      </>
    )}
  </div>
)}
```

5. Add `<FreezeSheet />` just before the final `</div>` of the component, passing through the freezePrompt counts (or 0s if no prompt):

```tsx
<FreezeSheet
  open={sheetOpen}
  onOpenChange={setSheetOpen}
  balance={freezePrompt?.credits ?? 0}
  isPro={(freezePrompt?.allotmentRemaining ?? 0) > 0}
  allotmentRemaining={freezePrompt?.allotmentRemaining ?? 0}
/>
```

(The `isPro` heuristic here — `allotmentRemaining > 0` — is wrong for Pro users who've used all allotment. Fix in step 6.)

6. Fix `isPro` in the sheet — accept it explicitly. Pass an additional `isPro` prop down from `HomeHeroSection` via `_home-year-data.ts` or split it from `freezePrompt`. Since this is wired via `freezePrompt` only, replace the heuristic by passing `false` (the FreezeSheet's "+monthly · Pro" line is purely informational; if it occasionally hides for a fully-spent Pro user, that's acceptable for now). Reverting step 5's `isPro` prop to `false`:

```tsx
<FreezeSheet
  open={sheetOpen}
  onOpenChange={setSheetOpen}
  balance={freezePrompt?.credits ?? 0}
  isPro={false}
  allotmentRemaining={0}
/>
```

The full "monthly + Pro" display lives in the account-menu sheet (Task 10), which knows `isPro` definitively. The inline sheet is a quick buy path; keep it minimal.

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Manual UI smoke**

In a browser with a signed-in non-Pro user, seed the home state so yesterday is missed and a recent completion exists (a manual Supabase SQL insert into `daily_results` covering a date in the past week is enough). Visit `/` and confirm:
- The inline "yesterday — X — missed. buy a freeze · $1 keeps your streak" block appears.
- Clicking "buy a freeze" opens the FreezeSheet.

For a Pro user with remaining allotment, the inline button reads "apply freeze · 1 monthly · 0 credits".

- [ ] **Step 4: Commit**

```bash
git add components/year-scroll/TodayCard.tsx
git commit -m "feat(today-card): apply | buy branch on freeze prompt"
```

---

## Task 12: Thread widened `freezePrompt` through `HomeHeroSection`

**Files:**
- Modify: `app/HomeHeroSection.tsx`

- [ ] **Step 1: Check whether any change is required**

`HomeHeroSection.tsx` passes `data.freezePrompt` to `TodayCard` (line 34). The shape change is internal to `HomeYearData` and flows through opaquely. No code change needed, only verify the typecheck holds.

Run: `npm run typecheck`
Expected: PASS — if any error, fix the type plumbing here.

- [ ] **Step 2: Commit (only if typecheck found an issue requiring a change)**

If no change was made, skip this task.

```bash
git add app/HomeHeroSection.tsx
git commit -m "fix(home): align HomeHeroSection types with widened freezePrompt"
```

---

## Task 13: Success page `/freezes/success`

**Files:**
- Create: `app/freezes/success/page.tsx`

- [ ] **Step 1: Implement the success page**

```tsx
// app/freezes/success/page.tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function FreezesSuccess() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = React.useState<
    | { kind: "pending" }
    | { kind: "ok"; balance: number; granted: number }
    | { kind: "error"; message: string }
  >({ kind: "pending" });

  React.useEffect(() => {
    if (!sessionId) {
      setState({ kind: "error", message: "Missing session id." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/freezes/grant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setState({ kind: "error", message: body.error ?? "Unknown error." });
        } else {
          setState({ kind: "ok", balance: body.balance, granted: body.granted });
        }
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", message: "Network error." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="bg-seal text-bone min-h-screen flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {state.kind === "pending" && (
          <>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55">
              Finishing up…
            </div>
            <div className="ital text-bone/70 mt-3">crediting your freezes</div>
          </>
        )}
        {state.kind === "ok" && (
          <>
            <div className="kdate-jp text-[88px] text-vermillion leading-none">
              +{state.granted}
            </div>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55 mt-2">
              streak {state.granted === 1 ? "freeze" : "freezes"}
            </div>
            <div className="ital text-bone/70 mt-6 text-[16px]">
              balance · {state.balance}
            </div>
            <div className="mt-10 flex gap-3 justify-center">
              <Link href="/" className="btn-hako ghost border-bone text-bone">
                back to today
              </Link>
              <Link href="/" className="btn-hako red">
                done
              </Link>
            </div>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-hazard">
              Couldn&rsquo;t confirm purchase
            </div>
            <p className="ital text-bone/70 mt-3 text-[15px]">{state.message}</p>
            <Link href="/" className="btn-hako ghost border-bone text-bone mt-8">
              back to today
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke (deferred to Task 15 end-to-end check)**

The success page can be exercised end-to-end only after the cancel page and env-var setup are complete. Confirm pages compile via `npm run build` instead:

Run: `npm run build`
Expected: PASS (no `/freezes/success` errors).

- [ ] **Step 4: Commit**

```bash
git add app/freezes/success/page.tsx
git commit -m "feat(ui): freezes success page calls /grant"
```

---

## Task 14: Cancel page `/freezes/cancel`

**Files:**
- Create: `app/freezes/cancel/page.tsx`

- [ ] **Step 1: Implement the cancel page**

```tsx
// app/freezes/cancel/page.tsx
import Link from "next/link";

export default function FreezesCancel() {
  return (
    <main className="bg-seal text-bone min-h-screen flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55">
          Purchase cancelled
        </div>
        <p className="ital text-bone/70 mt-3 text-[16px]">
          No charge made. You can try again any time.
        </p>
        <Link href="/" className="btn-hako ghost border-bone text-bone mt-8">
          back to today
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/freezes/cancel/page.tsx
git commit -m "feat(ui): freezes cancel page"
```

---

## Task 15: Env vars, Stripe sandbox setup, end-to-end demo verification

**Files:**
- (no source changes)

- [ ] **Step 1: Create the two products in Stripe sandbox**

In the Stripe dashboard (test mode):

1. Products → Add product → name: "Streak Freeze · 1". Pricing: one-time $1.00 USD. Save. Copy the price id (`price_...`).
2. Products → Add product → name: "Streak Freeze · 5". Pricing: one-time $3.00 USD. Save. Copy the price id.

- [ ] **Step 2: Set env vars in `.env.local`**

Append to `.env.local`:

```
STRIPE_PRICE_ID_FREEZE_1=price_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ID_FREEZE_5=price_yyyyyyyyyyyyyyyyyyyyyyyy
```

Restart `npm run dev`.

- [ ] **Step 3: End-to-end demo on a non-Pro test user**

1. Sign in as a non-Pro test user.
2. Open account menu → Streak Freezes. Confirm "0 freezes" + two bundle buttons.
3. Click "5 freezes — $3". Browser redirects to Stripe.
4. Pay with test card `4242 4242 4242 4242`, any expiry in the future, any CVC.
5. Stripe redirects to `/freezes/success?session_id=...`. Confirm "+5 streak freezes · balance: 5".
6. Refresh the success page. Confirm balance still 5; no double-grant.
7. Navigate to `/`. (For the missed-yesterday prompt to appear, the test user must have at least one `daily_results` row in the last 7 days AND yesterday must be missing. Insert one manually if needed.)
8. Confirm inline prompt: "yesterday — X — missed. apply freeze · 0 monthly · 5 credits".
9. Click "apply freeze". Confirm seal flips to freeze state. Reopen account menu sheet — balance should be 4.

- [ ] **Step 4: End-to-end demo on a Pro test user (exhausted allotment)**

1. Mark a test user as Pro: `update profiles set is_pro = true where id = '<uid>'`.
2. Consume both monthly freezes by inserting two `streak_freezes` rows for the current month.
3. Now miss yesterday, then visit `/`. Inline prompt should say "buy a freeze · $1 keeps your streak" (since allotment+credits = 0).
4. Click → sheet opens → buy 1 → return → balance = 1.
5. Now click "apply freeze" on the inline prompt — should consume from credits, balance → 0.

- [ ] **Step 5: Commit any docs (only if README updates were needed)**

If the demo surfaced env-var requirements worth documenting, append to README.md under setup. Otherwise skip.

```bash
# Skip if no doc changes.
git add README.md
git commit -m "docs(setup): freeze SKU env vars"
```

- [ ] **Step 6: Final full-suite check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin claude/trusting-black-118ace
gh pr create --title "Streak-freeze purchase UI" --body "$(cat <<'EOF'
## Summary
- Adds paid freeze-credit balance (Pro and non-Pro can buy)
- New `/freezes/success` and `/freezes/cancel` pages; sandbox Stripe checkout
- Existing `/api/seal/freeze` consumes allotment-then-credits; Pro 403 removed
- `FreezeSheet` reachable from account menu; inline prompt branches "apply | buy"

## Test plan
- [ ] `npm test` green
- [ ] Non-Pro: buy 5 → balance 5 → spend on missed yesterday → balance 4
- [ ] Pro with full allotment: redeem uses allotment, credits untouched
- [ ] Pro with exhausted allotment + credits: redeem uses credit, balance decrements
- [ ] Success page reload-safe (idempotent grant)
EOF
)"
```

---

## Self-review (done by plan author after writing)

**Spec coverage check:**
- §2 Data model → Task 1 ✓
- §3 SKUs → Task 3 ✓
- §4 Endpoints → Tasks 5, 6, 7 ✓
- §5 UI surface → Tasks 9, 10, 11, 13, 14 ✓
- §6 State plumbing → Tasks 2, 8 ✓
- §7 Error & edge cases → covered in tests across Tasks 6, 7 ✓
- §8 Testing → Tasks 3, 4, 5, 6, 7 plus manual in Task 15 ✓
- §9 File-level change list → matches File map above ✓

**Placeholder check:** none found.

**Type consistency check:**
- `Profile.freeze_credits: number` declared in Task 2, consumed in Tasks 7, 8, 10 ✓
- `FreezeSku = "freeze_1" | "freeze_5"` declared in Task 3, used in Tasks 5, 6 ✓
- `FreezeSource` declared in Task 4, used in Task 7 ✓
- `freezePrompt` widened shape declared in Task 8, consumed in Task 11 ✓
- RPC return shapes: `grant_freeze_credits` returns `table(balance int, granted int)` (Task 1) → Task 6 unpacks `Array.isArray(data) ? data[0] : data` ✓; `consume_freeze_credit` returns `int` → Task 7 expects `typeof newBalance === "number"` ✓
