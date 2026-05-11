# Sensei engine-grounded hints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Sensei coach return reliable, technique-grounded hints by computing the technique server-side with the existing sudoku engine and using Gemini only to phrase the verified hint.

**Architecture:** Extend the deterministic engine in `lib/sudoku/techniques.ts` with two new detectors (locked candidate, naked pair) and a target-aware lookup. Restructure the API route to run the engine first, then ask the LLM to voice the result. Gate advanced techniques to Pro tier; reorder the rate gate so the daily quota is consumed only when Gemini is actually called. UI changes are minimal (replace fake placeholder text).

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, Supabase SSR client, Google `@google/genai` SDK, Tailwind.

**Spec:** [docs/superpowers/specs/2026-05-11-sensei-engine-grounding-design.md](../specs/2026-05-11-sensei-engine-grounding-design.md)

## File Structure

**Modify:**
- `lib/sudoku/techniques.ts` — extend `Hint`, add `findLockedCandidate`, `findNakedPair`, `findHintForCell`
- `lib/coach/prompt.ts` — replace `SYSTEM_PROMPT`, replace `userMessage` signature, drop `serializeBoard`
- `app/api/coach/route.ts` — restructure POST flow (validate → engine → quota → stream)
- `components/game/CoachPopover.tsx` — replace hardcoded placeholder string
- `tests/sudoku/techniques.test.ts` — extend with new detector + lookup tests

**Create:**
- `tests/coach/prompt.test.ts` — snapshot `userMessage` for each (technique × mode) variant
- `tests/coach/route.test.ts` — integration tests for route handler

(The existing test layout groups by feature domain — `tests/seal/`, `tests/stripe/`, etc. — not by app-directory path. New tests follow the same pattern under `tests/coach/`.)

---

## Task 1: Extend `Hint` interface and update `findHint` to populate new fields

**Files:**
- Modify: `lib/sudoku/techniques.ts:7-12` (interface), `lib/sudoku/techniques.ts:46-65` (findHint)
- Test: `tests/sudoku/techniques.test.ts:13-29` (existing tests stay green)

- [ ] **Step 1: Modify the `Hint` interface**

Replace lines 7-12 of `lib/sudoku/techniques.ts` with:

```ts
export interface Hint {
  index: number;            // anchor cell (0-80) — the cell the UI highlights and the hint speaks about
  value: number | null;     // digit central to the technique; null for naked-pair (involves two)
  technique: Technique;
  unit: string;             // human label, e.g. "row 5", "column 3", "box 7"
  cells: number[];          // supporting cells (empty for naked-single; the two paired cells for naked-pair; in-box candidate cells for locked-candidate)
  reason: string;
  redirect?: boolean;       // true when the hint applies to a different cell than the user's selection
}
```

- [ ] **Step 2: Update existing `findHint` to populate the new fields**

In `lib/sudoku/techniques.ts`:

- Update the naked-single branch to set `unit: \`cell ${cellName(i)}\``, `cells: []`.
- Update the hidden-single branch to set `unit: unitKind(unit)` (already used in reason) and `cells: unit.filter((j) => !b[j] && j !== i)`.

Replace lines 46-65 with:

```ts
export function findHint(b: Board): Hint | null {
  // 1. Naked single — only one candidate for a cell
  for (let i = 0; i < 81; i++) {
    if (b[i]) continue;
    const cs = candidates(b, i);
    if (cs.length === 1) {
      return {
        index: i,
        value: cs[0],
        technique: "naked-single",
        unit: `cell ${cellName(i)}`,
        cells: [],
        reason: `Cell ${cellName(i)} has only one possible digit (${cs[0]}).`,
      };
    }
  }
  // 2. Hidden single — only one cell in a unit can hold a digit
  for (const unit of allUnits) {
    for (let v = 1; v <= 9; v++) {
      if (unit.some((i) => b[i] === v)) continue;
      const candidatesInUnit = unit.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (candidatesInUnit.length === 1) {
        const i = candidatesInUnit[0];
        return {
          index: i,
          value: v,
          technique: "hidden-single",
          unit: unitKind(unit),
          cells: unit.filter((j) => !b[j] && j !== i),
          reason: `In this ${unitKind(unit)}, only ${cellName(i)} can hold ${v}.`,
        };
      }
    }
  }
  return null;
}
```

- [ ] **Step 3: Run existing tests to verify nothing regressed**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: 3 tests pass (`candidates returns valid digits`, `findHint finds a naked single`, `findHint returns null on a solved board`).

- [ ] **Step 4: Commit**

```bash
git add lib/sudoku/techniques.ts
git commit -m "refactor(sudoku): extend Hint shape with unit/cells/redirect fields"
```

---

## Task 2: Implement `findLockedCandidate` (TDD)

**Files:**
- Modify: `lib/sudoku/techniques.ts` (append new function)
- Test: `tests/sudoku/techniques.test.ts` (append new describe)

- [ ] **Step 1: Write the failing tests**

Append to `tests/sudoku/techniques.test.ts`:

```ts
import { findLockedCandidate } from "@/lib/sudoku/techniques";

describe("findLockedCandidate", () => {
  it("detects a digit confined to one row inside a box", () => {
    // Box 0 (top-left 3x3) has no 7. Row 1 has a 7 at col 5, row 2 has a 7 at col 4.
    // So 7 in box 0 can only live in row 0 → 7 is eliminated from rest of row 0.
    const b = parse(
      ".................7........7........" + ".".repeat(81 - 36)
    );
    // Above: row 0 empty (cols 0-8), row 1 col 5 = 7, row 2 col 4 = 7, rest empty.
    // Index 14 = (1,5), index 22 = (2,4).
    const hint = findLockedCandidate(b);
    expect(hint).not.toBeNull();
    expect(hint!.technique).toBe("locked-candidate");
    expect(hint!.value).toBe(7);
    expect(hint!.unit).toMatch(/box 1/); // box index displayed 1-based
    expect(hint!.cells).toEqual(expect.arrayContaining([0, 1, 2])); // row 0 cells in box 0
  });

  it("returns null when no locked candidate applies", () => {
    const b = parse(".".repeat(81));
    expect(findLockedCandidate(b)).toBeNull();
  });
});
```

Note: the `parse` helper at the top of the existing test file converts a string of `.` and digits into a `Board`. The test fixture string is built so:
- Indices 0-8 (row 0) = empty (`.`)
- Index 14 = (1,5) = `7`
- Index 22 = (2,4) = `7`
- Everything else empty

The string is exactly 81 chars: `"............../* 14 */.7......./* 22 */7........" + dots`. Build it explicitly in the test if the calculation is fiddly:

```ts
const b = Array(81).fill(0);
b[14] = 7;  // (1,5)
b[22] = 7;  // (2,4)
```

Use the array-build form — it's clearer than counting dots.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: FAIL — `findLockedCandidate is not a function` (import fails).

- [ ] **Step 3: Implement `findLockedCandidate`**

Append to `lib/sudoku/techniques.ts`:

```ts
export function findLockedCandidate(b: Board): Hint | null {
  // For each box × digit: if all candidate cells for that digit inside the
  // box share a single row or single column, the digit is "locked" — it
  // can be eliminated from the rest of that line.
  for (let bi = 0; bi < 9; bi++) {
    const br = Math.floor(bi / BOX) * BOX;
    const bc = (bi % BOX) * BOX;
    const boxCells: number[] = [];
    for (let dr = 0; dr < BOX; dr++)
      for (let dc = 0; dc < BOX; dc++) boxCells.push(idx(br + dr, bc + dc));

    for (let v = 1; v <= 9; v++) {
      if (boxCells.some((i) => b[i] === v)) continue; // already placed in box
      const cands = boxCells.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (cands.length < 2) continue; // 0 = no candidates; 1 = hidden single (handled elsewhere)
      const rows = new Set(cands.map((i) => rc(i)[0]));
      const cols = new Set(cands.map((i) => rc(i)[1]));
      if (rows.size === 1) {
        const r = [...rows][0];
        // Confirm the constraint actually eliminates something outside the box.
        const eliminatesOutside = Array.from({ length: SIZE }, (_, c) => idx(r, c))
          .filter((i) => i < br * SIZE + bc || i >= br * SIZE + bc + BOX)
          .some((i) => !b[i] && candidates(b, i).includes(v));
        if (!eliminatesOutside) continue;
        return {
          index: cands[0],
          value: v,
          technique: "locked-candidate",
          unit: `box ${bi + 1}`,
          cells: cands,
          reason: `In box ${bi + 1}, ${v} can only sit in row ${r + 1} — so ${v} is eliminated from the rest of row ${r + 1}.`,
        };
      }
      if (cols.size === 1) {
        const c = [...cols][0];
        const eliminatesOutside = Array.from({ length: SIZE }, (_, r) => idx(r, c))
          .filter((i) => {
            const [rr] = rc(i);
            return rr < br || rr >= br + BOX;
          })
          .some((i) => !b[i] && candidates(b, i).includes(v));
        if (!eliminatesOutside) continue;
        return {
          index: cands[0],
          value: v,
          technique: "locked-candidate",
          unit: `box ${bi + 1}`,
          cells: cands,
          reason: `In box ${bi + 1}, ${v} can only sit in column ${c + 1} — so ${v} is eliminated from the rest of column ${c + 1}.`,
        };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: 5 tests pass (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/sudoku/techniques.ts tests/sudoku/techniques.test.ts
git commit -m "feat(sudoku): add locked-candidate detector"
```

---

## Task 3: Implement `findNakedPair` (TDD)

**Files:**
- Modify: `lib/sudoku/techniques.ts` (append new function)
- Test: `tests/sudoku/techniques.test.ts` (append new describe)

- [ ] **Step 1: Write the failing tests**

Append to `tests/sudoku/techniques.test.ts`:

```ts
import { findNakedPair } from "@/lib/sudoku/techniques";

describe("findNakedPair", () => {
  it("detects two cells in a unit sharing the same two candidates", () => {
    // Row 0: cells (0,0) and (0,1) empty, (0,2)..(0,8) = 3,4,5,6,7,8,9.
    // Row 1: (1,0) empty so naked pair has somewhere to eliminate.
    // Both (0,0) and (0,1) have candidates {1,2} → naked pair in row 0.
    // Cell (1,0) shares column 0 with (0,0); for the pair to be interesting it
    // should be a candidate that includes 1 or 2 — leaving column 0 mostly empty
    // satisfies that.
    const b = Array(81).fill(0);
    for (let c = 2; c <= 8; c++) b[c] = c + 1; // row 0, cols 2..8 = 3..9
    const hint = findNakedPair(b);
    expect(hint).not.toBeNull();
    expect(hint!.technique).toBe("naked-pair");
    expect(hint!.value).toBeNull();
    expect(hint!.unit).toMatch(/row 1/);
    expect(hint!.cells.sort()).toEqual([0, 1]);
  });

  it("returns null when no naked pair exists", () => {
    expect(findNakedPair(Array(81).fill(0))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: FAIL — `findNakedPair is not a function`.

- [ ] **Step 3: Implement `findNakedPair`**

Append to `lib/sudoku/techniques.ts`:

```ts
export function findNakedPair(b: Board): Hint | null {
  for (const unit of allUnits) {
    const empties = unit.filter((i) => !b[i]);
    const pairs: { i: number; cs: number[] }[] = empties
      .map((i) => ({ i, cs: candidates(b, i) }))
      .filter((x) => x.cs.length === 2);
    for (let a = 0; a < pairs.length; a++) {
      for (let bIdx = a + 1; bIdx < pairs.length; bIdx++) {
        const A = pairs[a],
          B = pairs[bIdx];
        if (A.cs[0] !== B.cs[0] || A.cs[1] !== B.cs[1]) continue;
        // Confirm the pair actually eliminates a candidate elsewhere in the unit.
        const eliminates = empties.some(
          (i) =>
            i !== A.i &&
            i !== B.i &&
            candidates(b, i).some((d) => d === A.cs[0] || d === A.cs[1]),
        );
        if (!eliminates) continue;
        return {
          index: A.i,
          value: null,
          technique: "naked-pair",
          unit: unitKind(unit),
          cells: [A.i, B.i],
          reason: `In this ${unitKind(unit)}, ${cellName(A.i)} and ${cellName(B.i)} must be ${A.cs[0]} and ${A.cs[1]} in some order — so ${A.cs[0]} and ${A.cs[1]} are eliminated from the other cells in the ${unitKind(unit)}.`,
        };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: 7 tests pass (5 from before + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/sudoku/techniques.ts tests/sudoku/techniques.test.ts
git commit -m "feat(sudoku): add naked-pair detector"
```

---

## Task 4: Implement `findHintForCell` (TDD)

**Files:**
- Modify: `lib/sudoku/techniques.ts` (append new function + result type)
- Test: `tests/sudoku/techniques.test.ts` (append new describe)

- [ ] **Step 1: Write the failing tests**

Append to `tests/sudoku/techniques.test.ts`:

```ts
import { findHintForCell } from "@/lib/sudoku/techniques";

describe("findHintForCell", () => {
  it("returns a free-tier naked-single hint when target has one candidate", () => {
    // Cell (0,0) target. Column 0 rows 1-8 = 2..9. Only 1 fits at (0,0).
    const b = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) b[r * 9] = r + 1;
    const result = findHintForCell(b, 0, { proTechniques: false });
    expect(result).not.toBeNull();
    expect("hint" in result!).toBe(true);
    if ("hint" in result!) {
      expect(result.hint.technique).toBe("naked-single");
      expect(result.hint.index).toBe(0);
      expect(result.hint.value).toBe(1);
      expect(result.tier).toBe("free");
    }
  });

  it("returns a redirect hint when target has no available technique but board does", () => {
    // Target = (5,5) with broad candidates. Cell (0,0) is a clean naked single (same setup as above).
    const b = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) b[r * 9] = r + 1;
    const result = findHintForCell(b, 40 /* (4,4) — broad candidates */, { proTechniques: false });
    expect(result).not.toBeNull();
    expect("hint" in result!).toBe(true);
    if ("hint" in result!) {
      expect(result.hint.redirect).toBe(true);
      expect(result.hint.index).toBe(0); // the naked-single we set up
    }
  });

  it("returns null when board has no available hints", () => {
    const solved = parse("534678912672195348198342567859761423426853791713924856961537284287419635345286179");
    expect(findHintForCell(solved, 0, { proTechniques: false })).toBeNull();
  });

  // Pro/downgrade paths exercised at the route layer where they matter most.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: FAIL — `findHintForCell is not a function`.

- [ ] **Step 3: Implement `findHintForCell`**

Append to `lib/sudoku/techniques.ts`:

```ts
export type HintResult =
  | { hint: Hint; tier: "free" | "pro" }
  | { downgrade: true; redirect: Hint | null };

/** Find a hint relevant to `target`. Order: naked single → hidden single
 * (free) → locked candidate → naked pair (pro). If none apply at target,
 * fall back to any hint elsewhere on the board (returned with redirect:true).
 * Pro-tier hints for free users return a downgrade payload with an optional
 * singles-tier redirect. */
export function findHintForCell(
  b: Board,
  target: number,
  opts: { proTechniques: boolean },
): HintResult | null {
  // 1. Naked single AT target
  if (!b[target]) {
    const cs = candidates(b, target);
    if (cs.length === 1) {
      return {
        hint: {
          index: target,
          value: cs[0],
          technique: "naked-single",
          unit: `cell ${cellName(target)}`,
          cells: [],
          reason: `Cell ${cellName(target)} has only one possible digit (${cs[0]}).`,
        },
        tier: "free",
      };
    }
  }

  // 2. Hidden single in any unit containing target, where target is the resolver
  const [tr, tc] = rc(target);
  const tbox = Math.floor(tr / BOX) * BOX + Math.floor(tc / BOX);
  const unitsAtTarget = allUnits.filter((u) => u.includes(target));
  for (const unit of unitsAtTarget) {
    for (let v = 1; v <= 9; v++) {
      if (unit.some((i) => b[i] === v)) continue;
      const cands = unit.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (cands.length === 1 && cands[0] === target) {
        return {
          hint: {
            index: target,
            value: v,
            technique: "hidden-single",
            unit: unitKind(unit),
            cells: unit.filter((j) => !b[j] && j !== target),
            reason: `In this ${unitKind(unit)}, only ${cellName(target)} can hold ${v}.`,
          },
          tier: "free",
        };
      }
    }
  }

  // 3. Pro-tier techniques touching target
  const proHint = findProHintTouching(b, target, tr, tc, tbox);
  if (proHint) {
    if (opts.proTechniques) return { hint: proHint, tier: "pro" };
    // Downgrade for free user
    const redirect = findHint(b);
    if (redirect) redirect.redirect = true;
    return { downgrade: true, redirect };
  }

  // 4. Fallback redirect (any singles-tier hint elsewhere)
  const fallback = findHint(b);
  if (fallback) {
    fallback.redirect = true;
    return { hint: fallback, tier: "free" };
  }
  return null;
}

function findProHintTouching(
  b: Board,
  target: number,
  tr: number,
  tc: number,
  tbox: number,
): Hint | null {
  // Locked candidate touching target box
  const lc = findLockedCandidate(b);
  if (lc) {
    const lcBox = Math.floor(rc(lc.index)[0] / BOX) * BOX + Math.floor(rc(lc.index)[1] / BOX);
    if (lcBox === tbox) return lc;
  }
  // Naked pair touching target unit
  const np = findNakedPair(b);
  if (np) {
    const sameRow = rc(np.index)[0] === tr;
    const sameCol = rc(np.index)[1] === tc;
    const sameBox =
      Math.floor(rc(np.index)[0] / BOX) * BOX + Math.floor(rc(np.index)[1] / BOX) === tbox;
    if (sameRow || sameCol || sameBox) return np;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sudoku/techniques.test.ts`

Expected: 10 tests pass (7 from before + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/sudoku/techniques.ts tests/sudoku/techniques.test.ts
git commit -m "feat(sudoku): add findHintForCell with tier gating and redirect fallback"
```

---

## Task 5: Rewrite the coach prompt (TDD via snapshots)

**Files:**
- Modify: `lib/coach/prompt.ts` (replace exports)
- Create: `tests/coach/prompt.test.ts` (snapshot tests)

- [ ] **Step 1: Write the failing snapshot tests**

Create `tests/coach/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, userMessage } from "@/lib/coach/prompt";
import type { Hint } from "@/lib/sudoku/techniques";

const nakedSingle: Hint = {
  index: 0,
  value: 1,
  technique: "naked-single",
  unit: "cell R1C1",
  cells: [],
  reason: "Cell R1C1 has only one possible digit (1).",
};

const hiddenSingle: Hint = {
  index: 13,
  value: 7,
  technique: "hidden-single",
  unit: "row 2",
  cells: [10, 11],
  reason: "In this row 2, only R2C5 can hold 7.",
};

const lockedCandidate: Hint = {
  index: 0,
  value: 7,
  technique: "locked-candidate",
  unit: "box 1",
  cells: [0, 1, 2],
  reason: "In box 1, 7 can only sit in row 1 — so 7 is eliminated from the rest of row 1.",
};

const nakedPair: Hint = {
  index: 0,
  value: null,
  technique: "naked-pair",
  unit: "row 1",
  cells: [0, 1],
  reason: "In this row 1, R1C1 and R1C2 must be 1 and 2 in some order.",
};

const redirectHint: Hint = { ...nakedSingle, redirect: true };

describe("SYSTEM_PROMPT", () => {
  it("instructs the model to never invent cells/digits", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent cells, digits, or reasoning/i);
  });

  it("describes nudge mode as no-cell-no-digit", () => {
    expect(SYSTEM_PROMPT).toMatch(/nudge.*NEVER state the cell or digit/is);
  });

  it("describes ask mode as cell + digit + why", () => {
    expect(SYSTEM_PROMPT).toMatch(/ask.*cell.*digit/is);
  });
});

describe("userMessage — hint payloads", () => {
  it("naked-single nudge omits cell and digit", () => {
    const msg = userMessage({ kind: "hint", hint: nakedSingle }, "nudge");
    expect(msg).toContain("Technique: naked-single");
    expect(msg).toContain("Mode: nudge");
    expect(msg).not.toContain("Target cell:");
    expect(msg).not.toContain("Digit:");
  });

  it("naked-single ask includes cell and digit", () => {
    const msg = userMessage({ kind: "hint", hint: nakedSingle }, "ask");
    expect(msg).toContain("Target cell: R1C1");
    expect(msg).toContain("Digit: 1");
    expect(msg).toContain("Mode: ask");
  });

  it("hidden-single ask names the unit and digit", () => {
    const msg = userMessage({ kind: "hint", hint: hiddenSingle }, "ask");
    expect(msg).toContain("Unit: row 2");
    expect(msg).toContain("Target cell: R2C5");
    expect(msg).toContain("Digit: 7");
  });

  it("locked-candidate ask includes the digit and supporting cells", () => {
    const msg = userMessage({ kind: "hint", hint: lockedCandidate }, "ask");
    expect(msg).toContain("Technique: locked-candidate");
    expect(msg).toContain("Digit: 7");
    expect(msg).toContain("Supporting cells: R1C1, R1C2, R1C3");
  });

  it("naked-pair ask omits Digit (null) and lists both cells", () => {
    const msg = userMessage({ kind: "hint", hint: nakedPair }, "ask");
    expect(msg).toContain("Technique: naked-pair");
    expect(msg).not.toContain("Digit:");
    expect(msg).toContain("Supporting cells: R1C1, R1C2");
  });

  it("redirect hint prepends a redirect note (ask mode)", () => {
    const msg = userMessage({ kind: "hint", hint: redirectHint, originalTarget: 40 }, "ask");
    expect(msg).toContain("Original target was R5C5");
    expect(msg).toContain("suggesting R1C1 instead");
  });
});

describe("userMessage — downgrade payload", () => {
  it("downgrade with no redirect just sets Mode", () => {
    const msg = userMessage({ kind: "downgrade", redirect: null }, "ask");
    expect(msg).toContain("Mode: downgrade");
    expect(msg).not.toContain("Original target");
  });

  it("downgrade with redirect includes the redirect block", () => {
    const msg = userMessage(
      { kind: "downgrade", redirect: { ...nakedSingle, redirect: true }, originalTarget: 40 },
      "ask",
    );
    expect(msg).toContain("Mode: downgrade");
    expect(msg).toContain("Original target was R5C5");
    expect(msg).toContain("suggesting R1C1 instead");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/coach/prompt.test.ts`

Expected: FAIL — most assertions fail because the current `userMessage` signature is `(board, target)` and `SYSTEM_PROMPT` doesn't contain the new copy.

- [ ] **Step 3: Replace `lib/coach/prompt.ts`**

Replace the entire file contents:

```ts
import { rc } from "@/lib/sudoku/types";
import type { Hint } from "@/lib/sudoku/techniques";

export const SYSTEM_PROMPT = `You are the Sensei in a Japanese-aesthetic sudoku app. You receive a verified hint derived by the engine. Your only job is to phrase it for the player in 2–3 sentences.

Rules:
- Never invent cells, digits, or reasoning. Use exactly what the hint provides.
- "nudge" mode: name the technique and point to the unit. NEVER state the cell or digit.
- "ask" mode: name the technique, the cell (R<row>C<col>), and the digit (if provided). Then a one-sentence why.
- "redirect" hints: gently suggest the player try the other cell instead of the one they selected.
- "downgrade" hints: tell the player this position needs an advanced technique reserved for Pro, and offer the redirect cell if one is provided.
- Tone: spare, encouraging, grounded. No emoji, no exclamations, no filler.`;

export type CoachKind = "ask" | "nudge";

export type CoachPayload =
  | { kind: "hint"; hint: Hint; originalTarget?: number }
  | { kind: "downgrade"; redirect: Hint | null; originalTarget?: number };

const cellName = (i: number) => {
  const [r, c] = rc(i);
  return `R${r + 1}C${c + 1}`;
};

export function userMessage(payload: CoachPayload, kind: CoachKind): string {
  if (payload.kind === "downgrade") {
    const lines = ["Mode: downgrade"];
    if (payload.redirect && payload.originalTarget != null) {
      lines.unshift(redirectLine(payload.originalTarget, payload.redirect.index));
      lines.push(`Suggested cell: ${cellName(payload.redirect.index)}`);
    }
    return lines.join("\n");
  }

  const { hint, originalTarget } = payload;
  const lines: string[] = [];
  if (hint.redirect && originalTarget != null) {
    lines.push(redirectLine(originalTarget, hint.index));
  }
  lines.push(`Technique: ${hint.technique}`);
  lines.push(`Unit: ${hint.unit}`);
  if (kind === "ask") {
    lines.push(`Target cell: ${cellName(hint.index)}`);
    if (hint.value !== null) lines.push(`Digit: ${hint.value}`);
  }
  if (hint.cells.length > 0) {
    lines.push(`Supporting cells: ${hint.cells.map(cellName).join(", ")}`);
  }
  lines.push(`Reasoning: ${hint.reason}`);
  lines.push(`Mode: ${kind}`);
  return lines.join("\n");
}

function redirectLine(from: number, to: number) {
  return `Original target was ${cellName(from)}; suggesting ${cellName(to)} instead.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/coach/prompt.test.ts`

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/coach/prompt.ts tests/coach/prompt.test.ts
git commit -m "feat(coach): rewrite prompt to consume engine-derived hints"
```

---

## Task 6: Restructure `app/api/coach/route.ts` (TDD)

**Files:**
- Modify: `app/api/coach/route.ts` (full rewrite)
- Create: `tests/coach/route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `tests/coach/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetSession, mockMaybeSingle, mockSelect, mockFrom, mockCheckAndIncrement, mockGenerateContentStream } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockCheckAndIncrement: vi.fn(),
  mockGenerateContentStream: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getSession: mockGetSession },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/coach/usage", () => ({
  checkAndIncrement: mockCheckAndIncrement,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContentStream: mockGenerateContentStream };
  },
}));

import { POST } from "@/app/api/coach/route";

const emptyBoard = Array(81).fill(0);
const solvedBoard = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
  .split("")
  .map(Number);

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/coach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_API_KEY = "test-key";
  mockSelect.mockReturnValue({ eq: () => ({ maybeSingle: mockMaybeSingle }) });
  mockFrom.mockReturnValue({ select: mockSelect });
  mockMaybeSingle.mockResolvedValue({ data: { is_pro: false } });
  // default Gemini mock: yields one chunk
  mockGenerateContentStream.mockResolvedValue(
    (async function* () {
      yield { text: "Sensei voice." };
    })(),
  );
});

describe("POST /api/coach", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const res = await POST(makeReq({ board: emptyBoard, target: 0, kind: "nudge" }));
    expect(res.status).toBe(401);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed body without consuming quota", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: [1, 2, 3], target: 0, kind: "nudge" }));
    expect(res.status).toBe(400);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 400 when kind is invalid", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: emptyBoard, target: 0, kind: "wat" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with completion text on solved board, no quota consumed", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: solvedBoard, target: 0, kind: "ask" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/board looks complete/i);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 429 when free user is at quota", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: false, remaining: 0 });
    // Construct a board with at least one resolvable hint at target.
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    expect(res.status).toBe(429);
  });

  it("streams Gemini output when hint is found and quota OK", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "nudge" }));
    expect(res.status).toBe(200);
    const text = await readStream(res);
    expect(text).toBe("Sensei voice.");
    expect(mockGenerateContentStream).toHaveBeenCalled();
    const callArg = mockGenerateContentStream.mock.calls[0][0];
    expect(callArg.contents).toContain("Mode: nudge");
    expect(callArg.contents).not.toContain("Digit:");
  });

  it("includes Digit in the prompt when kind is ask", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    await readStream(res);
    const callArg = mockGenerateContentStream.mock.calls[0][0];
    expect(callArg.contents).toContain("Mode: ask");
    expect(callArg.contents).toContain("Digit: 1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/coach/route.test.ts`

Expected: most fail — current route doesn't validate `kind`, runs quota before engine, etc.

- [ ] **Step 3: Replace `app/api/coach/route.ts`**

Replace the entire file contents:

```ts
import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT, userMessage, type CoachKind, type CoachPayload } from "@/lib/coach/prompt";
import { checkAndIncrement } from "@/lib/coach/usage";
import { findHintForCell } from "@/lib/sudoku/techniques";

export const runtime = "nodejs";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

function isValidBody(b: unknown): b is { board: number[]; target: number; kind: CoachKind } {
  if (!b || typeof b !== "object") return false;
  const x = b as Record<string, unknown>;
  if (!Array.isArray(x.board) || x.board.length !== 81) return false;
  if (!x.board.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) return false;
  if (typeof x.target !== "number" || !Number.isInteger(x.target) || x.target < 0 || x.target > 80) return false;
  if (x.kind !== "ask" && x.kind !== "nudge") return false;
  return true;
}

export async function POST(req: NextRequest) {
  // 1. Auth first (cheap; rejects unauthenticated requests before parsing)
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return new Response("Sign in to use the coach", { status: 401 });

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad-request", { status: 400 });
  }
  if (!isValidBody(body)) return new Response("bad-request", { status: 400 });
  const { board, target, kind } = body;

  // 3. Profile fetch (needed for tier-aware engine call)
  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = !!profile?.is_pro;

  // 4. Engine first — quota is only consumed if Gemini is actually called.
  const result = findHintForCell(board, target, { proTechniques: isPro });
  if (!result) {
    return new Response("The board looks complete — nothing to hint.", { status: 200 });
  }

  // 5. Build coach payload
  const payload: CoachPayload =
    "downgrade" in result
      ? { kind: "downgrade", redirect: result.redirect, originalTarget: target }
      : {
          kind: "hint",
          hint: result.hint,
          originalTarget: result.hint.redirect ? target : undefined,
        };

  // 6. Rate gate
  const gate = await checkAndIncrement(user.id, isPro);
  if (!gate.ok)
    return new Response(
      "Daily AI limit reached. Upgrade to Pro for unlimited.",
      { status: 429 },
    );

  // 7. Stream Gemini
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey)
    return new Response("[error] GOOGLE_API_KEY not set", { status: 500 });

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(ctrl) {
      try {
        const stream = await ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: userMessage(payload, kind),
          config: {
            systemInstruction: SYSTEM_PROMPT,
            maxOutputTokens: 200,
          },
        });
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) ctrl.enqueue(encoder.encode(text));
        }
      } catch (e) {
        console.error("[coach] gemini error:", e);
        ctrl.enqueue(encoder.encode("\n[error] Sensei is offline."));
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/coach/route.test.ts`

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/coach/route.ts tests/coach/route.test.ts
git commit -m "feat(coach): restructure route to engine-first with tier-aware hints"
```

---

## Task 7: Replace fake placeholder text in `CoachPopover`

**Files:**
- Modify: `components/game/CoachPopover.tsx:15-17`

- [ ] **Step 1: Replace the hardcoded placeholder string**

In `components/game/CoachPopover.tsx`, replace lines 15-17:

```tsx
  const [text, setText] = useState<string>(
    "Look at the middle-right box. The 7 can only live in one place — R6C8. Place it, and column 8 collapses."
  );
```

with:

```tsx
  const [text, setText] = useState<string>("Select a cell, then ask for a nudge.");
```

- [ ] **Step 2: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`

Expected: typecheck passes, all tests pass (no test currently asserts on this string).

- [ ] **Step 3: Commit**

```bash
git add components/game/CoachPopover.tsx
git commit -m "fix(coach): replace fake placeholder with prompt to select a cell"
```

---

## Task 8: Final verification

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`

Expected: all tests pass (existing + the new ones from Tasks 2–6).

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: no errors. Fix any introduced.

- [ ] **Step 4: If anything was fixed, commit**

```bash
git status
# If there are fixes:
git add -A
git commit -m "chore: address typecheck/lint findings from sensei work"
```

- [ ] **Step 5: Manual smoke test (optional but recommended)**

Set `GOOGLE_API_KEY` in `.env.local`, sign in, open a partially-solved puzzle, click a cell with a known naked single, and click both **nudge** and **ask again**. Confirm:
- Nudge response names the technique and unit but never says the cell/digit.
- Ask response names the cell and digit.
- Output is grounded — no "let's look at R1C6" hallucinations.
