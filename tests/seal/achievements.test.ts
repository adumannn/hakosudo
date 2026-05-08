import { describe, it, expect } from "vitest";
import { computeStatuses } from "@/lib/achievements";

const TODAY = "2026-05-09";

function dailyGame(date: string) {
  return {
    difficulty: "expert",
    is_complete: true,
    elapsed_seconds: 600,
    errors_made: 0,
    hints_used: 0,
    daily_date: date,
    created_at: `${date}T08:00:00Z`,
  };
}

describe("computeStatuses with unified streak", () => {
  it("counts a 7-day daily streak as earned", () => {
    const games = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(TODAY + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      return dailyGame(d.toISOString().slice(0, 10));
    });
    const statuses = computeStatuses(games, { today: TODAY, frozen: new Set() });
    const s7 = statuses.find((s) => s.key === "streak_7");
    expect(s7?.earned).toBe(true);
  });

  it("treats a freeze as part of the streak", () => {
    // 6 completions + 1 freeze = streak_7 earned
    const dates = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(TODAY + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    const games = dates.map(dailyGame);
    // Insert a gap that's covered by a freeze
    const frozen = new Set<string>();
    const gapDate = new Date(TODAY + "T00:00:00Z");
    gapDate.setUTCDate(gapDate.getUTCDate() - 6);
    frozen.add(gapDate.toISOString().slice(0, 10));
    // And one more completion further back to make 7 contiguous via the freeze
    const seventh = new Date(TODAY + "T00:00:00Z");
    seventh.setUTCDate(seventh.getUTCDate() - 7);
    games.push(dailyGame(seventh.toISOString().slice(0, 10)));

    const statuses = computeStatuses(games, { today: TODAY, frozen });
    const s7 = statuses.find((s) => s.key === "streak_7");
    expect(s7?.earned).toBe(true);
  });
});
