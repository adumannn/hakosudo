# Auth identity helpers — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the most-repeated pattern in the codebase — open-coded auth identity checks (`sb.auth.getUser()` / `getSession()`) and per-page `profiles.select(...)` reads — by introducing three cached helpers and migrating 23 auth sites + 10 profile reads to them. (`app/api/stripe/checkout/skin/route.ts` is a deliberate carve-out — see "Out-of-scope reminders".)

**Architecture:** A new `lib/auth/identity.ts` exports `getCurrentUser` (cached, returns `{ user, sb }`), `requireUser` (cached + redirects on null), and `getProfile` (cached, lazy). All helpers use `react.cache` for request-level dedupe and short-circuit on missing auth cookie. The 4 Supabase client factories get JSDoc explaining which to use when.

**Tech Stack:** TypeScript, Next.js 14 (App Router), `@supabase/ssr`, `react.cache`, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-11-auth-identity-helpers-design.md](../specs/2026-05-11-auth-identity-helpers-design.md)

---

## File map

**Created**
- `lib/auth/identity.ts` — the three helpers + `Identity` and `Profile` types
- `tests/auth/identity.test.ts` — unit tests for all three helpers

**Modified (foundation)**
- `lib/skins/viewer.ts` — consume `getCurrentUser` + `getProfile` instead of calling Supabase directly

**Modified (page migrations — 11 files)**
- Bucket 1 (redirects on no-auth → `requireUser`): `app/achievements/page.tsx`, `app/profile/page.tsx`, `app/account/page.tsx`, `app/pro/page.tsx`
- Bucket 2 (optional auth → `getCurrentUser`): `app/page.tsx`, `app/play/page.tsx`, `app/leaderboard/page.tsx`, `app/leaderboard/LeaderboardPanel.tsx`, `app/skins/page.tsx`, `app/year/page.tsx`, `components/auth/UserMenu.tsx`

**Modified (actions — 6 files)**
- `app/actions/save-game.ts`, `app/actions/save-city.ts`, `app/actions/save-sfx-preference.ts`, `app/actions/save-username.ts`, `app/actions/skins.ts`, `app/actions/sync-guest.ts`

**Modified (routes — 6 files)**
- `app/api/daily/submit/route.ts`, `app/api/coach/route.ts`, `app/api/seal/freeze/route.ts`, `app/api/seal/year/route.ts`, `app/api/share/seal/[date]/route.tsx`, `app/api/stripe/checkout/route.ts`

(Skipped: `app/api/stripe/checkout/skin/route.ts` — see "Out-of-scope reminders".)

**Modified (lib)**
- `lib/sfx/server.ts` — reduces to a one-liner using `getProfile`

**Modified (M8 JSDoc only)**
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/public.ts`, `lib/supabase/admin.ts`

---

### Task 1: Create `lib/auth/identity.ts` with tests

**Files:**
- Create: `lib/auth/identity.ts`
- Test: `tests/auth/identity.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `tests/auth/identity.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const cookiesGetAll = vi.fn();
const hasAuthCookie = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));
const from = vi.fn(() => ({ select }));
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: cookiesGetAll }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/supabase/auth-cookie", () => ({
  hasSupabaseAuthCookie: (cookies: unknown) => hasAuthCookie(cookies),
}));

beforeEach(() => {
  vi.resetModules();
  cookiesGetAll.mockReset();
  hasAuthCookie.mockReset();
  getUser.mockReset();
  maybeSingle.mockReset();
  redirect.mockReset();
  // `from` and `select` carry their `vi.fn()` implementations across tests;
  // clear call history so `expect(from).not.toHaveBeenCalled()` is independent
  // of test order. Use mockClear (preserves impl), not mockReset (would erase it).
  from.mockClear();
  select.mockClear();
});

async function importFresh() {
  return await import("@/lib/auth/identity");
}

describe("getCurrentUser", () => {
  it("returns null user without calling getUser when no auth cookie", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toBeNull();
    expect(result.sb).toBeDefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns user and sb when auth cookie present and getUser resolves", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toEqual({ id: "u1", email: "a@b.co" });
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("returns null user when getUser returns null", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toBeNull();
  });

  it("logs auth.getUser error when present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "boom" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getCurrentUser } = await importFresh();
    await getCurrentUser();

    expect(errSpy).toHaveBeenCalledWith(
      "[auth/identity] auth.getUser:",
      expect.objectContaining({ message: "boom" }),
    );
    errSpy.mockRestore();
  });
});

describe("requireUser", () => {
  it("redirects to /auth/login when no user", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { requireUser } = await importFresh();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("returns user when authenticated", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });

    const { requireUser } = await importFresh();
    const result = await requireUser();

    expect(result.user).toEqual({ id: "u1", email: "a@b.co" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("getProfile", () => {
  it("returns null without querying when no user", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the row when user is present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: "u1",
        city: "tokyo",
        is_pro: false,
        active_skin_id: null,
        username: "alice",
        sfx_enabled: true,
        created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result?.city).toBe("tokyo");
    expect(from).toHaveBeenCalledWith("profiles");
  });

  it("returns null when row is missing", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result).toBeNull();
  });

  it("logs profiles.select error when present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getProfile } = await importFresh();
    await getProfile();

    expect(errSpy).toHaveBeenCalledWith(
      "[auth/identity] profiles.select:",
      expect.objectContaining({ message: "db down" }),
    );
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run tests/auth/identity.test.ts`

Expected: every test fails with `Failed to load url @/lib/auth/identity` or similar import error (module doesn't exist yet).

- [ ] **Step 3: Create the implementation**

Create `lib/auth/identity.ts`:

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

export interface Identity {
  user: User | null;
  sb: SupabaseClient;
}

export const getCurrentUser = cache(async (): Promise<Identity> => {
  const sb = createServerClient();
  if (!hasSupabaseAuthCookie(cookies().getAll())) {
    return { user: null, sb };
  }
  const { data: { user }, error } = await sb.auth.getUser();
  if (error) console.error("[auth/identity] auth.getUser:", error);
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
  const { data, error } = await sb
    .from("profiles")
    .select("id,city,is_pro,active_skin_id,username,sfx_enabled,created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("[auth/identity] profiles.select:", error);
  return (data as Profile | null) ?? null;
});
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `npx vitest run tests/auth/identity.test.ts`

Expected: all 10 tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/identity.ts tests/auth/identity.test.ts
git commit -m "feat(auth): add identity helpers (getCurrentUser, requireUser, getProfile)"
```

---

### Task 2: Refactor `lib/skins/viewer.ts` to consume identity helpers

The viewer is layout-critical (rendered on every page). Refactoring it second after the helpers ensures the dedupe works across layout + page.

**Files:**
- Modify: `lib/skins/viewer.ts`

- [ ] **Step 1: Apply the edit**

In `lib/skins/viewer.ts`, replace the imports + body of `getViewer` (lines 1–107).

Old imports (top of file):
```ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createServerClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { SkinRecord } from "./types";
```

Replace with:
```ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import type { SkinRecord } from "./types";
```

Old `getViewer` body (lines 65–107):
```ts
export const getViewer = cache(async (): Promise<Viewer> => {
  const logQueryError = (where: string, error: unknown) => {
    if (error) console.error(`[skins/viewer] ${where}:`, error);
  };

  const allSkinsPromise = fetchAllSkins();
  if (!hasSupabaseAuthCookie(cookies().getAll())) {
    return buildEmptyViewer(await allSkinsPromise);
  }

  const sb = createServerClient();

  const [allSkins, userResult] = await Promise.all([
    allSkinsPromise,
    sb.auth.getUser(),
  ]);
  const { data: { user }, error: userError } = userResult;
  logQueryError("auth.getUser", userError);

  if (!user) {
    return buildEmptyViewer(allSkins);
  }

  const [
    { data: profile, error: profileError },
    { data: ents, error: entsError },
  ] = await Promise.all([
    sb.from("profiles").select("active_skin_id,is_pro").eq("id", user.id).maybeSingle(),
    sb.from("user_skin_entitlements").select("skin_id").eq("user_id", user.id),
  ]);
  logQueryError("profiles.select", profileError);
  logQueryError("user_skin_entitlements.select", entsError);

  return {
    userId: user.id,
    email: user.email ?? null,
    isPro: profile?.is_pro ?? false,
    activeSkinId: profile?.active_skin_id ?? null,
    ownedSkinIds: new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id)),
    allSkins,
  };
});
```

Replace with:
```ts
export const getViewer = cache(async (): Promise<Viewer> => {
  const logQueryError = (where: string, error: unknown) => {
    if (error) console.error(`[skins/viewer] ${where}:`, error);
  };

  const [{ user, sb }, profile, allSkins] = await Promise.all([
    getCurrentUser(),
    getProfile(),
    fetchAllSkins(),
  ]);

  if (!user) {
    return buildEmptyViewer(allSkins);
  }

  const { data: ents, error: entsError } = await sb
    .from("user_skin_entitlements")
    .select("skin_id")
    .eq("user_id", user.id);
  logQueryError("user_skin_entitlements.select", entsError);

  return {
    userId: user.id,
    email: user.email ?? null,
    isPro: profile?.is_pro ?? false,
    activeSkinId: profile?.active_skin_id ?? null,
    ownedSkinIds: new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id)),
    allSkins,
  };
});
```

- [ ] **Step 2: Run viewer-related tests**

Run: `npx vitest run tests/skins`

Expected: existing skins tests still pass (the `access`, `catalog`, `registry`, `resolve`, `seed-prices` tests don't mock viewer; they shouldn't regress).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/skins/viewer.ts
git commit -m "refactor(skins): viewer consumes identity helpers"
```

---

### Task 3: Migrate bucket-1 pages (require auth, redirect on null)

4 pages. Each currently has `createServerClient` + `getUser`/`getSession` + null-check + `redirect`. Replace with `requireUser`. Two of them (`pro`, `account`) also read `profiles` — those go through `getProfile`.

**Files:**
- Modify: `app/achievements/page.tsx`
- Modify: `app/profile/page.tsx`
- Modify: `app/account/page.tsx`
- Modify: `app/pro/page.tsx`

- [ ] **Step 1: Edit `app/achievements/page.tsx`**

Replace the imports block at the top (lines 2 and 4):
```ts
import { redirect } from "next/navigation";
// ...
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { requireUser } from "@/lib/auth/identity";
```

Then replace the auth block inside `Achievements()` (lines 12–17):
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;
```

With:
```ts
  const { user } = await requireUser();
```

Note: `sb` is unused downstream in this file, so we destructure just `user`.

- [ ] **Step 2: Edit `app/profile/page.tsx`**

Replace the top of `Profile()` (lines 18–32). Old:
```ts
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
```

New:
```ts
  const { user } = await requireUser();
  const profile = await getProfile();
```

Update imports — remove `createServerClient` and `redirect`; add:
```ts
import { requireUser, getProfile } from "@/lib/auth/identity";
```

- [ ] **Step 3: Edit `app/account/page.tsx`**

Old (lines 8–21):
```ts
export default async function AccountPage() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/auth/login");

  const initial = user.email?.[0] ?? "·";
  const { data: profile } = await sb
    .from("profiles")
    .select("sfx_enabled")
    .eq("id", user.id)
    .maybeSingle();
```

New:
```ts
export default async function AccountPage() {
  const { user } = await requireUser();
  const profile = await getProfile();
  const initial = user.email?.[0] ?? "·";
```

Update imports — remove `redirect` and `createServerClient`; add `import { requireUser, getProfile } from "@/lib/auth/identity";`.

- [ ] **Step 4: Edit `app/pro/page.tsx`**

Old (lines 7–18):
```ts
export default async function Pro() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
```

New:
```ts
export default async function Pro() {
  await requireUser();
  const profile = await getProfile();
```

Update imports — remove `redirect` and `createServerClient`; add `import { requireUser, getProfile } from "@/lib/auth/identity";`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/achievements/page.tsx app/profile/page.tsx app/account/page.tsx app/pro/page.tsx
git commit -m "refactor(pages): bucket-1 pages use requireUser + getProfile"
```

---

### Task 4: Migrate bucket-2 pages and components (optional auth)

7 sites. Replace direct `createServerClient` + `getUser`/`getSession` with `getCurrentUser`. Two also read `profiles` — those go through `getProfile`. `app/year/page.tsx` is here (not bucket 1) because it renders a signed-out variant inline rather than redirecting.

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/play/page.tsx`
- Modify: `app/leaderboard/page.tsx`
- Modify: `app/leaderboard/LeaderboardPanel.tsx`
- Modify: `app/skins/page.tsx`
- Modify: `app/year/page.tsx`
- Modify: `components/auth/UserMenu.tsx`

- [ ] **Step 1: Edit `app/page.tsx`**

The current file does multiple things; locate two changes.

First, the city fetch (lines 105–115):
```ts
  const sb = createServerClient();
  const [skin, profileForCity] = await Promise.all([
    resolveActiveSkinServer({ surface: "home", viewer }),
    sb
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const profileCity: string | null = profileForCity?.city ?? null;
```

Replace with:
```ts
  const [skin, profile] = await Promise.all([
    resolveActiveSkinServer({ surface: "home", viewer }),
    getProfile(),
  ]);
  const profileCity: string | null = profile?.city ?? null;
```

Remove the now-unused `createServerClient` import; add:
```ts
import { getProfile } from "@/lib/auth/identity";
```

Note: `app/page.tsx` derives `user` from `viewer.userId`, which already uses the new helpers via the refactored viewer (Task 2). No need to change that branch.

- [ ] **Step 2: Edit `app/play/page.tsx`**

Replace:
```ts
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
```

With:
```ts
  const { user } = await getCurrentUser();
```

Update imports — remove `createServerClient`; add `import { getCurrentUser } from "@/lib/auth/identity";`.

- [ ] **Step 3: Edit `app/leaderboard/page.tsx`**

Replace:
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
```

With:
```ts
  const { user } = await getCurrentUser();
```

Update imports.

- [ ] **Step 4: Edit `app/leaderboard/LeaderboardPanel.tsx`**

Replace the imports block (lines 2–5):
```ts
import { createServerClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { computeCityCounts, computeUserStanding } from "@/lib/stats/leaderboard";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
import { getProfile } from "@/lib/auth/identity";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { computeCityCounts, computeUserStanding } from "@/lib/stats/leaderboard";
```

Then replace the supabase client setup + the conditional profile fetch (lines 35–50):
```ts
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
```

With:
```ts
  const { sb } = await getCurrentUser();

  // Fan out the queries the panel needs.
  const [profile, dailyMetaRes, allTodayRes] = await Promise.all([
    getProfile(),
    sb.from("daily_puzzles").select("seq,difficulty").eq("date", date).maybeSingle(),
    sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,city,created_at,hints_used,profiles(username)")
      .eq("date", date)
      .order("elapsed_seconds", { ascending: true }),
  ]);

  const userProfileCity = profile?.city ?? null;
```

- [ ] **Step 5: Edit `app/skins/page.tsx`**

Replace:
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
```

With:
```ts
  const { user } = await getCurrentUser();
```

Update imports.

- [ ] **Step 6: Edit `app/year/page.tsx`**

Replace the imports block (line 5):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 18–22):
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
```

With:
```ts
  const { user } = await getCurrentUser();
```

(The rest of the file already uses `user?.…` and conditionally renders signed-in vs. signed-out variants — no other changes needed.)

- [ ] **Step 7: Edit `components/auth/UserMenu.tsx`**

Replace:
```ts
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
```

With:
```ts
  const { user } = await getCurrentUser();
```

Update imports — remove `createServerClient`; add `import { getCurrentUser } from "@/lib/auth/identity";`.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 9: Run full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx app/play/page.tsx app/leaderboard/page.tsx app/leaderboard/LeaderboardPanel.tsx app/skins/page.tsx app/year/page.tsx components/auth/UserMenu.tsx
git commit -m "refactor(pages): bucket-2 sites use getCurrentUser + getProfile"
```

---

### Task 5: Migrate server actions

6 actions. Each preserves its existing error envelope (e.g. `{ ok: false, error: "auth" }`) — only the auth lookup changes.

**Files:**
- Modify: `app/actions/save-game.ts`
- Modify: `app/actions/save-city.ts`
- Modify: `app/actions/save-sfx-preference.ts`
- Modify: `app/actions/save-username.ts`
- Modify: `app/actions/skins.ts`
- Modify: `app/actions/sync-guest.ts`

- [ ] **Step 1: Edit `app/actions/save-city.ts`**

Old (lines 5–10):
```ts
export async function saveCity(input: { city: string }) {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "auth" as const };
```

New:
```ts
export async function saveCity(input: { city: string }) {
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" as const };
```

Update imports — remove `createServerClient`; add `import { getCurrentUser } from "@/lib/auth/identity";`.

- [ ] **Step 2: Edit `app/actions/save-game.ts`**

Replace the import (line 2):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 16–18):
```ts
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, reason: "anon" as const };
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const, reason: "anon" as const };
```

The error envelope (`{ ok: false as const, reason: "anon" as const }`) is preserved exactly — H8 will standardize it later.

- [ ] **Step 3: Edit `app/actions/save-sfx-preference.ts`**

Replace the import (line 4):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 7–12):
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) return { ok: false as const, error: "auth" as const };
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };
```

- [ ] **Step 4: Edit `app/actions/save-username.ts`**

Replace the import (line 2):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 8–12):
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };
```

- [ ] **Step 5: Edit `app/actions/skins.ts`**

Replace the import (line 4):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 13–17):
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
```

- [ ] **Step 6: Edit `app/actions/sync-guest.ts`**

Replace the import:
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 15–18 — the file's existing shape; verify with a quick `cat app/actions/sync-guest.ts` if you need to confirm exact line numbers):
```ts
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const };
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const };
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 8: Run full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/actions/save-game.ts app/actions/save-city.ts app/actions/save-sfx-preference.ts app/actions/save-username.ts app/actions/skins.ts app/actions/sync-guest.ts
git commit -m "refactor(actions): actions use getCurrentUser"
```

---

### Task 6: Migrate API routes

6 routes. Three of them also do a `profiles.select` — those go through `getProfile`. Each preserves its existing 401/error response.

**Files:**
- Modify: `app/api/daily/submit/route.ts`
- Modify: `app/api/coach/route.ts`
- Modify: `app/api/seal/freeze/route.ts`
- Modify: `app/api/seal/year/route.ts`
- Modify: `app/api/share/seal/[date]/route.tsx`
- Modify: `app/api/stripe/checkout/route.ts`

**Skipped intentionally:** `app/api/stripe/checkout/skin/route.ts` distinguishes auth-system errors from "no user" via `userError` and returns 503 in the error case. `getCurrentUser` doesn't expose that error, so collapsing would degrade a 503 outage into a 302 login redirect. Leave the file as-is.

- [ ] **Step 1: Edit `app/api/coach/route.ts`**

Replace (lines 24–47, in order):
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return new Response("Sign in to use the coach", { status: 401 });

  // ... body parsing ...

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = !!profile?.is_pro;
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) return new Response("Sign in to use the coach", { status: 401 });

  // ... body parsing (unchanged) ...

  const profile = await getProfile();
  const isPro = !!profile?.is_pro;
```

Update imports — remove `createServerClient`; add `import { getCurrentUser, getProfile } from "@/lib/auth/identity";`.

- [ ] **Step 2: Edit `app/api/daily/submit/route.ts`**

Find the auth block:
```ts
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();
```

Replace with:
```ts
  const { user, sb } = await getCurrentUser();
```

Find the profile read (~line 37):
```ts
  const { data: profile } = await sb
    .from("profiles")
    .select("username,city")
    .eq("id", user.id)
    .maybeSingle();
```

Replace with:
```ts
  const profile = await getProfile();
```

Update imports.

- [ ] **Step 3: Edit `app/api/seal/freeze/route.ts`**

Replace (lines 9–37):
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = session.user.id;

  // ... body parsing + window check (unchanged) ...

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro,created_at")
    .eq("id", userId)
    .maybeSingle();
```

With:
```ts
  const { user, sb } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  // ... body parsing + window check (unchanged) ...

  const profile = await getProfile();
```

Update imports.

- [ ] **Step 4: Edit `app/api/seal/year/route.ts`**

Replace:
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
```

With:
```ts
  const { user, sb } = await getCurrentUser();
```

Replace any `session?.user`-style references downstream with `user`. **Do not** change the `from("profiles").select("created_at")` query — that's part of the year-data fetch and is out of scope (H6 handles it).

Update imports.

- [ ] **Step 5: Edit `app/api/share/seal/[date]/route.tsx`**

Replace:
```ts
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
```

With:
```ts
  const { user, sb } = await getCurrentUser();
```

Replace downstream `session?.user` / `session.user` references with `user`. Update imports.

- [ ] **Step 6: Edit `app/api/stripe/checkout/route.ts`**

Replace the import (line 3):
```ts
import { createServerClient } from "@/lib/supabase/server";
```

With:
```ts
import { getCurrentUser } from "@/lib/auth/identity";
```

Then replace the auth block (lines 6–11):
```ts
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));
```

With:
```ts
  const { user } = await getCurrentUser();
  if (!user)
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));
```

(`sb` is not used downstream — only `user.email` and `user.id` — so we destructure just `user`.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 8: Run full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/api/coach/route.ts app/api/daily/submit/route.ts app/api/seal/freeze/route.ts app/api/seal/year/route.ts "app/api/share/seal/[date]/route.tsx" app/api/stripe/checkout/route.ts
git commit -m "refactor(routes): API routes use getCurrentUser + getProfile"
```

---

### Task 7: Simplify `lib/sfx/server.ts`

**Files:**
- Modify: `lib/sfx/server.ts`

- [ ] **Step 1: Apply edit**

Replace entire file contents:

```ts
import { getProfile } from "@/lib/auth/identity";

export async function getSfxEnabledServer(): Promise<boolean> {
  const profile = await getProfile();
  return Boolean(profile?.sfx_enabled);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`

Expected: all tests pass. (No tests touch `lib/sfx/server.ts` directly; coverage is via consumer code.)

- [ ] **Step 4: Commit**

```bash
git add lib/sfx/server.ts
git commit -m "refactor(sfx): simplify getSfxEnabledServer via getProfile"
```

---

### Task 8: Add JSDoc headers to Supabase client factories (M8)

**Files:**
- Modify: `lib/supabase/server.ts`
- Modify: `lib/supabase/client.ts`
- Modify: `lib/supabase/public.ts`
- Modify: `lib/supabase/admin.ts`

- [ ] **Step 1: Edit `lib/supabase/server.ts`**

The file already has a comment on `createServerClient`; replace lines 5–10 (the existing JSDoc) with an expanded version:

```ts
/**
 * Cookie-aware server-side Supabase client.
 *
 * **Use in:** Server Components, server actions, and API routes that touch
 * user-scoped data (anything backed by Row-Level Security).
 *
 * **Don't use for:** caller-less reads that should be deduped across a
 * request — prefer the helpers in `lib/auth/identity.ts`, which already
 * hold a request-cached server client.
 *
 * Falls back to a `null`-shaped no-op client when env vars are absent so
 * server components don't crash during a misconfigured deploy. Callers
 * already use safe-access patterns (`?.`, try/catch around queries) so
 * this degrades gracefully.
 */
export const createServerClient = () => {
```

- [ ] **Step 2: Edit `lib/supabase/client.ts`**

Add a JSDoc block above the exported factory:

```ts
/**
 * Browser-side Supabase client.
 *
 * **Use in:** client components that need realtime subscriptions,
 * client-side mutations, or auth-state subscriptions (`onAuthStateChange`).
 *
 * **Don't use in:** server components, actions, or API routes — use
 * `createServerClient` (or the cached helpers in `lib/auth/identity.ts`)
 * instead.
 */
```

- [ ] **Step 3: Edit `lib/supabase/public.ts`**

Add a JSDoc block above the exported factory:

```ts
/**
 * Cookieless anonymous Supabase client.
 *
 * **Use in:** cached read paths that don't depend on user identity, such
 * as the skins catalog or the daily seal calendar. Compatible with
 * `next/cache`'s `unstable_cache` (no `cookies()` reads inside).
 *
 * **Don't use in:** user-scoped reads — use `createServerClient` (or the
 * helpers in `lib/auth/identity.ts`) so RLS sees the authenticated user.
 */
```

- [ ] **Step 4: Edit `lib/supabase/admin.ts`**

Add a JSDoc block above the exported factory:

```ts
/**
 * Service-role Supabase client.
 *
 * **Use in:** server code that must bypass Row-Level Security — webhooks,
 * admin operations, batch jobs.
 *
 * **DANGER:** RLS is bypassed. Never pass user input through this client
 * without explicit authorization checks first. Prefer `createServerClient`
 * for anything that should respect user permissions.
 */
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: no errors (these are comment-only changes).

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/client.ts lib/supabase/public.ts lib/supabase/admin.ts
git commit -m "docs(supabase): document when to use each client factory"
```

---

### Task 9: Final verification

**Files:** none modified.

- [ ] **Step 1: Search for any residual direct auth calls**

Run: `grep -rn "sb.auth.getUser\|sb.auth.getSession\|supabase.auth.getUser\|supabase.auth.getSession" app/ lib/ components/`

Expected: exactly two matches — the call inside `lib/auth/identity.ts` itself, and the deliberately-skipped `app/api/stripe/checkout/skin/route.ts` (which keeps direct `sb.auth.getUser()` to preserve its 503-vs-302 distinction). Any other match is a missed migration; go fix it before continuing.

- [ ] **Step 2: Search for residual `profiles.select` reads of the current user**

Run: `grep -rn 'from("profiles").select' app/ lib/`

Expected: matches only in the three out-of-scope year-data files (`app/_home-year-data.ts`, `app/year/_year-data.ts`, `app/api/seal/year/route.ts`). Any other match is either a missed migration (fix it) or a profile **write** with a `.select(...)` chain (legitimate, leave alone — they look like `from("profiles").update(...)`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`

Expected: no errors. (Watch for unused-import warnings on `createServerClient` / `redirect` from removed imports.)

- [ ] **Step 5: Full test suite**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 6: Manual smoke check via preview**

Start the dev server: `npm run dev`

Verify in a browser:
- Signed-out home (`/`) renders the `<Landing>` component and the network panel shows no `auth.getUser` call from the marketing path.
- Sign in, then load `/profile` — the page renders with profile data; the network tab shows a single profile select for the request (vs. the previous two).
- `/account` shows the SFX toggle in the correct state.
- `/pro` redirects you to the "You're Pro" view if your test account is pro, or shows the upgrade view otherwise.
- Play a daily puzzle to completion and confirm `WinModal` submission still works (`/api/daily/submit` succeeds).

If anything looks broken, identify the call site, compare against this plan's migration code, and fix.

- [ ] **Step 7: No commit needed (verification only)**

The previous tasks should have left a clean working tree. Confirm with `git status`.

---

## Out-of-scope reminders

Do **not** change these in this plan — they belong to other audit findings:

- Don't standardize action/route error envelope shapes (H8).
- Don't touch `app/_home-year-data.ts`, `app/year/_year-data.ts`, or `app/api/seal/year/route.ts` beyond the auth call at the top of the last one (H6).
- Don't merge `save-game` and `sync-guest` actions (H3).
- Don't split `GameShell.tsx` or the game store (H1, H2, H7).
- Don't touch the trivial-helper duplications (`cellName`, `formatTime`, `todayUTC`).
- **Don't migrate `app/api/stripe/checkout/skin/route.ts`.** It explicitly distinguishes auth-system errors (network/AuthApiError) from "no user" via the `userError` field and returns a 503 in the error case. `getCurrentUser` doesn't expose that error, so collapsing the call would degrade a 503-temporarily-unavailable into a 302-login-redirect for genuine outages. If we ever standardize, the helper would need an error-returning variant.
