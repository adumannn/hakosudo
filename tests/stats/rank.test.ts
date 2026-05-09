import { describe, it, expect } from "vitest";
import { computeTodayRank } from "@/lib/stats/rank";

describe("computeTodayRank", () => {
  it("returns null when the user isn't in the rows", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
    ];
    expect(computeTodayRank({ rows, userId: "missing" })).toBeNull();
  });

  it("returns null when rows are empty", () => {
    expect(computeTodayRank({ rows: [], userId: "a" })).toBeNull();
  });

  it("returns rank 1 when user is first (rows already sorted ASC)", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "a" })).toEqual({ rank: 1, total: 3 });
  });

  it("returns rank N when user is last", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "c" })).toEqual({ rank: 3, total: 3 });
  });

  it("returns rank in the middle", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "c", elapsed_seconds: 300 },
    ];
    expect(computeTodayRank({ rows, userId: "b" })).toEqual({ rank: 2, total: 3 });
  });

  it("uses competition rank when elapsed_seconds ties", () => {
    const rows = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 100 },
      { user_id: "c", elapsed_seconds: 150 },
    ];
    expect(computeTodayRank({ rows, userId: "a" })).toEqual({ rank: 1, total: 3 });
    expect(computeTodayRank({ rows, userId: "b" })).toEqual({ rank: 1, total: 3 });
    expect(computeTodayRank({ rows, userId: "c" })).toEqual({ rank: 3, total: 3 });
  });

  it("rank is independent of input row order", () => {
    const rowsForward = [
      { user_id: "a", elapsed_seconds: 100 },
      { user_id: "b", elapsed_seconds: 200 },
    ];
    const rowsReversed = [
      { user_id: "b", elapsed_seconds: 200 },
      { user_id: "a", elapsed_seconds: 100 },
    ];
    expect(computeTodayRank({ rows: rowsForward, userId: "a" })).toEqual({ rank: 1, total: 2 });
    expect(computeTodayRank({ rows: rowsReversed, userId: "a" })).toEqual({ rank: 1, total: 2 });
  });
});
