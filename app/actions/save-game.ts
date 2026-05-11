"use server";
import { getCurrentUser } from "@/lib/auth/identity";

export async function saveGame(input: {
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
  if (!user) return { ok: false as const, reason: "anon" as const };

  const { error } = await sb.from("games").upsert(
    {
      user_id: user.id,
      puzzle_id: input.puzzleId ?? null,
      daily_date: input.dailyDate ?? null,
      givens: input.givens,
      current_state: input.current,
      notes: input.notes,
      difficulty: input.difficulty,
      elapsed_seconds: input.elapsed,
      errors_made: input.errors,
      hints_used: input.hints,
      is_complete: input.complete,
      updated_at: new Date().toISOString(),
    },
    { onConflict: input.dailyDate ? "user_id,daily_date" : "user_id,puzzle_id" }
  );
  return { ok: !error };
}
