"use server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const HANDLE_RE = /^[a-z0-9_-]{2,20}$/;

export async function saveUsername(input: { username: string }) {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const normalized = input.username.trim().toLowerCase();
  if (!HANDLE_RE.test(normalized)) {
    return { ok: false as const, error: "format" as const };
  }

  const { error } = await sb
    .from("profiles")
    .update({ username: normalized })
    .eq("id", user.id);

  if (error) {
    // Postgres unique violation (23505) — surface as a friendly "taken" error.
    if (error.code === "23505") return { ok: false as const, error: "taken" as const };
    return { ok: false as const, error: "db" as const };
  }

  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  return { ok: true as const, username: normalized };
}
