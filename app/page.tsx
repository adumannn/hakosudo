// app/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { SkinChip } from "@/components/skins/SkinChip";
import { CityPicker } from "@/components/profile/CityPicker";
import { Landing } from "@/components/landing/Landing";
import { createServerClient } from "@/lib/supabase/server";
import { todayUTC, formatTime } from "@/lib/utils";
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
import { computeTodayRank } from "@/lib/stats/rank";
import { HomeHeroSection } from "./HomeHeroSection";
import { HomeYearSection } from "./HomeYearSection";
import { HomeHeroSkeleton } from "@/components/skeletons/HomeHeroSkeleton";
import { HomeYearSkeleton } from "@/components/skeletons/HomeYearSkeleton";

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
  const user = viewer.userId ? { id: viewer.userId, email: viewer.email } : null;

  // Resolve skin and (when signed in) prefetch profiles.city in parallel.
  // The city read is only needed on the signed-in branch; signed-out callers
  // skip the extra DB round-trip entirely.
  const sb = createServerClient();
  const [skin, profileForCity] = await Promise.all([
    resolveActiveSkinServer({ surface: "home", viewer }),
    user
      ? sb
          .from("profiles")
          .select("city")
          .eq("id", user.id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

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

  // signed-in path
  const initial = user.email?.[0] ?? "·";

  // profileCity was prefetched alongside skin resolution above; reuse it
  // for the City picker which renders synchronously above the Suspense
  // boundary. fetchHomeYearData also fetches this row, but inside the
  // Suspense child — we need it earlier here.
  const profileCity: string | null = profileForCity?.city ?? null;

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

  const preview = snapshotRaw.rows.slice(0, 3).map((r, i) => ({
    rank: (i + 1).toString().padStart(2, "0"),
    name: r.username,
    time: formatTime(r.elapsed_seconds),
    first: i === 0,
  }));

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
        <Suspense fallback={<HomeHeroSkeleton />}>
          <HomeHeroSection
            userId={user.id}
            today={today}
            year={year}
            todaySeal={todaySeal}
            todayRank={todayRank}
          />
        </Suspense>

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
        <Suspense fallback={<HomeYearSkeleton />}>
          <HomeYearSection userId={user.id} today={today} year={year} />
        </Suspense>

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
