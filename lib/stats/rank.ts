/**
 * Today's leaderboard rank for a given user.
 *
 * Assumes `rows` is already sorted by `elapsed_seconds` ascending — which is
 * how `app/page.tsx` queries `daily_results` for the home page snapshot.
 */
export interface TodayRank {
  rank: number;
  total: number;
}

export function computeTodayRank(input: {
  rows: { user_id: string; elapsed_seconds: number }[];
  userId: string;
}): TodayRank | null {
  const { rows, userId } = input;
  const idx = rows.findIndex((r) => r.user_id === userId);
  if (idx === -1) return null;
  return { rank: idx + 1, total: rows.length };
}
