// app/year/page.tsx
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { YearScroll } from "@/components/year-scroll/YearScroll";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC } from "@/lib/utils";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { assembleYearSeries } from "@/lib/seal/year";
import { dateLine } from "@/lib/kanji";
import type { YearSeries } from "@/lib/seal/types";

export const dynamic = "force-dynamic";

export default async function YearPage() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  const initial = user?.email?.[0] ?? "·";
  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);

  let series: YearSeries | null = null;
  let streak = 0;
  let filled = 0;
  let frozen = 0;

  if (user) {
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
          .eq("user_id", user.id)
          .gte("date", yearStart).lte("date", yearEnd),
        sb.from("streak_freezes").select("date")
          .eq("user_id", user.id)
          .gte("date", yearStart).lte("date", yearEnd),
        sb.from("profiles").select("created_at").eq("id", user.id).maybeSingle(),
        sb
          .from("daily_puzzles")
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
    series = assembleYearSeries({
      today,
      calendar: (cal ?? []) as any[],
      completedByDate,
      frozenDates,
      signupDate,
      sealKanjiByDate,
    });
    streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozenDates);
    filled = series.seals.filter((s) => s.state === "filled").length;
    frozen = series.seals.filter((s) => s.state === "freeze").length;
  }

  const total = series?.seals.length ?? 365;
  const stamped = filled + frozen;
  const percent = total > 0 ? Math.round((stamped / total) * 100) : 0;
  const yearKanjiDigits = String(year).split("").map((d) => "〇一二三四五六七八九"[parseInt(d, 10)]).join("");

  return (
    <>
      <Masthead active="today" initial={initial} email={user?.email ?? null} />

      <main className="px-6 lg:px-16 py-10 lg:py-14 max-w-[1480px] mx-auto">
        <div className="flex items-baseline justify-between">
          <Link
            href="/"
            className="mono text-[11px] tracking-[0.22em] uppercase text-moss hover:text-vermillion"
          >
            ← back to today
          </Link>
          <div className="eyebrow red">{dateLine()}</div>
        </div>

        <header className="mt-8 lg:mt-12 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-8 lg:gap-12 items-end border-b border-sumi pb-8">
          <div className="hidden lg:flex flex-col items-center">
            <div className="tategaki mincho text-sumi text-[44px] leading-none">{yearKanjiDigits}</div>
            <div className="mono text-[10px] tracking-[0.22em] text-moss uppercase mt-3">{year}</div>
          </div>

          <div>
            <div className="eyebrow">the year scroll</div>
            <h1 className="kdate-jp text-[56px] lg:text-[80px] leading-[0.95] mt-2">
              年 — {year}
            </h1>
            <p className="ital text-moss text-[18px] mt-3 max-w-[44ch]">
              every day is a single carved character. the year fills in beneath your hand, one stamp at a time.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
            <div>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">stamped</dt>
              <dd className="kdate-jp text-[36px] tnum leading-none mt-1">
                {stamped}
                <span className="text-moss text-[16px] font-normal"> / {total}</span>
              </dd>
            </div>
            <div>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">streak</dt>
              <dd className="kdate-jp text-[36px] tnum leading-none mt-1 text-vermillion">
                {streak}<span className="text-[16px]">d</span>
              </dd>
            </div>
            <div>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">filled</dt>
              <dd className="kdate-jp text-[36px] tnum leading-none mt-1">{percent}<span className="text-[16px]">%</span></dd>
            </div>
          </dl>
        </header>

        {series ? (
          <section className="mt-10 lg:mt-14 relative">
            <div
              aria-hidden
              className="watermark-kanji"
              style={{ fontSize: "320px", right: "-40px", top: "-60px" }}
            >
              年
            </div>
            <YearScroll series={series} cellPx={40} gapPx={5} sealSize="md" showWeekdayRail />
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 mono text-[10px] tracking-[0.22em] uppercase text-moss">
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border border-sumi/[0.32] bg-sumi/[0.03]" />
                stamped
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-[1.5px] border-vermillion/70" />
                today
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border border-dashed border-sumi/[0.16]" />
                missed
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border border-dashed border-vermillion/40 bg-sumi/[0.03]" />
                frozen
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border border-sumi/[0.07]" />
                future
              </span>
            </div>
          </section>
        ) : (
          <section className="mt-14 border-t border-b border-sumi py-16 text-center">
            <p className="ital text-moss text-[20px]">
              sign in to see your year scroll.
            </p>
            <Link
              href="/auth/signin"
              className="inline-block mt-6 bg-sumi text-bone px-7 py-3.5 mono text-[12px] tracking-[0.18em] uppercase hover:bg-sumi/95"
            >
              sign in
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
