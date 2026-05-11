# Sensei — engine-grounded hints

**Date:** 2026-05-11
**Status:** approved (design)

## Problem

The Sensei (AI sudoku coach) wired through [app/api/coach/route.ts](../../../app/api/coach/route.ts) and [components/game/CoachPopover.tsx](../../../components/game/CoachPopover.tsx) returns generic, often useless output ("let's look at R1C6, that's the user's column"). Root cause: the prompt asks Gemini 2.5 Flash to *be* a sudoku engine — receive a raw board and derive a technique. Flash can't reliably compute candidates, scan units, and pick a technique, so it bluffs.

Two related defects in the current code:

- The UI sends `{ board, target, kind: "ask" | "nudge" }`, but [route.ts:31](../../../app/api/coach/route.ts) only destructures `board` and `target`. The "nudge" vs "ask again" buttons produce identical output.
- The system prompt declares "Stop. Do not reveal the digit unless the user has already asked twice" — there is no state tracking, so this rule never fires.

## Approach

**Engine does sudoku, LLM does voice.** Pre-compute the applicable technique server-side using the deterministic engine in [lib/sudoku/techniques.ts](../../../lib/sudoku/techniques.ts), then ask Gemini only to phrase the verified hint in the Sensei's voice. The LLM's role collapses from "solve sudoku" (which it's bad at) to "rewrite this hint conversationally" (which it's good at).

Tier gating layers on top: free users get singles-only hints; Pro unlocks locked candidates and naked pairs. Free users hitting a Pro-tier position get redirected to a singles hint elsewhere on the board.

## Tier matrix

| Tier | Daily hint limit | Techniques offered |
| ---- | ---------------- | ------------------ |
| Free | 20/day (existing gate) | naked single, hidden single |
| Pro  | unlimited | + locked candidate, naked pair |

Daily limit gate stays in [lib/coach/usage.ts](../../../lib/coach/usage.ts) unchanged.

## Architecture

### 1. Engine extensions — [lib/sudoku/techniques.ts](../../../lib/sudoku/techniques.ts)

Add two new detectors and one target-aware lookup. The existing `Hint` shape is extended to carry the structured context the prompt needs.

**Extended `Hint` shape:**

```ts
export interface Hint {
  index: number;            // anchor cell (0-80) — the cell the UI highlights and the hint speaks about
  value: number | null;     // digit central to the technique; null when no single digit applies (naked pair involves two)
  technique: Technique;
  unit: string;             // human label, e.g. "row 5", "column 3", "box 7"
  cells: number[];          // supporting cells (empty for naked-single; the two paired cells for naked-pair; the in-box candidate cells for locked-candidate)
  reason: string;           // engine-derived sentence; LLM may rephrase but must not contradict
  redirect?: boolean;       // true when the hint applies to a different cell than the user's selection
}
```

**New detectors:**

- **`findLockedCandidate(board): Hint | null`** — for each box × digit, if the digit's candidates inside the box are confined to a single row or column, the digit can be eliminated from the rest of that line. Returns the first such constraint found. `value` is set to the constrained digit; `cells` lists the candidate cells inside the box; `index` is the first candidate cell (used as the "anchor" the UI highlights).
- **`findNakedPair(board): Hint | null`** — for each unit, find two empty cells that share the same exact two-candidate set. Returns the first pair found. `value` is `null`; `cells` is the two paired cells; `index` is the first of the two; `reason` names the two digits and the unit.

**New target-aware lookup:**

```ts
export function findHintForCell(
  board: Board,
  target: number,
  opts: { proTechniques: boolean }
): { hint: Hint; tier: "free" | "pro" } | { downgrade: true; redirect: Hint | null } | null;
```

Order of operations:

1. Try **naked single** at `target`. If found → return free-tier hint.
2. Try **hidden single** in any unit containing `target`, where `target` is the resolving cell. If found → return free-tier hint.
3. If `proTechniques`:
   - Try **locked candidate** in any box/line containing `target`. → Pro-tier hint.
   - Try **naked pair** in any unit containing `target`. → Pro-tier hint.
4. If no hint applies *to* `target`:
   - Run `findHint(board)` (existing) for any singles-tier hint elsewhere. If found → return as `redirect: true` free-tier hint.
   - Else return `null` (board is solved or unsolvable from singles).
5. **Downgrade case** (free user, only pro-tier hint applies to `target`): return `{ downgrade: true, redirect: <singles hint elsewhere or null> }`.

`findHint` (existing) keeps its current signature and behaviour. New code goes alongside it.

### 2. Prompt rewrite — [lib/coach/prompt.ts](../../../lib/coach/prompt.ts)

**New `SYSTEM_PROMPT`:**

```
You are the Sensei in a Japanese-aesthetic sudoku app. You receive a verified hint
derived by the engine. Your only job is to phrase it for the player in 2–3 sentences.

Rules:
- Never invent cells, digits, or reasoning. Use exactly what the hint provides.
- "nudge" mode: name the technique and point to the unit. NEVER state the cell or digit.
- "ask" mode: name the technique, the cell (R<row>C<col>), and the digit (if provided). Then a one-sentence why.
- "redirect" hints: gently suggest the player try the other cell instead of the one they selected.
- "downgrade" hints: tell the player this position needs an advanced technique reserved for Pro,
  and offer the redirect cell if one is provided.
- Tone: spare, encouraging, grounded. No emoji, no exclamations, no filler.
```

**New `userMessage(payload, kind)`** builds a structured brief from the engine output:

```
Technique: hidden-single
Unit: row 5
Target cell: R5C2          // omitted in nudge mode
Digit: 7                   // omitted in nudge mode; null hints omit always
Supporting cells: R5C6, R5C8
Reasoning: Of the empty cells in row 5, only R5C2 can hold a 7 — R5C6 sees a 7 in box 6, R5C8 sees a 7 in column 8.
Mode: nudge
```

For `redirect` hints, prepend `Original target was R<r>C<c>; suggesting R<r>C<c> instead.`
For `downgrade` payloads, the brief is just `Mode: downgrade`, plus the redirect block if any.

The legacy `serializeBoard` helper is removed — the LLM no longer needs the raw board.

### 3. Route handler — [app/api/coach/route.ts](../../../app/api/coach/route.ts)

Restructured POST flow (order matters for quota fairness):

1. **Parse + validate body**: `{ board: number[81], target: 0..80, kind: "ask"|"nudge" }`. Reject malformed (`400`) without touching the quota.
2. **Auth + profile fetch** (existing): get user (`401` if missing), fetch `is_pro`.
3. **Run engine first**: `findHintForCell(board, target, { proTechniques: isPro })`.
   - `null` → return `200` with text body `"The board looks complete — nothing to hint."`. **No quota consumed.**
4. **Rate gate**: now call `checkAndIncrement(userId, isPro)`. If `!ok` → `429` with existing message.
5. **Stream Gemini**: build `userMessage(payload, kind)`, stream as today. On Gemini failure, stream `"\n[error] Sensei is offline."` and end gracefully.

**Quota rule:** the quota is consumed if and only if we call Gemini. That means it IS consumed for hint, redirect, and downgrade payloads (all three call Gemini for voice consistency), and is NOT consumed for `400` (bad request), `401` (no auth), or the `200`-with-completion-text path. The reorder above (validate + run engine before `checkAndIncrement`) enforces this.

### 4. UI — [components/game/CoachPopover.tsx](../../../components/game/CoachPopover.tsx)

Targeted cleanups, no restructure:

- **Replace fake placeholder text.** [CoachPopover.tsx:15-17](../../../components/game/CoachPopover.tsx) currently boots with a hardcoded "middle-right box… R6C8" sentence that looks like a real coach response. Replace with the literal string `"Select a cell, then ask for a nudge."`.
- **Surface the daily limit.** When the API returns 429, render the response body as-is (already happens via `setText`); no special parsing needed since the error message itself reads "Daily AI limit reached. Upgrade to Pro for unlimited."
- **No special handling for downgrade/redirect.** The backend message already reads naturally; the UI just renders it.
- **Disabled state and `kind` wiring stay as they are.** The component already sends `kind`; section 3 makes the backend use it.

### 5. Tests

Extend [tests/sudoku/techniques.test.ts](../../../tests/sudoku/techniques.test.ts):

- `findLockedCandidate`: hand-built board where a digit is confined to one row inside a box; assert returned `unit` and `cells`.
- `findNakedPair`: hand-built board with two cells in a row sharing `{2, 7}`; assert pair is detected and reported.
- `findHintForCell`:
  - target with a naked single available → returns free-tier naked-single.
  - target with only a locked-candidate available, `proTechniques: true` → returns pro-tier hint.
  - target with only a locked-candidate available, `proTechniques: false` → returns `{ downgrade: true, redirect }`.
  - target with no applicable hint, but board has a hidden single elsewhere → returns redirect hint.
  - solved board → returns `null`.

Add `tests/components/coach-route.test.ts` (new):

- `400` on malformed board (length 80, kind missing, target out of range).
- `401` when no session.
- `200` with completion text on solved board, **without** incrementing `ai_usage`.
- `429` when free user is at quota.
- Pro user gets pair hint; Free user with only-pro position gets downgrade message.
- Mock the Gemini stream — assert the prompt the route builds contains `Mode: nudge` when `kind: "nudge"` is sent and includes the digit only when `kind: "ask"`.

Add `tests/lib/coach-prompt.test.ts` (new): snapshot `userMessage(hint, kind)` output for each `(technique × kind)` combo plus the redirect and downgrade variants. Snapshots guard against silent prompt drift.

## Out of scope

- New techniques beyond locked candidate and naked pair (hidden pair, x-wing, etc.).
- Persisting per-cell ask history to enable a 3-tier "ask twice → reveal" escalation.
- UI redesign of the Sensei panel (layout, animations, alternate placements).
- Changing the daily quota number or its scope (it stays per-user/per-day, 20 free).
- Switching models away from `gemini-2.5-flash` or making the model configurable per tier.

## Risks

- **Engine correctness for new detectors.** Locked candidate and naked pair are easy to mis-implement (off-by-one on box bounds, missing the "two cells, same exact set" check). Mitigated by the tests above and by the hand-built board fixtures.
- **Prompt drift.** A future edit to `SYSTEM_PROMPT` could re-introduce hallucination. The prompt snapshot tests catch that.
- **Quota fairness regression.** The reorder in the route handler must be paired with the test that asserts `ai_usage` is *not* incremented on `400`/`200-no-hint` paths.
