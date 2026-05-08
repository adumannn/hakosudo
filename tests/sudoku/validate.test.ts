import { describe, it, expect } from "vitest";
import { isValidPlacement, isComplete, findConflicts } from "@/lib/sudoku/validate";
import { idx } from "@/lib/sudoku/types";

const empty = () => Array<number>(81).fill(0);

describe("isValidPlacement", () => {
  it("rejects duplicate in row", () => {
    const b = empty(); b[idx(0, 0)] = 5;
    expect(isValidPlacement(b, 0, 4, 5)).toBe(false);
  });
  it("rejects duplicate in column", () => {
    const b = empty(); b[idx(2, 3)] = 7;
    expect(isValidPlacement(b, 6, 3, 7)).toBe(false);
  });
  it("rejects duplicate in 3x3 box", () => {
    const b = empty(); b[idx(0, 0)] = 9;
    expect(isValidPlacement(b, 1, 1, 9)).toBe(false);
  });
  it("accepts valid placement", () => {
    expect(isValidPlacement(empty(), 4, 4, 5)).toBe(true);
  });
});

describe("isComplete", () => {
  it("returns false for board with 0s", () => expect(isComplete(empty())).toBe(false));
});

describe("findConflicts", () => {
  it("finds the indices of conflicting cells", () => {
    const b = empty(); b[idx(0, 0)] = 5; b[idx(0, 5)] = 5;
    expect(findConflicts(b)).toEqual(expect.arrayContaining([idx(0, 0), idx(0, 5)]));
  });
});
