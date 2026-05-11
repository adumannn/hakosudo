"use server";
import { getCurrentUser } from "@/lib/auth/identity";
import { revalidatePath } from "next/cache";

export async function saveCity(input: { city: string }) {
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false, error: "auth" as const };

  const normalized = input.city.trim().toLowerCase();
  const value = normalized.length > 0 ? normalized : null;

  const { error } = await sb
    .from("profiles")
    .update({ city: value })
    .eq("id", user.id);

  if (error) return { ok: false, error: "db" as const };

  // Refresh anything that reads profile.city.
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  return { ok: true, city: value };
}
