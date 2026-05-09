import { describe, it, expect } from "vitest";
import { computeUserHeatmap } from "@/lib/stats/heatmap";

describe("computeUserHeatmap", () => {
  it("returns 182 entries oldest first", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [],
      freezes: new Set(),
      mediansByDate: new Map(),
    });
    expect(days).toHaveLength(182);
    expect(days[0].date).toBe("2025-11-08"); // 181 days before
    expect(days[181].date).toBe("2026-05-09");
    expect(days.every((d) => d.level === 0)).toBe(true);
  });

  it("freeze date renders level 1", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [],
      freezes: new Set(["2026-05-08"]),
      mediansByDate: new Map(),
    });
    const day = days.find((d) => d.date === "2026-05-08")!;
    expect(day.level).toBe(1);
  });

  it("completion renders level 2", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [{ date: "2026-05-08", elapsed_seconds: 300 }],
      freezes: new Set(),
      mediansByDate: new Map([["2026-05-08", 250]]),
    });
    const day = days.find((d) => d.date === "2026-05-08")!;
    expect(day.level).toBe(2); // 300 >= 250 (median)
  });

  it("completion faster than median renders level 3", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [{ date: "2026-05-08", elapsed_seconds: 200 }],
      freezes: new Set(),
      mediansByDate: new Map([["2026-05-08", 250]]),
    });
    const day = days.find((d) => d.date === "2026-05-08")!;
    expect(day.level).toBe(3);
  });

  it("missing median treats completion as level 2", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [{ date: "2026-05-08", elapsed_seconds: 200 }],
      freezes: new Set(),
      mediansByDate: new Map(),
    });
    const day = days.find((d) => d.date === "2026-05-08")!;
    expect(day.level).toBe(2);
  });

  it("completion takes precedence over freeze on same date", () => {
    const days = computeUserHeatmap({
      today: "2026-05-09",
      results: [{ date: "2026-05-08", elapsed_seconds: 100 }],
      freezes: new Set(["2026-05-08"]),
      mediansByDate: new Map([["2026-05-08", 250]]),
    });
    const day = days.find((d) => d.date === "2026-05-08")!;
    expect(day.level).toBe(3);
  });
});
