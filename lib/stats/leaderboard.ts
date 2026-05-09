export interface ResultRow {
  user_id: string;
  username: string;
  elapsed_seconds: number;
  city: string | null;
  created_at: string;
}

export interface DailySnapshot {
  seq: number | null;
  firstSolve: { username: string; city: string | null; elapsedSeconds: number } | null;
  median: number | null;
  solvingNow: number;
  totalSubmitted: number;
}

export function computeDailySnapshot(input: {
  seq: number | null;
  results: ResultRow[];
  activeGamesCount: number;
}): DailySnapshot {
  const { seq, results, activeGamesCount } = input;
  if (results.length === 0) {
    return {
      seq,
      firstSolve: null,
      median: null,
      solvingNow: activeGamesCount,
      totalSubmitted: 0,
    };
  }

  const sortedByTime = [...results].sort((a, b) => {
    if (a.elapsed_seconds !== b.elapsed_seconds) {
      return a.elapsed_seconds - b.elapsed_seconds;
    }
    return a.created_at.localeCompare(b.created_at);
  });
  const first = sortedByTime[0];

  const times = results.map((r) => r.elapsed_seconds).sort((a, b) => a - b);
  const mid = times.length / 2;
  const median = Number.isInteger(mid)
    ? Math.round((times[mid - 1] + times[mid]) / 2)
    : times[Math.floor(mid)];

  return {
    seq,
    firstSolve: {
      username: first.username,
      city: first.city,
      elapsedSeconds: first.elapsed_seconds,
    },
    median,
    solvingNow: activeGamesCount,
    totalSubmitted: results.length,
  };
}

export function computeCityCounts(input: {
  rows: { city: string | null }[];
  userCity: string | null;
}): { city: string; count: number }[] {
  const { rows, userCity } = input;
  const userKey = userCity ? userCity.trim().toLowerCase() : null;

  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.city) continue;
    const key = r.city.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([city, count]) => ({ city, count }));

  if (userKey && !counts.has(userKey)) {
    sorted.push({ city: userKey, count: 0 });
  }
  return sorted;
}
