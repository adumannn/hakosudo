// app/page.tsx
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { SkinChip } from "@/components/skins/SkinChip";
import { TodayCard } from "@/components/year-scroll/TodayCard";
import { YearScroll } from "@/components/year-scroll/YearScroll";
import { CityPicker } from "@/components/profile/CityPicker";
import { Landing } from "@/components/landing/Landing";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC, formatTime } from "@/lib/utils";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { computeAllotment } from "@/lib/seal/freeze";
import { assembleYearSeries } from "@/lib/seal/year";
import { fillCalendarYear, type CalendarEntry } from "@/lib/seal/calendar";
import { dateLine, weekdayJp } from "@/lib/kanji";
import { computeDailySnapshot, computeCityCounts } from "@/lib/stats/leaderboard";
import { getCity } from "@/lib/geo";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { getViewer } from "@/lib/skins/viewer";
import {
  getTodaySealBundle,
  getDailySeq,
  getPublicDailySnapshot,
} from "@/lib/home-data";
import type { YearSeries } from "@/lib/seal/types";
import { computeTodayRank } from "@/lib/stats/rank";
import { YouTodayPanel } from "@/components/stats/YouTodayPanel";

export const dynamic = "force-dynamic";

const MONTHS_LOWER = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function landingDateLabels(d: Date = new Date()): { jp: string; en: string } {
  const jp = weekdayJp(d);
  const weekdaysEn = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ];
  const en = `${weekdaysEn[d.getDay()]} · ${d.getDate()} ${MONTHS_LOWER[d.getMonth()].slice(0, 3)}`;
  return { jp, en };
}

export default async function Home() {
  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);

  // Fan out every viewer-independent fetch in parallel with the viewer.
  // Viewer (request-deduped) covers both the skin resolution and identity
  // check — no extra getSession()/getUser() round-trip.
  const [viewer, sealBundle, snapshotRaw, dailySeq] = await Promise.all([
    getViewer(),
    getTodaySealBundle(today),
    getPublicDailySnapshot(today),
    getDailySeq(today),
  ]);
  const skin = await resolveActiveSkinServer({ surface: "home", viewer });
  const user = viewer.userId ? { id: viewer.userId, email: viewer.email } : null;
  const initial = user?.email?.[0] ?? "·";

  const todaySeal = sealBundle.cal
    ? {
        date: sealBundle.cal.date,
        kanji: sealBundle.cal.kanji,
        romaji: sealBundle.cal.romaji,
        meaning: sealBundle.cal.meaning,
        senseiLine: sealBundle.line,
        sealKanji: sealBundle.sealKanji,
      }
    : null;

  const snapshot = computeDailySnapshot({
    seq: dailySeq,
    results: snapshotRaw.rows,
    activeGamesCount: snapshotRaw.activeGames,
  });

  // ─── Signed-out: marketing landing ───
  // Return early — none of the year/streak queries below are needed.
  if (!user) {
    const labels = landingDateLabels();
    const cityCounts = computeCityCounts({
      rows: snapshotRaw.rows.map((r) => ({ city: r.city })),
      userCity: null,
    });
    const topCity = cityCounts[0] ?? null;
    return (
      <Landing
        dateLabelJp={labels.jp}
        dateLabelEn={labels.en}
        dailySeq={snapshot.seq}
        solvingNow={snapshot.solvingNow}
        firstSolveTime={
          snapshot.firstSolve
            ? formatTime(snapshot.firstSolve.elapsedSeconds)
            : null
        }
        cityCount={topCity}
      />
    );
  }

  const sb = createServerClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const preview = snapshotRaw.rows.slice(0, 3).map((r, i) => ({
    rank: (i + 1).toString().padStart(2, "0"),
    name: r.username,
    time: formatTime(r.elapsed_seconds),
    first: i === 0,
  }));

  // Year series + streak (signed-in only — guarded by the early return above).
  let freezePrompt: { date: string; kanji: string; remaining: number } | null = null;
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
    sb.from("profiles").select("created_at,is_pro,city").eq("id", user.id).maybeSingle(),
    sb
      .from("daily_puzzles")
      .select("date, skin_id, skins(seal_kanji)")
      .gte("date", yearStart).lte("date", yearEnd),
  ]);
  const profileCity: string | null = profile?.city ?? null;
  const completedByDate = new Map<string, number>();
  for (const r of (results ?? []) as { date: string; elapsed_seconds: number }[]) {
    completedByDate.set(r.date, r.elapsed_seconds);
  }
  const frozen = new Set<string>(((freezes ?? []) as { date: string }[]).map((f) => f.date));
  type DailyMetaRow = { date: string; skin_id: string; skins: { seal_kanji: string } | null };
  const sealKanjiByDate = new Map<string, string>();
  for (const r of (dailyMeta ?? []) as unknown as DailyMetaRow[]) {
    sealKanjiByDate.set(r.date, r.skins?.seal_kanji ?? "完");
  }
  const signupDate = profile?.created_at
    ? new Date(profile.created_at).toISOString().slice(0, 10)
    : yearStart;
  const series: YearSeries = assembleYearSeries({
    today,
    calendar: fillCalendarYear(year, (cal ?? []) as CalendarEntry[]),
    completedByDate,
    frozenDates: frozen,
    signupDate,
    sealKanjiByDate,
  });
  const streak = computeUnifiedStreak(today, new Set(completedByDate.keys()), frozen);
  const completedTodayElapsed = completedByDate.get(today);

  if (profile?.is_pro) {
    const yest = new Date(today + "T00:00:00Z");
    yest.setUTCDate(yest.getUTCDate() - 1);
    const yestStr = yest.toISOString().slice(0, 10);
    const yestEntry = series.seals.find((s) => s.date === yestStr);
    if (yestEntry?.state === "empty") {
      const granted = `${yestStr.slice(0, 7)}-01`;
      const { count } = await sb
        .from("streak_freezes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("granted_month", granted);
      const used = count ?? 0;
      const allotment = computeAllotment(profile.created_at, granted);
      const remaining = Math.max(0, allotment - used);
      if (remaining > 0) freezePrompt = { date: yestStr, kanji: yestEntry.kanji, remaining };
    }
  }

  // Popular city list for the home banner picker (signed-in only).
  let popularCities: { city: string; count: number }[] = [];
  let citySuggestion: string | null = null;
  if (profileCity === null) {
    popularCities = computeCityCounts({
      rows: snapshotRaw.rows.map((r) => ({ city: r.city })),
      userCity: null,
    });
    citySuggestion = getCity();
  }

  const todayRank = computeTodayRank({
    rows: snapshotRaw.rows.map((r) => ({
      user_id: r.user_id,
      elapsed_seconds: r.elapsed_seconds,
    })),
    userId: user.id,
  });
  const yearFilled = series.seals.filter(
    (s) => s.state === "filled" || s.state === "freeze",
  ).length;
  const yearTotal = series.seals.length;

  return (
    <>
      <Masthead
        active="today"
        initial={initial}
        email={user.email ?? null}
        rightChip={<SkinChip />}
      />

      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow red">{dateLine()}</div>
        <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-1">
          vol · <strong className="text-vermillion font-medium">{skin.kanjiLabel}</strong>{" "}
          {skin.slug.replace(/-/g, " ")} · in print
        </div>

        {profileCity === null && (
          <div className="mt-6 max-w-[640px]">
            <CityPicker
              variant="banner"
              current={null}
              suggestion={citySuggestion}
              popular={popularCities}
            />
          </div>
        )}

        {/* ── Band 1 · Hero ───────────────────────────────────────── */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12 items-start">
          <TodayCard
            today={todaySeal}
            completedElapsed={completedTodayElapsed}
            freezePrompt={freezePrompt}
            tategakiDay={weekdayJp()}
          />
          <div className="mt-8 lg:mt-0">
            <YouTodayPanel
              streak={streak}
              yearFilled={yearFilled}
              yearTotal={yearTotal}
              todayElapsed={completedTodayElapsed ?? null}
              todayRank={todayRank}
            />
          </div>
        </section>

        {/* ── Band 1.5 · Casual ──────────────────────────────────── */}
        <section className="mt-12 max-w-[640px] border-t border-sumi/20 pt-6">
          <div className="flex items-baseline justify-between mb-3.5">
            <div className="eyebrow">§ casual</div>
            <Link href="/play" className="ital text-vermillion text-[14px] hover:underline">
              see all →
            </Link>
          </div>
          <p className="ital text-moss text-[14px] mb-4">
            — pick a floor. Your streak rests with the daily.
          </p>
          <div className="grid grid-cols-4 border-[1.5px] border-sumi">
            {[
              { k: "易", href: "/play/easy" },
              { k: "中", href: "/play/medium" },
              { k: "難", href: "/play/hard" },
              { k: "極", href: "/play/expert", accent: true },
            ].map((t, i, arr) => (
              <Link
                key={t.k}
                href={t.href}
                className={
                  "p-4 flex items-center justify-center mincho font-semibold text-[36px] -tracking-[0.02em] transition-opacity hover:opacity-80 " +
                  (i < arr.length - 1 ? "border-r-[1.5px] border-sumi " : "") +
                  (t.accent ? "bg-vermillion text-bone" : "bg-bone text-sumi")
                }
              >
                {t.k}
              </Link>
            ))}
          </div>
        </section>

        {/* ── Band 2 · Year ───────────────────────────────────────── */}
        <section className="mt-12">
          <div className="flex justify-between items-baseline mb-3">
            <div className="eyebrow">your year</div>
            <div className="mono text-[11px] tracking-[0.14em] text-moss">
              {yearFilled}
              {" / "}
              {yearTotal}
            </div>
          </div>
          <YearScroll series={series} />
        </section>

        {/* ── Band 3 · Bottom strip ───────────────────────────────── */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <div>
            <p className="mono text-[10px] tracking-[0.22em] uppercase text-moss">
              global pace · today
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.firstSolve ? formatTime(snapshot.firstSolve.elapsedSeconds) : "—"}
                </div>
                <div className="txt-small">
                  {snapshot.firstSolve
                    ? `first solve · ${snapshot.firstSolve.username}${
                        snapshot.firstSolve.city ? ", " + snapshot.firstSolve.city : ""
                      }`
                    : "awaiting first solve"}
                </div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.median != null ? formatTime(snapshot.median) : "—"}
                </div>
                <div className="txt-small">global median</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">
                  {snapshot.solvingNow.toLocaleString()}
                </div>
                <div className="txt-small">solving now</div>
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            <div className="flex justify-between items-baseline mb-3.5">
              <div className="eyebrow">ledger · today</div>
              <Link href="/leaderboard" className="ital text-vermillion text-[14px] hover:underline">
                see all →
              </Link>
            </div>
            {preview.length === 0 ? (
              <div className="border-t-2 border-sumi">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="grid grid-cols-[28px_1fr_auto] gap-3.5 py-2.5 border-b border-sumi/12"
                  >
                    <div className="kdate-jp text-[13px] text-moss/40">
                      {n.toString().padStart(2, "0")}
                    </div>
                    <div className="text-[14px] text-moss/40">—</div>
                    <div className="mincho text-[15px] font-semibold tnum text-moss/40">—</div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {preview.map((row) => (
                  <div
                    key={row.rank}
                    className="grid grid-cols-[28px_1fr_auto] gap-3.5 py-2.5 border-b border-sumi/12"
                  >
                    <div className={"kdate-jp text-[13px] " + (row.first ? "text-vermillion" : "text-moss")}>
                      {row.rank}
                    </div>
                    <div className="text-[14px]">{row.name}</div>
                    <div className="mincho text-[15px] font-semibold tnum">{row.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-sumi/15 mt-16 px-6 lg:px-12 py-8 max-w-[1480px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-6 mono text-[10px] tracking-[0.2em] uppercase text-moss">
        <div>hako.app</div>
        <div>v1.0 · 8 may 2026</div>
      </div>
    </footer>
  );
}
