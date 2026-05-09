import { computeUnifiedStreak } from "@/lib/seal/streak";

export type AchievementKey =
  | "streak_7"
  | "streak_30"
  | "streak_100"
  | "speed_easy"
  | "speed_hard"
  | "speed_expert"
  | "first_in"
  | "before_dawn"
  | "after_midnight"
  | "beat_floor"
  | "no_help"
  | "pure_run";

export type AchievementCategory = "streak" | "speed" | "special";

export interface AchievementDef {
  key: AchievementKey;
  glyph: string;
  name: string;
  desc: string;
  cond: string;
  category: AchievementCategory;
  hideUntilEarned: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "streak_7",
    glyph: "連",
    name: "Seven days, in a row",
    desc: "— solve seven daily puzzles without missing a day.",
    cond: "streak · 7 days",
    category: "streak",
    hideUntilEarned: false,
  },
  {
    key: "streak_30",
    glyph: "月",
    name: "A month, kept",
    desc: "— solve thirty daily puzzles without missing a day.",
    cond: "streak · 30 days",
    category: "streak",
    hideUntilEarned: false,
  },
  {
    key: "streak_100",
    glyph: "百",
    name: "A hundred days",
    desc: "— solve one hundred daily puzzles without missing a day.",
    cond: "streak · 100 days",
    category: "streak",
    hideUntilEarned: false,
  },
  {
    key: "speed_easy",
    glyph: "速",
    name: "Under three",
    desc: "— solve any Easy puzzle in under 3:00.",
    cond: "easy · sub-3:00",
    category: "speed",
    hideUntilEarned: false,
  },
  {
    key: "speed_hard",
    glyph: "鋭",
    name: "Sharp on Hard",
    desc: "— solve any Hard puzzle in under 10:00.",
    cond: "hard · sub-10:00",
    category: "speed",
    hideUntilEarned: false,
  },
  {
    key: "speed_expert",
    glyph: "神",
    name: "Divine on Expert",
    desc: "— solve any Expert puzzle in under 25:00.",
    cond: "expert · sub-25:00",
    category: "speed",
    hideUntilEarned: false,
  },
  {
    key: "first_in",
    glyph: "初",
    name: "First in",
    desc: "— be the first to submit on today's daily, in any city.",
    cond: "first to submit · today",
    category: "special",
    hideUntilEarned: false,
  },
  {
    key: "before_dawn",
    glyph: "暁",
    name: "Before dawn",
    desc: "— solve a daily before 06:00 local time.",
    cond: "solve · before 06:00",
    category: "special",
    hideUntilEarned: false,
  },
  {
    key: "after_midnight",
    glyph: "夜",
    name: "After midnight",
    desc: "— solve between 00:00 and 03:00 local.",
    cond: "solve · 00:00 — 03:00",
    category: "special",
    hideUntilEarned: true,
  },
  {
    key: "beat_floor",
    glyph: "越",
    name: "Beat the floor",
    desc: "— solve below the puzzle's minimum-time floor.",
    cond: "below puzzle minimum",
    category: "special",
    hideUntilEarned: true,
  },
  {
    key: "no_help",
    glyph: "無",
    name: "Without help",
    desc: "— solve any daily without using a hint.",
    cond: "solve · no hints",
    category: "special",
    hideUntilEarned: false,
  },
  {
    key: "pure_run",
    glyph: "純",
    name: "Pure run",
    desc: "— solve any daily with zero conflicts on the way.",
    cond: "solve · zero conflicts",
    category: "special",
    hideUntilEarned: false,
  },
];

export interface GameRow {
  difficulty: string;
  is_complete: boolean;
  elapsed_seconds: number;
  errors_made: number;
  hints_used: number;
  daily_date: string | null;
  created_at: string;
}

export interface AchievementStatus {
  key: AchievementKey;
  earned: boolean;
  earnedAt?: string;
  progress?: string;
}

function formatStampDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function computeStatuses(
  games: GameRow[],
  opts: { today: string; frozen: Set<string> } = {
    today: new Date().toISOString().slice(0, 10),
    frozen: new Set(),
  },
): AchievementStatus[] {
  const completed = games.filter((g) => g.is_complete);
  const dailyDates = new Set(
    completed.filter((g) => g.daily_date).map((g) => g.daily_date!),
  );
  const streak = computeUnifiedStreak(opts.today, dailyDates, opts.frozen);

  const firstByDifficulty = (
    diff: string,
    cap: number,
  ): GameRow | undefined =>
    completed
      .filter((g) => g.difficulty === diff && g.elapsed_seconds < cap)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  const firstWith = (pred: (g: GameRow) => boolean): GameRow | undefined =>
    completed
      .filter(pred)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  const earliestDailyOnDate = (days: number): GameRow | undefined => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
    cutoff.setUTCHours(0, 0, 0, 0);
    const eligible = Array.from(dailyDates).filter(
      (d) => new Date(d) >= cutoff,
    );
    if (eligible.length < days) return undefined;
    return completed
      .filter((g) => g.daily_date)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  };

  const made = (
    key: AchievementKey,
    earned: boolean,
    earnedAt?: string,
    progress?: string,
  ): AchievementStatus => ({ key, earned, earnedAt, progress });

  const speedEasy = firstByDifficulty("easy", 180);
  const speedHard = firstByDifficulty("hard", 600);
  const speedExpert = firstByDifficulty("expert", 1500);
  const noHelp = firstWith((g) => g.hints_used === 0 && !!g.daily_date);
  const pureRun = firstWith((g) => g.errors_made === 0 && !!g.daily_date);
  const beforeDawn = firstWith((g) => {
    const h = new Date(g.created_at).getUTCHours();
    return h < 6;
  });
  const afterMidnight = firstWith((g) => {
    const h = new Date(g.created_at).getUTCHours();
    return h >= 0 && h < 3;
  });

  const expertBest = completed
    .filter((g) => g.difficulty === "expert")
    .map((g) => g.elapsed_seconds)
    .sort((a, b) => a - b)[0];

  return [
    made(
      "streak_7",
      streak >= 7,
      streak >= 7 ? earliestDailyOnDate(7)?.created_at : undefined,
      `${streak} / 7 days`,
    ),
    made(
      "streak_30",
      streak >= 30,
      streak >= 30 ? earliestDailyOnDate(30)?.created_at : undefined,
      `${streak} / 30 days`,
    ),
    made(
      "streak_100",
      streak >= 100,
      streak >= 100 ? earliestDailyOnDate(100)?.created_at : undefined,
      `${streak} / 100 days`,
    ),
    made("speed_easy", !!speedEasy, speedEasy?.created_at),
    made("speed_hard", !!speedHard, speedHard?.created_at),
    made(
      "speed_expert",
      !!speedExpert,
      speedExpert?.created_at,
      expertBest ? `— ${formatTimeMS(expertBest)} best` : undefined,
    ),
    made("first_in", false, undefined, "—"),
    made("before_dawn", !!beforeDawn, beforeDawn?.created_at),
    made("after_midnight", !!afterMidnight, afterMidnight?.created_at),
    made("beat_floor", false, undefined),
    made("no_help", !!noHelp, noHelp?.created_at),
    made("pure_run", !!pureRun, pureRun?.created_at),
  ].map((s) => ({
    ...s,
    earnedAt: s.earnedAt ? formatStampDate(s.earnedAt) : undefined,
  }));
}

function formatTimeMS(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
