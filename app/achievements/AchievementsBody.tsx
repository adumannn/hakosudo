import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { AchievementsLedger } from "@/components/profile/AchievementsLedger";
import { computeStatuses, type GameRow } from "@/lib/achievements";

export async function AchievementsBody({ userId }: { userId: string }) {
  const sb = createServerClient();
  const today = todayUTC();
  const recentWindowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 730);
    return d.toISOString().slice(0, 10);
  })();

  const [{ data: games }, { data: streakFreezes }] = await Promise.all([
    sb
      .from("games")
      .select("difficulty,is_complete,elapsed_seconds,errors_made,hints_used,daily_date,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("streak_freezes")
      .select("date")
      .eq("user_id", userId)
      .gte("date", recentWindowStart)
      .lte("date", today),
  ]);

  const all = (games ?? []) as GameRow[];
  const frozenDates = new Set<string>(
    ((streakFreezes ?? []) as { date: string }[]).map((f) => f.date),
  );
  const statuses = computeStatuses(all, { today, frozen: frozenDates });
  const earnedCount = statuses.filter((s) => s.earned).length;

  return (
    <>
      <div className="mono text-[10.5px] tracking-[0.18em] uppercase text-moss text-right leading-relaxed mt-6 mb-6">
        <strong className="mincho text-vermillion font-semibold text-[18px]">{earnedCount}</strong>
        <span className="text-moss"> / 12 earned</span>
      </div>
      <div className="mt-9">
        <AchievementsLedger statuses={statuses} />
      </div>
    </>
  );
}
