import { describe, it, expect } from "vitest";
import { findHint, candidates, findLockedCandidate, findNakedPair, findHintForCell } from "@/lib/sudoku/techniques";

const parse = (s: string) => s.split("").map((c) => (c === "." ? 0 : +c));

describe("candidates", () => {
  it("returns valid digits for an empty cell", () => {
    const b = parse(".".repeat(81));
    expect(candidates(b, 0)).toEqual([1,2,3,4,5,6,7,8,9]);
  });
});

describe("findHint", () => {
  it("finds a naked single", () => {
    const b = parse(
      "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79"
    );
    const hint = findHint(b);
    expect(hint).not.toBeNull();
    expect(hint!.value).toBeGreaterThanOrEqual(1);
    expect(hint!.value).toBeLessThanOrEqual(9);
    expect(["naked-single","hidden-single","locked-candidate","naked-pair","hidden-pair","x-wing"]).toContain(hint!.technique);
  });

  it("returns null on a solved board", () => {
    const solved = parse("534678912672195348198342567859761423426853791713924856961537284287419635345286179");
    expect(findHint(solved)).toBeNull();
  });
});

describe("findLockedCandidate", () => {
  it("detects a digit confined to one row inside a box", () => {
    // Box 0 (top-left 3x3) has no 7. Row 1 has a 7 at col 5, row 2 has a 7 at col 4.
    // So 7 in box 0 can only live in row 0 → 7 is eliminated from rest of row 0.
    const b = Array(81).fill(0);
    b[14] = 7;  // (1,5)
    b[22] = 7;  // (2,4)
    const hint = findLockedCandidate(b);
    expect(hint).not.toBeNull();
    expect(hint!.technique).toBe("locked-candidate");
    expect(hint!.value).toBe(7);
    expect(hint!.unit).toMatch(/box 1/);
    expect(hint!.cells).toEqual(expect.arrayContaining([0, 1, 2])); // row 0 cells in box 0
  });

  it("returns null when no locked candidate applies", () => {
    const b = parse(".".repeat(81));
    expect(findLockedCandidate(b)).toBeNull();
  });
});

describe("findNakedPair", () => {
  it("detects two cells in a unit sharing the same two candidates", () => {
    // Row 0: cells (0,0) and (0,1) empty, (0,2)..(0,8) = 3,4,5,6,7,8,9.
    // Both (0,0) and (0,1) have candidates {1,2} → naked pair in row 0.
    // The pair must eliminate at least one candidate elsewhere in some unit
    // it shares — column 0 and box 0 still have other empty cells whose
    // candidates include 1 or 2, so the constraint is non-vacuous.
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
    // Target = (4,4) with broad candidates. Cell (0,0) is a clean naked single.
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
});
