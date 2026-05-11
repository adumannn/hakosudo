# Architecture audit — findings

Date: 2026-05-11
Scope: maintainability audit of the Hako sudoku codebase (~11.5k LOC across `lib/`, `components/`, `app/`).
Method: parallel scans for duplication, state/data-flow tangles, dead code, and module-boundary violations, plus direct reads of the largest files and seams.

This is a **findings doc**, not a design doc. No code changes recommended yet — the goal is to surface the real maintainability issues so we can pick what to fix.

---

## Top-level read

The codebase is **fundamentally healthy** for its size: per-domain folders under `lib/` (`sudoku`, `seal`, `skins`, `coach`, `sfx`, `vfx`, `stats`), tests exist, conventions are consistent. The problems are not architecture rot — they are *the kind of friction you get when a codebase grows quickly through several feature waves and nobody pulls the duplication out afterwards.*

Three themes recur:

1. **The Zustand store is doing too many jobs.** It is state + persistence + (indirectly) the source of truth for the save-game action's input shape. Every mutator persists to localStorage, and the storage key/shape leaks into `AuthForm` and `GameShell`.
2. **No shared "auth identity" or "profile" helper.** `sb.auth.getUser()` and `from("profiles").select(...)` are open-coded 15–20 times across pages, actions, routes, and lib. Same row, slightly different columns, no caching.
3. **Small but pervasive duplication of trivial helpers.** `cellName`, `formatTime`, `todayUTC` (open-coded as `new Date().toISOString().slice(0,10)`), the difficulty-tier array, ISO date arithmetic — each appears 3–10 times.

Fixing any one of these in isolation is small. Fixing them as a coordinated pass would meaningfully change how the codebase feels to work in.

---

## Findings by severity

### HIGH — worth fixing soon

#### H1. Zustand store entangles state with persistence and timer side effects
- `lib/store/game-store.ts:88,118,131,140,149,159,179,182` — every mutator (`load`, `setCell`, `toggleNote`, `undo`, `redo`, `tick`, `hint`, `reset`) ends with `safeLocal.set(KEY, get())`.
- `tick` runs every second and writes the full 81-cell board to localStorage on each call.
- The store conflates "what's the game state" with "how do we persist it."
- **Fix idea:** move persistence into a single `useGame.subscribe(...)` middleware (or zustand's `persist` middleware with `partialize` + throttle); keep mutators pure.

#### H2. Storage key + snapshot shape leak across three layers
- Storage key `"sudoku/game-v1"` hardcoded in `lib/store/game-store.ts:6`.
- `components/auth/AuthForm.tsx:36-60` re-reads the same key and re-translates field names (store's `errorsMade`/`hintsUsed`/`isComplete`/`puzzleId` vs the save-game action's `errors`/`hints`/`complete`/`puzzleId`).
- The mapping table is maintained by hand in two places.
- **Fix idea:** expose `snapshotForServer()` on the store and a single `STORAGE_KEYS.GAME_V1` constant.

#### H3. `saveGame` and `syncGuestGame` actions are near-duplicates
- `app/actions/save-game.ts:20-37` and `app/actions/sync-guest.ts:20-37` write the same `games` row with identical upsert + onConflict logic. The only delta is the anonymous-user early return.
- Schema changes have to touch both.
- **Fix idea:** collapse into one `upsertGameSnapshot(input)`; let callers decide whether anonymous returns `{ok:false}` or no-ops.

#### H4. Auth identity is open-coded ~17 times, split between `getUser()` and `getSession()`
- Pages, actions, API routes, and lib helpers each call `sb.auth.getUser()` or `sb.auth.getSession()` independently.
- Mixed usage even within the same surface (`app/api/seal/year/route.ts:15` uses `getSession`; `app/api/daily/submit/route.ts:10` uses `getUser`).
- **Fix idea:** `lib/auth/identity.ts` exporting `requireUser()` / `getCurrentUser()` returning `{ user, sb }`; standardize on one auth read.

#### H5. `profiles` table is fetched in 5 places, none deduped
- `app/page.tsx:108-114`, `app/profile/page.tsx:28-32`, `app/leaderboard/LeaderboardPanel.tsx:39-41`, `app/api/daily/submit/route.ts:36-40`, `lib/skins/viewer.ts:93` — each issues its own `from("profiles").select(...)`.
- Only `getViewer()` is `react.cache`-deduped — the others bypass it.
- **Fix idea:** a `react.cache`-wrapped `getProfile()` returning the full row; have `getViewer` consume it; replace per-page selects.

#### H6. Year-series fetch + assembly duplicated 3× (~30 lines each)
- `app/_home-year-data.ts:35-79`, `app/year/_year-data.ts:32-78`, `app/api/seal/year/route.ts:26-82` — identical Promise.all of 5 Supabase queries, identical `DailyMetaRow` typing, identical `sealKanjiByDate` map, identical `assembleYearSeries` call.
- **Fix idea:** extract `fetchYearSeriesForUser(userId, today, year)` into `lib/seal/year-fetch.ts`; call from all three.

#### H7. `GameShell.tsx` is the de-facto orchestrator
- `components/game/GameShell.tsx` has 375 lines mixing: load puzzle into store, SFX toggle, debounced `saveGame`, keyboard handling (60 lines), pause-on-blur, mobile/desktop layouts, sensei drawer.
- 24 `useGame` selectors and 5 `useEffect`s. A reader chasing "what happens when I press `5`" must visit `NumberPad.tsx:37`, `GameShell.tsx:109`, `game-store.ts:98`, `game-store.ts:118`, and the debounced save effect.
- **Fix idea:** extract `useGamePersistence()`, `useGameKeyboard()`, `useGameAutosave()` hooks; let `GameShell` compose them.

#### H8. Inconsistent error contracts across actions and routes
- Server actions return mixed shapes: `{ok:false, reason:"anon"}`, `{ok:false, error:"auth"}`, `{ok:false, error:"unauthenticated"}`, `{ok:false as const}`.
- API routes use mixed shapes: JSON `{error}` (most), plain text (`coach/route.ts:29`).
- `GameShell.tsx:103` silently swallows `saveGame` failures with `.catch(()=>{})`.
- **Fix idea:** standardize on `Result<T, ErrorCode>` for actions and `{error: code, message?}` JSON envelope for routes.

#### H9. `cellName` and `formatTime` duplicated across packages
- `cellName(i)` defined identically in `lib/sudoku/techniques.ts:147` and `lib/coach/prompt.ts:20`.
- `m:ss` / `mm:ss` time formatter exists 4 times: `lib/utils.ts:8` (`formatTime`), `lib/achievements.ts:281` (`formatTimeMS`, dead), `components/game/Timer.tsx:6` (`fmt`), `app/api/share/seal/[date]/route.tsx:51` (inline).
- **Fix idea:** export `cellName` from `lib/sudoku/types.ts`; consolidate time formatting in `lib/utils.ts`.

#### H10. `new Date().toISOString().slice(0,10)` open-coded after `todayUTC()` exists
- `lib/utils.ts:14` already defines `todayUTC()`.
- Bypassed in: `lib/coach/usage.ts:8`, `lib/skins/server.ts:13`, `lib/achievements.ts:180`, `app/skins/page.tsx:24`, `app/profile/page.tsx:40`.
- Drift risk: server-local vs UTC.

### MEDIUM — drift risk, fix opportunistically

#### M1. Mixed action/route convention for writes
- `/api/daily/submit` is a route called via `fetch()` from `WinModal.tsx:75`; `/api/seal/freeze` is also a route doing a Supabase upsert.
- Every other write (`saveGame`, `setActiveSkin`, `saveCity`, `saveSfxPreference`, `saveUsername`) is a server action.
- No documented rule.
- **Fix idea:** convert `/api/daily/submit` and `/api/seal/freeze` to server actions; reserve `app/api/*` for streaming (coach), webhooks, and external callers.

#### M2. `WinModal` re-derives data the server already computed
- `WinModal.tsx:140-142` re-scans the year `YearSeries` for `filledCount`/`todayAlreadyFilled`; `WinModal.tsx:128-131` optimistically rewrites `state: "today"` → `state: "filled"`, duplicating what `/api/seal/year` produces. Two effects (open + submit) both call `fetchYear()`.

#### M3. Difficulty picker duplicated 5×
- Same `[{k:"易",lvl:"i",name:"Easy",stats:"avg 4:12 · 38 givens",href:"/play/easy"} ...]` array and 4-card layout in `components/landing/Landing.tsx:253-307`, `app/play/page.tsx:8-71`, `app/play/loading.tsx:5-51`, with minimal `{k,href}` variants at `app/page.tsx:193-211`, `app/loading.tsx:7-50`.

#### M4. MONTHS / date formatters duplicated 3×
- `app/profile/_profile-data.ts:24-32`, `app/page.tsx:28-39`, `lib/achievements.ts:159-175` — three `MONTHS[]` arrays with slightly different formatters (`DD mmm`, en-label, `DD mmm YYYY`).

#### M5. ISO date arithmetic open-coded ~10×
- Same `new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() ± n); d.toISOString().slice(0,10)` recipe in `lib/seal/streak.ts:35`, `lib/seal/calendar.ts:43`, `lib/stats/heatmap.ts:19-21`, `app/_home-year-data.ts:89-91`, `app/profile/_profile-data.ts:42-68` (×5), and elsewhere.

#### M6. `lib/vfx/SealStamp.tsx` is a `"use client"` React component under `lib/`
- Imported as `@/lib/vfx/SealStamp` by `components/game/WinModal.tsx:14`. UI inversion makes `lib` impure.
- **Fix:** move to `components/vfx/SealStamp.tsx`.

#### M7. Cross-domain coupling: skins → stripe, achievements → seal
- `lib/skins/catalog.ts:3` imports from `lib/stripe/skin-prices` — skins now depends on payments.
- `lib/achievements.ts:1` imports `computeUnifiedStreak` from `lib/seal/streak` — top-level achievements file pulls from a feature domain.
- **Fix:** pass `priceLookup` as a callback; relocate `achievements.ts` to `lib/seal/achievements.ts`.

#### M8. Three Supabase client factories without a decision rule
- `lib/supabase/{server,client,admin,public}.ts` exist; which to use when is left to the caller's intuition. `app/page.tsx:105` calls `createServerClient()` for one column after `getViewer()` already opened a client, defeating dedupe.

#### M9. Naming inconsistency: `dailyNumber` / `dailySeq` / `seq`
- Same concept named three ways: `game-store.ts:28 dailyNumber`, `home-data.ts:71 getDailySeq`, DB column `seq`, `Landing.tsx:8 dailySeq`. Pick one (`dailySeq` matches DB).

#### M10. `lib/utils.ts` is a junk drawer
- Holds `cn` (UI), `formatTime` (UI), `todayUTC` (date) — mixed concerns. Split into `lib/ui/cn.ts` and a time module.

### LOW — cosmetic / dead-code

- **L1.** `lib/skins/registry.ts` is dead (only `tests/skins/registry.test.ts` imports it; data is superseded by DB-backed `skins` table + `HARDCODED_DEFAULT`).
- **L2.** `@anthropic-ai/sdk` dependency declared in package.json but never imported (code uses `@google/genai`). Drop it.
- **L3.** Unused exported types: `Technique`, `HintResult`, `GameState`, `SkinKind`, `SkinRegistryEntry`, `ResultRow`, `DailySnapshot`, `UserStanding`, `TodayRank`, `SnapshotRow`, `DailySnapshotRaw`, `TodaySealRow`, `AchievementCategory`, `AchievementDef`.
- **L4.** `lib/kanji.ts:5 kanjiNum`, `lib/kanji-bank.ts:470 RESERVED`, `lib/home-data.ts:111 getPublicDailyResults` are exported but only used inside their own files. Unexport.
- **L5.** Difficulty literal array `["easy","medium","hard","expert"]` repeated 5× as ad-hoc constants. Export `DIFFICULTIES: Difficulty[]` from `lib/sudoku/types.ts`.
- **L6.** Stale `// TODO(stripe): implement webhook` comments at `app/api/stripe/checkout/route.ts:22` and `.../skin/route.ts:81`. Either implement or remove.
- **L7.** Rank-formatting `.toString().padStart(2,"0")` repeated; tiny `rank2(n)` helper would dedupe.
- **L8.** `STAMP_NOISE` SVG data URL duplicated 3× across `app/profile/page.tsx`, `ProfileBody.tsx`, `VermillionStamp.tsx`, `AchievementStamp.tsx`.

---

## Suggested priorities (3 candidate fix groups)

These are not all the things worth doing — they are clusters that share a theme and would deliver disproportionate benefit if tackled together.

### Group A — "Auth + profile + identity hygiene" (HIGH impact, medium effort)
- H4 (`requireUser()` helper)
- H5 (`getProfile()` cache)
- M8 (Supabase client decision doc)
- Removes the most-repeated pattern in the codebase. Every new page/action gets simpler.

### Group B — "Game store + GameShell decomposition" (HIGH impact, higher effort)
- H1 (persistence middleware)
- H2 (snapshot helper, single storage key)
- H7 (extract hooks from GameShell)
- H3 (collapse save-game + sync-guest)
- Untangles the most-touched UI surface in the app.

### Group C — "Trivial helper cleanup + dead code" (LOW-MEDIUM impact, low effort)
- H9, H10 (`cellName`, `formatTime`, `todayUTC`)
- M4, M5 (date helpers consolidation)
- M3 (difficulty picker shared component)
- L1, L2, L3, L4 (dead code + unused types)
- A "broken-window" pass — small individually, makes the codebase visibly tidier.

### Not recommended for this pass
- Splitting `lib/utils.ts` (M10) — purely cosmetic; the file is small.
- Renaming `dailyNumber → dailySeq` (M9) — touches a lot of files for low payoff; pick up if a daily-related change is happening anyway.
- Converting all routes to actions (M1) — defensible decision either way; would only do if action contracts are standardized first (H8).

---

## What's notably absent

These are things the audit looked for and did NOT find — call them out so we don't manufacture problems:
- **No circular dependencies between domains.**
- **No god-files.** Largest file is 516 lines (`Landing.tsx`) and it's mostly markup.
- **No mystery deep abstractions.** Code is direct and readable.
- **No leaking secrets, no SQL injection vectors, no obvious security holes** (not a security audit, but nothing jumped out).
- **No performance smoking guns at the architecture level** — `tick` writing every second is the closest thing, and that's a side-effect concern.
