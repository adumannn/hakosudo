"use server";
import { getCurrentUser } from "@/lib/auth/identity";

export async function syncGuestGame(snapshot: {
  givens: string;
  current: string;
  notes: Record<string, number[]>;
  difficulty: string;
  puzzleId?: string;
  dailyDate?: string;
  elapsed: number;
  errors: number;
  hints: number;
  complete: boolean;
}) {
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const };

  const { error } = await sb.from("games").upsert(
    {
      user_id: user.id,
      puzzle_id: snapshot.puzzleId ?? null,
      daily_date: snapshot.dailyDate ?? null,
      givens: snapshot.givens,
      current_state: snapshot.current,
      notes: snapshot.notes,
      difficulty: snapshot.difficulty,
      elapsed_seconds: snapshot.elapsed,
      errors_made: snapshot.errors,
      hints_used: snapshot.hints,
      is_complete: snapshot.complete,
      updated_at: new Date().toISOString(),
    },
    { onConflict: snapshot.dailyDate ? "user_id,daily_date" : "user_id,puzzle_id" }
  );
  return { ok: !error };
}
