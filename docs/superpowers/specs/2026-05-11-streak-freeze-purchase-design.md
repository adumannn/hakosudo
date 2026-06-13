# Streak-Freeze Purchase — Design

**Date:** 2026-05-11
**Status:** drafted (awaiting user review)
**Scope:** Add a buy flow for streak freezes so signed-in users (Pro and non-Pro) can purchase credits in Stripe sandbox, see a balance, and spend them to recover a missed day within the existing 24-hour window. Demo-quality Stripe integration (success-callback pattern, no webhook).

## Goals

1. **Make the feature real for non-Pro users** — today only Pro users see the freeze prompt at all; opening this up unlocks the feature for everyone with a path that doesn't require Pro.
2. **Show a balance** — users see how many freezes they own, separate from monthly Pro allotment, so the value of buying is concrete.
3. **End-to-end demo** — a reviewer can: open the sheet → buy a bundle → return from Stripe → see balance update → miss a day → spend a credit → keep the streak.

## Non-goals

- No webhook infrastructure. Entitlements are granted by a server-side success-page callback that verifies the Stripe session.
- No refunds, no credit expiry, no carryover-after-cancel rules — credits never expire and behave like any other paid entitlement.
- No bulk gifting, gift codes, or referral grants.
- No mobile/native IAP — web Stripe Checkout only.
- No retroactive grants for users who already missed days before the migration.

---

## 1. Architecture overview

One migration, two new endpoints, one extended endpoint, one extended component, one new component, one new success page.

**State (Postgres):**

- `profiles.freeze_credits` — int column, owned-but-unused freeze count for the user.
- `freeze_purchases` — idempotency log keyed on Stripe session id; ensures the success callback can be replayed safely.

**Endpoints:**

- `POST /api/freezes/checkout` *(new)* — creates a Stripe Checkout session for a bundle SKU and redirects.
- `POST /api/freezes/grant` *(new)* — called from the success page; verifies the session with Stripe and credits the balance idempotently.
- `POST /api/seal/freeze` *(extended)* — now consumes from allotment first, credits second; non-Pro users no longer 403.

**Components:**

- `<FreezeSheet />` *(new)* — Radix Sheet showing balance, copy, and bundle purchase buttons. Opens from `<UserMenu />`.
- `<TodayCard />` *(extended)* — replaces the inline link with a small block that branches on balance: "apply freeze" if any credits/allotment exist, "buy a freeze" otherwise.

**Pages:**

- `app/freezes/success/page.tsx` *(new)* — receives the `session_id` query param, calls `/api/freezes/grant`, shows a confirmation.

**Modified data fetchers:**

- `lib/auth/identity.ts` `getProfile()` — already reads `profiles`; add `freeze_credits` to the selected columns.
- `app/_home-year-data.ts` — drop the `if (profile?.is_pro)` gate around `freezePrompt`; expose `freeze_credits` for the prompt CTA branch.

---

## 2. Data model

### `profiles.freeze_credits`

```sql
alter table public.profiles
  add column freeze_credits int not null default 0
  check (freeze_credits >= 0);
```

Rationale: a counter, not a per-credit ledger. The "expense" side is already tracked by `streak_freezes` (one row per consumed freeze, with `granted_at` timestamp). A separate per-credit ledger would let us audit "which purchase did this consumed freeze come from", but that audit isn't load-bearing for the demo or the user experience — the user only cares about (a) what they own and (b) what they've used.

### `freeze_purchases`

```sql
create table public.freeze_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  sku text not null,
  quantity int not null check (quantity > 0),
  amount_cents int not null,
  created_at timestamptz not null default now()
);
create index freeze_purchases_user_idx on public.freeze_purchases(user_id, created_at desc);

alter table public.freeze_purchases enable row level security;
create policy fp_owner_select on public.freeze_purchases for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy: writes happen via the security-definer RPC below.
```

The unique constraint on `stripe_session_id` is the idempotency primitive. The grant endpoint inserts first; if the insert succeeds, it increments `freeze_credits`; if the insert fails with 23505, it returns the current balance without double-crediting.

### Atomicity RPCs

Two RPCs in the same migration encapsulate the credit/log writes that must be transactional. Both run as `security definer` so the route handlers can call them without a service-role client:

```sql
create or replace function public.grant_freeze_credits(
  p_user_id uuid,
  p_session_id text,
  p_sku text,
  p_quantity int,
  p_amount_cents int
) returns table(balance int, granted int)
  -- balance: new credit balance (or current balance on replay)
  -- granted: p_quantity on first call, 0 on duplicate session (idempotent replay)
language plpgsql security definer as $$
declare
  v_balance int;
begin
  insert into public.freeze_purchases (user_id, stripe_session_id, sku, quantity, amount_cents)
  values (p_user_id, p_session_id, p_sku, p_quantity, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  if not found then
    -- replay: session already granted; return current balance with granted = 0
    select freeze_credits into v_balance from public.profiles where id = p_user_id;
    balance := v_balance; granted := 0; return next; return;
  end if;

  update public.profiles
     set freeze_credits = freeze_credits + p_quantity
   where id = p_user_id
   returning freeze_credits into v_balance;
  balance := v_balance; granted := p_quantity; return next;
end $$;

create or replace function public.consume_freeze_credit(
  p_user_id uuid,
  p_date date,
  p_granted_month date
) returns int  -- new balance, or -1 if no credits / already frozen
language plpgsql security definer as $$
declare
  v_balance int;
begin
  update public.profiles
     set freeze_credits = freeze_credits - 1
   where id = p_user_id and freeze_credits > 0
   returning freeze_credits into v_balance;
  if v_balance is null then return -1; end if;

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
end $$;
```

Both functions own the consistency: the grant RPC ensures the purchase row and the balance bump succeed together; the consume RPC ensures the credit decrement and the `streak_freezes` insert succeed together, with automatic refund on conflict.

Migration filename: `0012_freeze_credits.sql` (next after `0011_premium_skin_prices.sql`). Contains: column add, table create, RLS policies, both RPCs, and `grant execute on function ... to authenticated`.

---

## 3. SKUs

Two Stripe products created manually in the sandbox dashboard:

| SKU       | Quantity | Price    | Stripe env var               |
|-----------|----------|----------|------------------------------|
| `freeze_1`| 1        | $1.00    | `STRIPE_PRICE_ID_FREEZE_1`   |
| `freeze_5`| 5        | $3.00    | `STRIPE_PRICE_ID_FREEZE_5`   |

The mapping lives in `lib/stripe/freeze-prices.ts`, mirroring the existing `lib/stripe/skin-prices.ts`:

```ts
const FREEZE_SKUS = {
  freeze_1: { quantity: 1, priceEnv: "STRIPE_PRICE_ID_FREEZE_1" },
  freeze_5: { quantity: 5, priceEnv: "STRIPE_PRICE_ID_FREEZE_5" },
} as const;
export type FreezeSku = keyof typeof FREEZE_SKUS;
export function isFreezeSku(s: string): s is FreezeSku { /* ... */ }
export function getFreezePriceId(s: FreezeSku): string | null { /* ... */ }
export function getFreezeQuantity(s: FreezeSku): number { /* ... */ }
```

Bundle metadata (quantity, dollar price for display) is the source of truth in this file; the UI imports it directly so the sheet and the API agree.

---

## 4. Endpoints

### `POST /api/freezes/checkout`

Body: form-encoded `sku=freeze_1 | freeze_5`. Mirrors `app/api/stripe/checkout/skin/route.ts`:

1. `getCurrentUser()`; redirect to `/auth/login` if no user.
2. Validate `sku` via `isFreezeSku`; 400 if not.
3. Look up Stripe price id; 503 if env var unset.
4. Create checkout session: `mode: "payment"`, single line item, `success_url: ${SITE_URL}/freezes/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url: ${SITE_URL}/freezes/cancel` (just shows "Cancelled" + back link, no API call). `metadata: { user_id, sku, quantity }`.
5. 303 redirect to `session.url`.

### `POST /api/freezes/grant`

Body: JSON `{ session_id: string }`. Called client-side from the success page on mount.

1. `getCurrentUser()`; 401 if no user.
2. `stripe.checkout.sessions.retrieve(session_id)`; 503 on Stripe error.
3. Verify `session.payment_status === "paid"` (400 if not).
4. Verify `session.metadata.user_id === user.id` (403 if mismatch — defends against another user pasting your session id).
5. Verify `isFreezeSku(session.metadata.sku)` (400 if not).
6. Call `grant_freeze_credits` RPC (see §2). Returns `table(balance int, granted int)` — supabase-js wraps this as `[{ balance, granted }]`. `granted` is `p_quantity` on first call and `0` on idempotent replay; `balance` is always the current credit count.
7. Read `balance` and `granted` directly from the first row of the RPC result — no separate read needed.
8. Return `{ ok: true, balance: <new>, granted }`.

The RPC encapsulates atomicity; the route doesn't need to manage transactions manually.

### `POST /api/seal/freeze` *(extended)*

Existing route, modified to support credits + non-Pro:

1. Auth + body validation: unchanged.
2. 24-hour window check: unchanged.
3. `getProfile()`: unchanged but now also reads `freeze_credits`.
4. **Drop the `pro-only` 403.**
5. Already-completed check: unchanged.
6. **Consume in order** via `chooseFreezeSource(profile, allotmentUsed, allotment)`:
   - `"allotment"` — Pro with allotment available: insert into `streak_freezes` directly (existing logic). On 23505 → 400 `already-frozen`.
   - `"credit"` — credits available (Pro with exhausted allotment, or any non-Pro with credits): call `consume_freeze_credit` RPC. If it returns `-1` → 403 `no-freezes` (covers both "raced to 0" and "already-frozen").
   - `"none"` — 403 `no-freezes`.
7. Return `{ ok: true, source: "allotment" | "credit", remaining_allotment, balance }`.

The "allotment first" rule is captured in a small pure helper `chooseFreezeSource(profile, allotmentUsed, allotment)` exported from `lib/seal/freeze.ts`, so the route just consults it.

---

## 5. UI surface

### 5.1 `<FreezeSheet />`

`components/freezes/FreezeSheet.tsx`. Rendered as a server-component inside a client-side Sheet (Radix from shadcn). Reads `getProfile()` for `freeze_credits` and `is_pro`; if Pro, also queries `streak_freezes` for the current month to compute remaining allotment.

Structure:

```text
[Sheet]
  [Header]  "Streak Freezes"
  [Balance row]
     "3 freezes"           ← profile.freeze_credits, big numeric (kdate-jp class)
     "2 monthly free remaining · Pro"   ← optional second line if Pro
  [Copy]
     "Recover a missed day within 24 hours. Keeps your streak."
  [Bundles]
     <form action="/api/freezes/checkout" method="POST">
       <input type="hidden" name="sku" value="freeze_1" />
       <button>1 freeze — $1</button>
     </form>
     <form action="/api/freezes/checkout" method="POST">
       <input type="hidden" name="sku" value="freeze_5" />
       <button>5 freezes — $3  <span>save 40%</span></button>
     </form>
  [Footer]  small mono text: "Sandbox · use test card 4242 4242 4242 4242"
```

Visual style follows the existing `/pro` page: `bg-seal`, `text-bone`, `mincho`/`mono`/`ital` classes, vermillion accent on the recommended bundle. Buttons reuse `btn-hako` styles.

### 5.2 `<UserMenu />` entry

Add one item between Profile and Upgrade (`components/auth/UserMenu.tsx`):

```tsx
<DropdownMenuItem asChild>
  <button onClick={() => setSheetOpen(true)}>Streak Freezes</button>
</DropdownMenuItem>
```

This requires the menu to host the sheet state. Since `UserMenu` is currently an async server component, refactor into a thin server wrapper (auth check + balance fetch) that passes data to a `<UserMenuClient />` which owns the dropdown + sheet open state. The sheet body itself can still be a server component rendered as `children`; if the sheet needs live data after a purchase, the success-page redirect re-renders the home page server-side.

### 5.3 `<TodayCard />` inline prompt

Replace the existing single inline link (lines 127–138 of `components/year-scroll/TodayCard.tsx`) with a block:

```text
[border-top, pt-4, max-w-44ch]
  ital sumi:    "yesterday — 火 — missed."
  if can-apply: [button "apply freeze"]  small-mono subtext: "1 monthly · 0 credits"  or  "0 monthly · 3 credits"
  else:         [button "buy a freeze"]  small-mono subtext: "$1 · keeps your streak"
                  ↳ opens FreezeSheet (lifted out into a portal so it works from inside TodayCard)
```

`freezePrompt` data shape extended:

```ts
freezePrompt: {
  date: string;
  kanji: string;
  allotmentRemaining: number;  // 0 for non-Pro
  credits: number;
} | null;
```

The CTA branches on `(allotmentRemaining + credits) > 0`.

### 5.4 Success page `app/freezes/success/page.tsx`

Client component. On mount:

1. Read `session_id` from `useSearchParams()`.
2. If missing → render "Something went wrong" + link home.
3. `POST /api/freezes/grant` with the session id.
4. While pending: "Finishing up…"
5. On success: large vermillion "+N streak freezes", smaller "balance: M", two buttons: "back to today" (`/`) and "buy more" (re-opens the sheet via query param on home).
6. On error: "Couldn't confirm purchase — contact support." (Sandbox demo; this path shouldn't fire in normal use.)

Reload-safe because of the idempotent grant endpoint.

### 5.5 Cancel page `app/freezes/cancel/page.tsx`

Trivial: "Purchase cancelled." + back link. No API call.

---

## 6. State plumbing

`getProfile()` in `lib/auth/identity.ts` selects an explicit column list (`id, city, is_pro, active_skin_id, username, sfx_enabled, created_at`) into a `Profile` interface. Extend both: add `freeze_credits` to the `select(...)` string and add `freeze_credits: number` to the `Profile` interface.

`_home-year-data.ts`:
- Remove the `if (profile?.is_pro)` gate around `freezePrompt`.
- For non-Pro users with a missed yesterday, set `allotmentRemaining: 0` and pass `credits: profile.freeze_credits`.
- Set `freezePrompt` only when yesterday is missed AND a streak existed (don't tempt purchases on day 1).

The "streak existed" condition: yesterday is `empty`, and the user has at least one prior completion within the last 7 days. Otherwise there's no streak to save — showing a buy prompt would feel like an ad. Captured as a tiny helper `hasRecoverableStreak(series, today)` in `lib/seal/freeze.ts`.

---

## 7. Error & edge cases

| Scenario | Behavior |
|---|---|
| User closes Stripe tab before redirect | Card charged but balance not updated. Sandbox-acceptable; document in the cancel page footer. A follow-up could add a "Check pending purchases" button that lists recent Stripe sessions for the user via API. |
| User refreshes `/freezes/success` | Idempotent — `freeze_purchases` unique constraint blocks the second grant. Page shows balance, `granted: 0`. |
| Another user pastes my `session_id` into their browser | Blocked by `metadata.user_id` mismatch check in `/api/freezes/grant`. |
| Two tabs redeem the same missed day | First insert into `streak_freezes (user_id, date)` succeeds; second hits 23505. If a credit was decremented for the second attempt, we refund it (`+1`). |
| User has both allotment and credits, redeems | Allotment consumed (no credit decrement). |
| Non-Pro user, no credits, no missed day | No prompt shown. Sheet is reachable via account menu showing balance 0 + bundles. |
| Migration runs on existing user | `freeze_credits` defaults to 0; no other change. Existing Pro freeze prompts continue to work. |
| Stripe env vars unset (CI, fresh local) | 503 from `/api/freezes/checkout`; bundles in sheet still render but fail-to-redirect with a toast. Out of scope to handle elegantly. |

---

## 8. Testing

**Unit (Vitest):**

- `chooseFreezeSource(profile, allotmentUsed, allotment)` — table-driven: Pro/allotment-left → "allotment"; Pro/no-allotment/credits → "credit"; non-Pro/credits → "credit"; nothing → "none".
- `hasRecoverableStreak(series, today)` — table-driven: empty series → false; one completion 2 days ago → true; only completion is today → false.
- `getFreezeQuantity(sku)` — round-trip on both SKUs.

**Integration (Vitest + supabase test client):**

- `/api/freezes/grant`:
  - Happy path: mock `stripe.checkout.sessions.retrieve` to return a paid session with metadata, assert balance increments by `quantity`.
  - Idempotency: call twice with same session id, assert balance increments once, second call returns `granted: 0`.
  - User mismatch: session metadata user_id != auth user → 403.
  - Unpaid session → 400.
- `/api/seal/freeze`:
  - Non-Pro user with credits → consumes credit, inserts row.
  - Pro user with allotment + credits → consumes allotment, credits untouched.
  - No allotment, no credits → 403 `no-freezes`.

**Manual demo script (for nFactorial reviewer):**

1. Log in as non-Pro test user.
2. Open account menu → Streak Freezes. Balance shows 0.
3. Click "5 freezes — $3". Redirected to Stripe sandbox; pay with 4242 test card.
4. Land on `/freezes/success`. See "+5 streak freezes · balance: 5".
5. Reload page → still balance 5, no double-grant.
6. Navigate home. (For demo realism: have a test fixture that marks yesterday as missed.) Prompt shows "yesterday — 火 — missed. [apply freeze] 0 monthly · 5 credits".
7. Click apply freeze → seal flips to freeze state, balance decrements to 4.

---

## 9. File-level change list

**New files:**
- `supabase/migrations/0012_freeze_credits.sql` — column, table, RLS, both RPCs (`grant_freeze_credits`, `consume_freeze_credit`), grants to `authenticated`.
- `lib/stripe/freeze-prices.ts`
- New helpers `chooseFreezeSource`, `hasRecoverableStreak` added to existing `lib/seal/freeze.ts` (small enough to colocate with `computeAllotment`).
- `app/api/freezes/checkout/route.ts`
- `app/api/freezes/grant/route.ts`
- `app/freezes/success/page.tsx`
- `app/freezes/cancel/page.tsx`
- `components/freezes/FreezeSheet.tsx`
- `components/auth/UserMenuClient.tsx` (extracted client wrapper)
- `tests/freezes.test.ts` (unit + integration)

**Modified files:**
- `components/year-scroll/TodayCard.tsx` — replace inline link block; consume new `freezePrompt` shape.
- `components/auth/UserMenu.tsx` — refactor to server-wrapper + client menu; add Streak Freezes entry.
- `app/_home-year-data.ts` — drop Pro gate; widen `freezePrompt` shape; add `hasRecoverableStreak` check.
- `app/api/seal/freeze/route.ts` — drop Pro 403; consume-order branch; rollback on streak_freezes conflict.
- `lib/auth/identity.ts` — add `freeze_credits` to `getProfile()` select list.
- `app/HomeHeroSection.tsx` — pass widened `freezePrompt` through.

---

## 10. Open questions

None — all design decisions confirmed with user during brainstorming.
