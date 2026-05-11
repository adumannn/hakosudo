"use server";
import { getCurrentUser } from "@/lib/auth/identity";
import { revalidatePath } from "next/cache";

const HANDLE_RE = /^[a-z0-9_-]{2,20}$/;

export async function saveUsername(input: { username: string }) {
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const normalized = input.username.trim().toLowerCase();
  if (!HANDLE_RE.test(normalized)) {
    return { ok: false as const, error: "format" as const };
  }

  // Upsert (not update) so the profile is guaranteed to exist after this
  // call. The signup trigger normally creates the row, but a missed trigger
  // or manual deletion would otherwise turn this into a silent no-op.
  // .select().single() forces an error response when nothing is written.
  const { error } = await sb
    .from("profiles")
    .upsert({ id: user.id, username: normalized }, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    // Postgres unique violation (23505) — surface as a friendly "taken" error.
    if (error.code === "23505") return { ok: false as const, error: "taken" as const };
    return { ok: false as const, error: "db" as const };
  }

  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  return { ok: true as const, username: normalized };
}
