// app/api/seal/year/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import { assembleYearSeries } from "@/lib/seal/year";
import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
import { todayUTC } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, sb } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: calendar },
    { data: results },
    { data: freezes },
    { data: profile },
    { data: dailyMeta },
  ] = await Promise.all([
      sb
        .from("daily_seal_calendar")
        .select("date,kanji,romaji,meaning")
        .gte("date", yearStart)
        .lte("date", yearEnd)
        .order("date", { ascending: true }),
      sb
        .from("daily_results")
        .select("date,elapsed_seconds")
        .eq("user_id", userId)
        .gte("date", yearStart)
        .lte("date", yearEnd),
      sb
        .from("streak_freezes")
        .select("date")
        .eq("user_id", userId)
        .gte("date", yearStart)
        .lte("date", yearEnd),
      sb.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
      sb
        .from("daily_puzzles")
        .select("date, skin_id, skins(seal_kanji)")
        .gte("date", yearStart)
        .lte("date", yearEnd),
    ]);

  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozenDates = new Set<string>(
    ((freezes ?? []) as { date: string }[]).map((f) => f.date),
  );
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
    calendar: fillCalendarYear(year, (calendar ?? []) as CalendarEntry[]),
    completedByDate,
    frozenDates,
    signupDate,
    sealKanjiByDate,
  });

  return NextResponse.json(series);
}
