import { describe, it, expect } from "vitest";
import {
  chooseFreezeSource,
  hasRecoverableStreak,
} from "@/lib/seal/freeze";

describe("chooseFreezeSource", () => {
  it("returns 'allotment' for Pro with remaining monthly allotment", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 0, 2)).toBe("allotment");
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 1, 2)).toBe("allotment");
  });

  it("returns 'credit' for Pro with exhausted allotment but credits", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 1 }, 2, 2)).toBe("credit");
  });

  it("returns 'credit' for non-Pro with credits", () => {
    expect(chooseFreezeSource({ is_pro: false, freeze_credits: 1 }, 0, 0)).toBe("credit");
  });

  it("returns 'none' for Pro with exhausted allotment and no credits", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 0 }, 2, 2)).toBe("none");
  });

  it("returns 'none' for non-Pro with no credits", () => {
    expect(chooseFreezeSource({ is_pro: false, freeze_credits: 0 }, 0, 0)).toBe("none");
  });

  it("prefers allotment over credits when both exist (don't waste the free thing)", () => {
    expect(chooseFreezeSource({ is_pro: true, freeze_credits: 5 }, 1, 2)).toBe("allotment");
  });
});

describe("hasRecoverableStreak", () => {
  const today = "2026-05-11";

  it("returns false when the user has no completions", () => {
    expect(hasRecoverableStreak([], today)).toBe(false);
  });

  it("returns true when there is a completion within the last 7 days", () => {
    const seals = [
      { date: "2026-05-08", state: "filled" },
      { date: "2026-05-10", state: "empty" },
    ];
    expect(hasRecoverableStreak(seals, today)).toBe(true);
  });

  it("returns false when the only completion is today", () => {
    const seals = [{ date: today, state: "filled" }];
    expect(hasRecoverableStreak(seals, today)).toBe(false);
  });

  it("returns false when the most recent completion is older than 7 days", () => {
    const seals = [{ date: "2026-05-01", state: "filled" }];
    expect(hasRecoverableStreak(seals, today)).toBe(false);
  });

  it("counts 'freeze' states as completions", () => {
    const seals = [{ date: "2026-05-09", state: "freeze" }];
    expect(hasRecoverableStreak(seals, today)).toBe(true);
  });
});
