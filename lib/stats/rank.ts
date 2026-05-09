/**
 * Today's leaderboard rank for a given user — competition-rank semantics:
 * ties share the same rank. Independent of the input row order.
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
  const me = rows.find((r) => r.user_id === userId);
  if (!me) return null;
  const fasterCount = rows.filter((r) => r.elapsed_seconds < me.elapsed_seconds).length;
  return { rank: fasterCount + 1, total: rows.length };
}
