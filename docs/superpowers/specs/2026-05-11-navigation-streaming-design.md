# Navigation streaming — `loading.tsx` + Suspense splits

**Date:** 2026-05-11
**Status:** spec — approved sections 1–3, awaiting user review of full doc
**Owner:** Duman

## Problem

Navigations between pages feel sluggish on both desktop and mobile. Symptom (confirmed by user): clicking a nav link produces a long blank pause (~500–1500 ms), then the new page paints all at once. No spinner, no skeleton, no visual feedback during the wait.

## Root cause

Two compounding factors in the Next 14 App Router:

1. **Every `page.tsx` exports `force-dynamic`.** Confirmed across `/`, `/play`, `/year`, `/leaderboard`, `/profile`, `/account`, `/skins`, `/pro`, `/achievements`, `/auth/login`, `/auth/signup`. With `force-dynamic`, `<Link>` prefetch only fetches the route's `loading.tsx` boundary.
2. **No `loading.tsx` exists anywhere in the app.** With nothing to prefetch, prefetch is effectively a no-op. Each click waits for a full server roundtrip — auth refresh in middleware, layout's `getViewer` + `resolveActiveSkinServer`, the page's data fetches — before the browser sees a single new pixel.

The result is identical to the user's reported symptom: click → blank → all-at-once.

## Goal

Eliminate the blank pause. After this change, every navigation paints a route-shaped skeleton in well under 100 ms, and slow per-page data streams in afterward without layout shift. The total server work is unchanged; what changes is the *ordering* of paint.

## Non-goals

This spec is deliberately narrow. The following are explicitly out of scope and tracked as follow-up specs:

- Reducing server work (replacing `force-dynamic` with `revalidate`, caching per-user data, splitting query bundles into smaller fetch groups).
- Refactoring the root layout's `getViewer()` / `resolveActiveSkinServer()` calls. The cookie short-circuit + React `cache()` + `unstable_cache` already make these cheap, and `data-skin` on `<body>` must be set before body paint to avoid a flash.
- Moving auth gates into `middleware.ts` (relevant for the regression noted below).
- Adding an e2e harness, Lighthouse CI, or performance budgets.
- Bundle-size, font-loading, or image-optimization work.

## Design

### Section 1 — Page inventory and skeleton conventions

Add a `loading.tsx` for every routable page. Each renders the same chrome the real page renders (so the layout doesn't shift) plus a body skeleton shaped like the real content.

**Pages and loading-state shape:**

| Page | Chrome | Body skeleton |
|---|---|---|
| `/` | `<MastheadSkeleton>` | Eyebrow + Hero band (TodayCard + YouTodayPanel placeholders) + casual 4-tier strip rendered real (it's static) + year-scroll placeholder + bottom-strip placeholders. *Note:* `/` serves both signed-out (`<Landing>` marketing page, no Masthead) and signed-in (Masthead + bands) views. The skeleton matches the signed-in shape because that's the navigating-between-pages user; a signed-out user landing on `/` will see this skeleton briefly before the Landing marketing page replaces it. Acceptable trade-off; deferring per-auth-state skeletons to a follow-up. |
| `/play` | `<MastheadSkeleton>` | Render real (page is essentially static; `loading.tsx` exists only so prefetch yields *something*) |
| `/play/[difficulty]` | none (game variant chrome) | Game-shaped placeholder: thin in-game header skeleton + 9×9 board grid skeleton + number-pad row |
| `/play/daily` | none (game variant chrome) | Same as `/play/[difficulty]` |
| `/year` | `<MastheadSkeleton>` | Header strip + stats triplet placeholders + 365-cell year-grid placeholder (cells pre-sized) |
| `/leaderboard` | `<MastheadSkeleton>` | Two-col: city-rail skeleton + ledger-table skeleton (20 placeholder rows) |
| `/profile` | `<MastheadSkeleton>` | Two-col: left-rail skeleton (avatar + streak number block) + right column (heatmap rect + 4 best-time tiles + 12 mark squares) |
| `/account` | `<MastheadSkeleton>` | Heading + a single toggle row placeholder |
| `/skins` | `<MastheadSkeleton>` | Header + 3 grid sections of card skeletons |
| `/pro` | minimal top-bar | Centered column with title + 3 benefit-row skeletons + price + button |
| `/achievements` | `<MastheadSkeleton>` | Header + 12-mark grid skeleton |
| `/auth/login`, `/auth/signup` | none | Skip — no DB reads, render-fast already |

**Conventions used by every skeleton:**

1. **Same outer DOM shape as the real page** (same wrappers, paddings, max-widths). Prevents layout shift on swap.
2. **Pre-sized blocks** — every placeholder has explicit width × height.
3. **Static, no animation** — matches the paper-and-ink aesthetic and avoids shimmer noise. Muted fills (`bg-sumi/[0.04]`, `border-sumi/15`) at the size of the real content.
4. **`<MastheadSkeleton>`** — one shared component at `components/skeletons/MastheadSkeleton.tsx`. Renders the same `<header className="masthead">…</header>` outer shell with empty placeholders for nav links and avatar. No client JS.
5. **`<SkeletonBox>`** — one tiny utility at `components/skeletons/SkeletonBox.tsx`: a `<div>` with `bg-sumi/[0.04] border border-sumi/10`. Composing these keeps each `loading.tsx` small.

**File layout:**

- `app/<segment>/loading.tsx` — mirroring the route tree.
- `components/skeletons/MastheadSkeleton.tsx` — shared chrome skeleton.
- `components/skeletons/SkeletonBox.tsx` — primitive.
- `components/skeletons/<Domain>Skeleton.tsx` — per-page or per-section composites only when reused (e.g. `YearScrollSkeleton`, `LedgerSkeleton`, `HeatmapSkeleton`).

### Section 2 — Per-page Suspense splits inside page bodies

Once `loading.tsx` flips to the skeleton, the page's server-render begins. Without further changes, nothing repaints until *all* server data fetches resolve. Suspense around the slow data lets fast parts paint immediately and the slow tail stream in.

**Pattern:** for each affected page, factor the slow data-dependent JSX into an `async` server component, then wrap in `<Suspense fallback={…matching skeleton…}>`. The fallback is the same shape used in `loading.tsx`, so transitions skeleton → partial → full produce no layout shift.

**Splits (one Suspense boundary per page unless noted):**

| Page | Renders synchronously (above fold) | Behind Suspense | Why |
|---|---|---|---|
| `/` (signed-in) | Masthead, eyebrow/vol line, CityPicker (if shown), casual 4-tier band, bottom-strip "global pace" + leaderboard preview (use already-cached `getTodaySealBundle` + `getPublicDailySnapshot`) | **Two Suspense boundaries**, both reading from a shared `fetchHomeYearData(userId, today, year)` deduped via React `cache()`: (a) hero band (TodayCard + YouTodayPanel — both depend on `completedElapsed` / `freezePrompt` / `streak` / `yearFilled` from the year queries); (b) year section (YearScroll). | Year queries are the only uncached, per-user, range-scanning fetches on this page. The hero and year section both depend on them; splitting them across two Suspense boundaries keeps the casual band and bottom strip rendering immediately between them, while a single deduped fetch avoids extra DB work. |
| `/year` (signed-in) | "← back to today", title, intro paragraph, year-kanji column | Stats triplet (stamped / streak / filled) and YearScroll body | Whole right side depends on the 5 per-user year-range queries. Header has zero dependencies. |
| `/leaderboard` | Masthead, page heading + range pills, table column headers | Sidebar (city rail) + ledger rows + sticky "you" row | All three depend on the same `daily_results` fetch — single Suspense boundary covers the whole panel. |
| `/profile` | Masthead, left-rail header (avatar, `@username`, days-on-Hako, "Continue today's box" CTA) | Streak block, heatmap, personal-best grid, marks grid | All 6 parallel queries are bundled — one Suspense around the entire data-dependent area. Splitting further requires splitting the fetch groups (out of scope). |
| `/achievements` | Masthead, "← back to profile", header + earned-count placeholder | Earned-count number + the AchievementsLedger | 2 queries; one boundary suffices. |
| `/play`, `/skins`, `/pro`, `/account`, `/play/[difficulty]`, `/play/daily`, `/auth/*` | n/a | n/a | Either no slow fetch or no useful split — `loading.tsx` from Section 1 is sufficient. |

**Structural changes:**

- Add async server components (one per affected page) under the page's directory. Examples:
  - `app/HomeYearSection.tsx` (colocated with `app/page.tsx`; Next.js only routes the reserved filenames — `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`, etc. — so any other filename in `app/` is just a regular module).
  - `app/year/YearStatsAndScroll.tsx`
  - `app/leaderboard/LeaderboardPanel.tsx`
  - `app/profile/ProfileBody.tsx`
  - `app/achievements/AchievementsBody.tsx`
- Each `page.tsx` shrinks to: chrome + sync content + `<Suspense fallback={…}><SlowSection {...inputs} /></Suspense>`.
- The slow component receives only the inputs it needs (e.g. `userId`, `today`, `year`) and does its own `Promise.all` of user-specific queries inside.

**No behavior change** — same data, same end-state DOM. Only paint ordering changes.

### Section 3 — Testing & verification

No behavior change is expected. Every page must reach the same final DOM. The verification surface is: build/types/tests still pass, skeletons match shape, and navigation now shows a skeleton in <100 ms.

**Automated checks (gate the change set, not after every file):**

| Check | Command | Pass criterion |
|---|---|---|
| Type-check | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors / no new warnings |
| Vitest | `npm run test` | All existing tests pass — no new tests added (skeletons are presentational) |
| Production build | `npm run build` | Succeeds; no Next warnings about Suspense boundaries, missing `loading.tsx`, or fetch caching |

**Manual smoke (per page, in `next dev` and a `next start` build):**

For each page that got `loading.tsx` and/or Suspense:

1. **Click → skeleton paints fast.** From any other route, click the nav link. Skeleton appears in well under 100 ms on a normal connection.
2. **No layout shift.** While transitioning skeleton → real content, the page's chrome, headings, and section heights stay put. Use Chrome DevTools "Performance" → CLS, or scroll-position visual check (scroll halfway, click a link, the new page's skeleton should land at the same vertical position the real content does).
3. **Final state matches `main`.** After all data resolves, the rendered page is identical to the current `main` branch's render of the same page.
4. **Suspense streaming actually streams.** For pages with a Suspense split, synchronous chrome appears first; the async section briefly shows its fallback before swapping in. Throttle network to "Slow 4G" in DevTools to make this visible.

**Routes to manually walk:**

- Signed-out: `/` → `/play` → `/play/easy` → back to `/` → `/auth/login`.
- Signed-in: `/` → `/play` → `/year` → `/leaderboard` → `/profile` → `/achievements` → `/skins` → `/account` → `/pro` → back to `/`.

**Quantitative spot-check (one measurement, optional but recommended):**

Run a Chrome DevTools "Performance" trace for a `/` → `/leaderboard` navigation on Slow 4G throttling, before and after the change. Record (a) time from click to first non-blank frame, (b) time to fully-interactive. Ship if (a) drops by ≥300 ms; (b) is allowed to be ~unchanged (this spec doesn't reduce server work).

**Known minor regression (flagged, not fixed here):**

Pages that `redirect("/auth/login")` for signed-out users (`/profile`, `/account`, `/skins`, `/pro`, `/achievements`) will briefly flash a skeleton before the redirect resolves. Today they show nothing during the wait. The fix is to move the auth gate into `middleware.ts` — tracked as a follow-up.

## Acceptance criteria

- [ ] `loading.tsx` exists for every page in the table in Section 1, with the documented shape.
- [ ] `<MastheadSkeleton>` and `<SkeletonBox>` exist under `components/skeletons/` and are reused across `loading.tsx` files.
- [ ] Every Suspense boundary listed in Section 2 is in place, using a fallback that visually matches the same area's `loading.tsx`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` all pass.
- [ ] Manual click-walk of the routes in Section 3 shows skeleton paint <100 ms on each navigation, with no layout shift on swap.
- [ ] No change to final rendered DOM compared to the current `main` branch (spot-checked on signed-in `/`, `/leaderboard`, `/profile`).
