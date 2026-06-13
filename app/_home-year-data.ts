import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { computeAllotment, hasRecoverableStreak } from "@/lib/seal/freeze";
import { assembleYearSeries } from "@/lib/seal/year";
import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
import type { YearSeries } from "@/lib/seal/types";

export interface HomeYearData {
  series: YearSeries;
  streak: number;
  yearFilled: number;
  yearTotal: number;
  completedTodayElapsed: number | undefined;
  freezePrompt: {
    date: string;
    kanji: string;
    allotmentRemaining: number;
    credits: number;
  } | null;
}

/**
 * Per-user year-range queries shared by HomeHeroSection and HomeYearSection.
 * Deduped within a single request via React's cache(), keyed by the argument
 * tuple. Callers MUST pass the same `today` string (and `year`) by value
 * across both call sites in a request — derive once at the page level and
 * thread through. Inline `todayUTC()` calls at multiple sites are fine
 * because the function is pure-by-day, but verify before changing.
 */
export const fetchHomeYearData = cache(async (
  userId: string,
  today: string,
  year: number,
): Promise<HomeYearData> => {
  const sb = createServerClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: cal },
    { data: results },
    { data: freezes },
    { data: profile },
    { data: dailyMeta },
  ] = await Promise.all([
    sb
      .from("daily_seal_calendar")
      .select("date,kanji,romaji,meaning")
      .gte("date", yearStart).lte("date", yearEnd)
      .order("date", { ascending: true }),
    sb.from("daily_results").select("date,elapsed_seconds")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("streak_freezes").select("date")
      .eq("user_id", userId)
      .gte("date", yearStart).lte("date", yearEnd),
    sb.from("profiles").select("created_at,is_pro,city,freeze_credits").eq("id", userId).maybeSingle(),
    sb.from("daily_puzzles")
      .select("date, skin_id, skins(seal_kanji)")
      .gte("date", yearStart).lte("date", yearEnd),
  ]);

  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozenDates = new Set<string>(((freezes ?? []) as { date: string }[]).map((f) => f.date));
  type DailyMetaRow = { date: string; skin_id: string; skins: { seal_kanji: string } | null };
  const sealKanjiByDate = new Map<string, string>();
  for (const r of (dailyMeta ?? []) as unknown as DailyMetaRow[]) {
    sealKanjiByDate.set(r.date, r.skins?.seal_kanji ?? "完");
  }
  const signupDate = profile?.created_at
    ? new Date(profile.created_at).toISOString().slice(0, 10)
    : yearStart;
  const series = assembleYearSeries({
    today,
    calendar: fillCalendarYear(year, (cal ?? []) as CalendarEntry[]),
    completedByDate,
    frozenDates,
    signupDate,
    sealKanjiByDate,
  });
  const streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozenDates);
  const yearFilled = series.seals.filter(
    (s) => s.state === "filled" || s.state === "freeze",
  ).length;
  const yearTotal = series.seals.length;
  const completedTodayElapsed = completedByDate.get(today);

  let freezePrompt: HomeYearData["freezePrompt"] = null;
  if (profile) {
    const yest = new Date(today + "T00:00:00Z");
    yest.setUTCDate(yest.getUTCDate() - 1);
    const yestStr = yest.toISOString().slice(0, 10);
    const yestEntry = series.seals.find((s) => s.date === yestStr);
    if (
      yestEntry?.state === "empty" &&
      hasRecoverableStreak(series.seals, today)
    ) {
      let allotmentRemaining = 0;
      if (profile.is_pro) {
        const granted = `${yestStr.slice(0, 7)}-01`;
        const { count } = await sb
          .from("streak_freezes")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("granted_month", granted);
        const used = count ?? 0;
        const allotment = computeAllotment(profile.created_at, granted);
        allotmentRemaining = Math.max(0, allotment - used);
      }
      freezePrompt = {
        date: yestStr,
        kanji: yestEntry.kanji,
        allotmentRemaining,
        credits: profile.freeze_credits,
      };
    }
  }

  return {
    series,
    streak,
    yearFilled,
    yearTotal,
    completedTodayElapsed,
    freezePrompt,
  };
});
