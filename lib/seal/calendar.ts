// lib/seal/calendar.ts
import { KANJI_BANK, findReserved } from "@/lib/kanji-bank";
import type { KanjiEntry } from "@/lib/seal/types";

export interface CalendarEntry extends KanjiEntry {
  date: string;
}

/**
 * Deterministically assigns one kanji per date over a range. Reserved
 * dates (solstices/equinoxes/new-year) are honored first. Remaining dates
 * draw from KANJI_BANK with no repeats inside a 365-day window.
 *
 * Pure / no I/O. Same inputs → same outputs.
 */
export function assignKanjiForRange(
  startDate: string,
  days: number,
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  // 365-day rolling set of used kanji so consecutive years don't repeat
  const usedRolling: string[] = [];

  // Stable rotation: hash(date) → bank index, advance until unused
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const reserved = findReserved(date);
    let entry: KanjiEntry;
    if (reserved) {
      entry = reserved;
    } else {
      entry = pickFromBank(date, usedRolling);
    }
    out.push({ ...entry, date });

    // Maintain rolling window: drop entries older than 365 days back
    usedRolling.push(entry.kanji);
    if (usedRolling.length > 365) usedRolling.shift();
  }
  return out;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Gregorian leap-year rule: divisible by 4, except centuries unless divisible by 400. */
function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Returns one calendar entry per day for the given year, preferring rows
 * already in `dbRows` and falling back to the deterministic assignment from
 * `assignKanjiForRange` for any missing dates. Used so the year scroll always
 * renders 365/366 cells even if the seal-calendar table has gaps.
 */
export function fillCalendarYear(
  year: number,
  dbRows: CalendarEntry[],
): CalendarEntry[] {
  const total = isLeapYear(year) ? 366 : 365;
  const computed = assignKanjiForRange(`${year}-01-01`, total);
  const byDate = new Map<string, CalendarEntry>();
  for (const r of dbRows) byDate.set(r.date, r);
  return computed.map((c) => byDate.get(c.date) ?? c);
}

function pickFromBank(date: string, used: string[]): KanjiEntry {
  const seed = hashDate(date);
  const usedSet = new Set(used);
  // Linear probe from the seeded start so we always find an unused entry
  // (assumes bank.size > 365; enforced at runtime below).
  for (let i = 0; i < KANJI_BANK.length; i++) {
    const idx = (seed + i) % KANJI_BANK.length;
    const candidate = KANJI_BANK[idx];
    if (!usedSet.has(candidate.kanji)) return candidate;
  }
  // Bank too small. Surface this loudly so it gets fixed before launch.
  throw new Error(
    `kanji-bank exhausted: bank has ${KANJI_BANK.length} entries, all used in current 365-day window`,
  );
}

function hashDate(iso: string): number {
  // Simple FNV-ish 32-bit hash, deterministic across runtimes.
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
