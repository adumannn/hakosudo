// lib/seal/year.ts
import type { SealEntry, SealState, YearSeries } from "@/lib/seal/types";
import type { CalendarEntry } from "@/lib/seal/calendar";

export interface AssembleInput {
  today: string;
  calendar: CalendarEntry[];
  completedByDate: Map<string, number>; // date → elapsedSeconds
  frozenDates: Set<string>;
  signupDate: string; // 'YYYY-MM-DD' — first date the user existed
  sealKanjiByDate: Map<string, string>; // date → seal kanji from each day's skin
}

export function assembleYearSeries(input: AssembleInput): YearSeries {
  const { today, calendar, completedByDate, frozenDates, signupDate, sealKanjiByDate } = input;
  const seals: SealEntry[] = calendar.map((c) => {
    const state = stateFor(c.date, today, completedByDate, frozenDates, signupDate);
    const entry: SealEntry = {
      date: c.date,
      kanji: c.kanji,
      romaji: c.romaji,
      meaning: c.meaning,
      state,
      sealKanji: sealKanjiByDate.get(c.date) ?? "完",
    };
    if (state === "filled") {
      entry.elapsedSeconds = completedByDate.get(c.date)!;
    }
    return entry;
  });

  const todayIndex = seals.findIndex((s) => s.date === today);
  const year = parseInt(today.slice(0, 4), 10);
  return { year, todayIndex, seals };
}

function stateFor(
  date: string,
  today: string,
  completed: Map<string, number>,
  frozen: Set<string>,
  signupDate: string,
): SealState {
  if (date > today) return "future";
  if (date < signupDate) return "pre-signup";
  if (completed.has(date)) return "filled";
  if (frozen.has(date)) return "freeze";
  if (date === today) return "today";
  return "empty";
}
