// tests/seal/year.test.ts
import { describe, it, expect } from "vitest";
import { assembleYearSeries } from "@/lib/seal/year";

const CAL = [
  { date: "2026-05-08", kanji: "土", romaji: "tsuchi", meaning: "earth", themes: [] },
  { date: "2026-05-09", kanji: "月", romaji: "tsuki",  meaning: "moon",  themes: [] },
  { date: "2026-05-10", kanji: "火", romaji: "hi",     meaning: "fire",  themes: [] },
];

describe("assembleYearSeries", () => {
  it("marks today, future, and a completed past day", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map([["2026-05-08", 312]]),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
      sealKanjiByDate: new Map(),
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("filled");
    expect(byDate["2026-05-08"].elapsedSeconds).toBe(312);
    expect(byDate["2026-05-09"].state).toBe("today");
    expect(byDate["2026-05-10"].state).toBe("future");
  });

  it("marks empty when missed and no freeze", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
      sealKanjiByDate: new Map(),
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("empty");
  });

  it("marks freeze when frozen and not completed", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(["2026-05-08"]),
      signupDate: "2026-04-01",
      sealKanjiByDate: new Map(),
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("freeze");
  });

  it("marks pre-signup for dates before the user's signup", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-05-09",
      sealKanjiByDate: new Map(),
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-08"].state).toBe("pre-signup");
  });

  it("marks today as filled once it's been completed", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map([["2026-05-09", 712]]),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
      sealKanjiByDate: new Map(),
    });
    const byDate = Object.fromEntries(series.seals.map((s) => [s.date, s]));
    expect(byDate["2026-05-09"].state).toBe("filled");
    expect(byDate["2026-05-09"].elapsedSeconds).toBe(712);
  });

  it("populates todayIndex correctly", () => {
    const series = assembleYearSeries({
      today: "2026-05-09",
      calendar: CAL,
      completedByDate: new Map(),
      frozenDates: new Set(),
      signupDate: "2026-04-01",
      sealKanjiByDate: new Map(),
    });
    expect(series.todayIndex).toBe(1); // 2026-05-09 is index 1 in CAL
    expect(series.year).toBe(2026);
  });
});
