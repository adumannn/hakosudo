import { createServerClient } from "@/lib/supabase/server";

export async function checkAndIncrement(
  userId: string,
  isPro: boolean
): Promise<{ ok: boolean; remaining: number }> {
  const sb = createServerClient();
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  const cur = data?.count ?? 0;
  if (!isPro && cur >= 20) return { ok: false, remaining: 0 };
  await sb
    .from("ai_usage")
    .upsert({ user_id: userId, day, count: cur + 1 }, { onConflict: "user_id,day" });
  return { ok: true, remaining: isPro ? Infinity : 20 - cur - 1 };
}
