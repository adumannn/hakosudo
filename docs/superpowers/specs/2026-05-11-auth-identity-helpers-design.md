# Auth identity helpers — design

Date: 2026-05-11
Scope: Group A from the [architecture audit](./2026-05-11-architecture-audit-findings.md) (findings H4, H5, M8).
Status: design approved; ready for implementation plan.

## Goal

Eliminate the most-repeated pattern in the codebase: open-coded auth identity checks and `profiles` selects. Introduce two cached helpers (`getCurrentUser`, `getProfile`) plus a page-redirect convenience helper (`requireUser`), migrate 23 of 24 call sites to them (the `stripe/checkout/skin` route stays direct — see Migration § exception), and document the four Supabase client factories.

## Outcomes

- 23 auth call sites + 10 `profiles.select` reads collapse to 3 helpers (writes, 3 year-data reads, and `stripe/checkout/skin/route.ts`'s defensive auth-error handling explicitly out of scope)
- Every page renders with 1–2 fewer Supabase round-trips per request (request-level dedupe via `react.cache`)
- Signed-out traffic short-circuits to null with zero Supabase calls
- `getUser()` vs `getSession()` inconsistency (17/7 arbitrary split) ends — everything is JWT-validated `getUser()`
- "Which Supabase client when" decision is documented in JSDoc on each factory
- `Profile` becomes a single typed interface; new profile columns are added in one place

Explicit non-goals (deferred to other groups from the audit):
- Standardizing action/route error envelopes (H8)
- Collapsing `saveGame` / `syncGuestGame` (H3)
- Decomposing `GameShell.tsx` (H7)
- Trivial helper consolidation (H9, H10)
- Year-data fetch deduplication (H6)

## Module layout

New file: `lib/auth/identity.ts`. Single source of truth for "who is the viewer."

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export interface Identity {
  user: User | null;
  sb: SupabaseClient;
}

export const getCurrentUser = cache(async (): Promise<Identity> => {
  const sb = createServerClient();
  if (!hasSupabaseAuthCookie(cookies().getAll())) {
    return { user: null, sb };
  }
  const { data: { user } } = await sb.auth.getUser();
  return { user, sb };
});

export async function requireUser(): Promise<{ user: User; sb: SupabaseClient }> {
  const { user, sb } = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return { user, sb };
}

export interface Profile {
  id: string;
  city: string | null;
  is_pro: boolean;
  active_skin_id: string | null;
  username: string | null;
  sfx_enabled: boolean;
  created_at: string;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const { user, sb } = await getCurrentUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("id,city,is_pro,active_skin_id,username,sfx_enabled,created_at")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});
```

Design notes:

- `getCurrentUser` returns both `user` and `sb` so callers don't independently call `createServerClient()` — the returned client is the same instance the auth check ran against.
- The `hasSupabaseAuthCookie` short-circuit mirrors the existing pattern in `lib/skins/viewer.ts:71`. Signed-out requests do zero Supabase work.
- `requireUser` is type-narrowing: callers receive `User` (non-null). The redirect happens server-side via `next/navigation` and never returns.
- `getProfile` is lazy. No user → no query, no error. Same dedupe scope as `getCurrentUser`.
- The `Profile` interface enumerates every column consumed by existing call sites. Adding a column is a one-line change.

## Migration

The change is mechanical; one atomic PR.

### Pages that redirect on no-auth → `requireUser()`

Each currently has `const { user } = await ...; if (!user) redirect(...)`. Replace with `const { user, sb } = await requireUser();`.

- `app/achievements/page.tsx` (was `getSession`)
- `app/profile/page.tsx` (was `getSession`)
- `app/account/page.tsx` (was `getUser`) — also reads `sfx_enabled` from `profiles`
- `app/pro/page.tsx` (was `getUser`) — also reads `is_pro` from `profiles`

### Pages / components with optional auth → `getCurrentUser()`

Branch on `user` for signed-in features. No behavior change.

- `app/page.tsx` (signed-out renders `<Landing>`)
- `app/play/page.tsx`
- `app/leaderboard/page.tsx`
- `app/skins/page.tsx`
- `app/year/page.tsx` (renders signed-in / signed-out variants in-place; does not redirect)
- `components/auth/UserMenu.tsx`

### Actions / routes / lib helpers → `getCurrentUser()`

Use the cached helper but keep each site's existing null-check + error shape. Standardizing error envelopes is H8 (separate spec).

Actions (6):
- `app/actions/save-game.ts`
- `app/actions/save-city.ts`
- `app/actions/save-sfx-preference.ts`
- `app/actions/save-username.ts`
- `app/actions/skins.ts`
- `app/actions/sync-guest.ts`

Routes (6):
- `app/api/daily/submit/route.ts`
- `app/api/coach/route.ts`
- `app/api/seal/freeze/route.ts`
- `app/api/seal/year/route.ts`
- `app/api/share/seal/[date]/route.tsx`
- `app/api/stripe/checkout/route.ts`

**Exception — `app/api/stripe/checkout/skin/route.ts` is NOT migrated.** It explicitly distinguishes auth-system errors (network/AuthApiError) from "no user" by reading `userError` from `getUser()` and returning a 503 in the error case. Collapsing into `getCurrentUser` (which only returns `user | null`) would degrade a 503-temporarily-unavailable into a 302-login-redirect for genuine outages. This is a deliberate carve-out; if we later want to consolidate, the helper would need to expose the auth error.

Lib helpers (2):
- `lib/sfx/server.ts`
- `lib/skins/viewer.ts` — internally consumes `getCurrentUser()` + `getProfile()` instead of calling Supabase directly. The `unstable_cache`-wrapped skins fetch stays as-is; only the user-side of `getViewer()` changes. This keeps request-level dedupe coherent across layout + page + chips.

### Profile selects → `getProfile()`

10 in-scope reads of the current user's `profiles` row collapse to one cached call:

- `app/page.tsx:109` (city) → `(await getProfile())?.city ?? null`
- `app/pro/page.tsx:15` (is_pro) → `await getProfile()`
- `app/profile/page.tsx:29` → `await getProfile()`
- `app/leaderboard/LeaderboardPanel.tsx:40` (city) → `await getProfile()`
- `app/account/page.tsx:18` (sfx_enabled) → `await getProfile()`
- `app/api/coach/route.ts:43` (is_pro) → `await getProfile()`
- `app/api/daily/submit/route.ts:37` (username, city) → `await getProfile()`
- `app/api/seal/freeze/route.ts:34` (is_pro, created_at) → `await getProfile()`
- `lib/sfx/server.ts:12` (sfx_enabled) → `await getProfile()` (the whole function reduces to one line)
- `lib/skins/viewer.ts:93` (is_pro, active_skin_id) — consumed via the refactored viewer

**Explicitly out of scope** — the year-data trio (`app/_home-year-data.ts:53`, `app/year/_year-data.ts:50`, `app/api/seal/year/route.ts:51`) each does its own `profiles.select("created_at, …")` inside a larger `Promise.all`. Those three are part of the duplicated year-data fetch and will be consolidated by H6 (separate spec) rather than re-routed through `getProfile()` here.

Profile **writes** (`.update`/`.upsert` in `save-city`, `save-username`, `save-sfx-preference`, `skins.ts`, `seal/freeze`) are not touched — only the auth lookup that precedes the write moves to `getCurrentUser()`.

## Supabase client factories — JSDoc headers (M8)

Add a top-of-file docblock to each of the four factories. No behavior change, just clarity.

- `lib/supabase/server.ts` — cookie-aware server client. **Use in:** Server Components, server actions, API routes that touch user-scoped data. **Don't use for:** caller-less data fetches that should be deduped across requests — prefer the cached `lib/auth/identity.ts` helpers, which already hold a server client.
- `lib/supabase/client.ts` — browser client. **Use in:** client components that need realtime, client-side mutations, or auth-state subscriptions.
- `lib/supabase/public.ts` — cookieless anon client. **Use in:** cached read paths that don't need user identity (skins catalog, daily seal calendar). Compatible with `unstable_cache`.
- `lib/supabase/admin.ts` — service-role client. **Use in:** server code that must bypass RLS (webhooks, admin operations). **Never** pass user input through this client without explicit guards; RLS is bypassed.

## Performance expectations

`react.cache` dedupes per request. A page like `/profile` today issues four queries to satisfy a layout (`getViewer` → `getUser` + `profiles.select(is_pro, active_skin_id)`) plus a page (`getSession` + `profiles.select(created_at, …)`). After the change, the layout's `getCurrentUser` and `getProfile` calls are reused by the page; total drops to two queries.

Signed-out requests today still call `sb.auth.getUser()` in most paths. After the change, the cookie short-circuit returns null without a Supabase round-trip — meaningful for the marketing landing path (signed-out traffic is the bulk of cold home-page loads).

No performance regressions expected. `getUser()` is slightly slower than `getSession()` (a network call to validate the JWT vs. a cookie read), but each request now does **one** `getUser()` instead of 1–4 mixed `getUser` / `getSession` calls.

## Testing

- New: `tests/auth/identity.test.ts` covering
  - `getCurrentUser` returns `{ user: null, sb }` when no auth cookie is present (and does not call `getUser()`)
  - `getCurrentUser` returns `{ user, sb }` when the cookie is present and `getUser()` resolves
  - `getCurrentUser` returns null `user` when `getUser()` resolves with no user
  - `getProfile` returns `null` when there's no user (without querying)
  - `getProfile` returns the row when the user is present
  - `requireUser` redirects when no user; returns `{ user, sb }` when present
  - Dedupe behavior: two calls within the same `cache()` scope share one Supabase round-trip
- Existing tests for migrated sites continue to pass unmodified — call surfaces don't change observably, only the implementation underneath.
- Typecheck (`npm run typecheck`) and lint (`npm run lint`) clean.

## Risks

- **Wide blast radius.** Touching 24 sites means any subtle regression (e.g., a page that depended on `getSession()`'s cookie-only behavior over `getUser()`'s validation, or a client that silently relied on a different `sb` instance) shows up across the app. Mitigations: type-check, run the full Vitest suite, smoke-test signed-in and signed-out home pages plus each action's happy path before merge.
- **`getViewer` refactor is the only non-mechanical edit.** The viewer holds the `unstable_cache`-wrapped skins fetch, an in-flight skins list, a profile select, and an entitlements query. The refactor only swaps the user + profile reads; the skins-side caching stays as-is. Tests in `tests/skins/` cover the resolution path.
- **Cookie short-circuit semantics.** If `hasSupabaseAuthCookie` ever returns a false negative for a logged-in user (e.g., cookie name change in a Supabase major-version bump), the helper silently returns `null`. The same risk exists in `lib/skins/viewer.ts:71` today; the helper inherits it, doesn't amplify it.
- **`requireUser` redirect target hard-coded to `/auth/login`.** That's the only login route in the app today (`app/auth/login/` exists). If a future flow needs a different return path, we'd add a `redirectTo` parameter; not in scope here.

## Files added / modified

Added:
- `lib/auth/identity.ts`
- `tests/auth/identity.test.ts`

Modified (mechanical migration of auth + in-scope profile reads):
- Pages: `app/page.tsx`, `app/play/page.tsx`, `app/leaderboard/page.tsx`, `app/leaderboard/LeaderboardPanel.tsx`, `app/skins/page.tsx`, `app/profile/page.tsx`, `app/year/page.tsx`, `app/achievements/page.tsx`, `app/account/page.tsx`, `app/pro/page.tsx`
- Actions: `app/actions/save-game.ts`, `app/actions/save-city.ts`, `app/actions/save-sfx-preference.ts`, `app/actions/save-username.ts`, `app/actions/skins.ts`, `app/actions/sync-guest.ts`
- Routes: `app/api/daily/submit/route.ts`, `app/api/coach/route.ts`, `app/api/seal/freeze/route.ts`, `app/api/seal/year/route.ts`, `app/api/share/seal/[date]/route.tsx`, `app/api/stripe/checkout/route.ts` (skin checkout route deliberately excluded — see Migration § exception)
- Lib: `lib/sfx/server.ts`, `lib/skins/viewer.ts`
- Components: `components/auth/UserMenu.tsx`

Modified (JSDoc only):
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/public.ts`, `lib/supabase/admin.ts`
