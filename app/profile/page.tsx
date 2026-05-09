import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { formatTime, todayUTC } from "@/lib/utils";
import { Masthead } from "@/components/Masthead";
import { Heatmap } from "@/components/stats/Heatmap";
import { UsernamePicker } from "@/components/profile/UsernamePicker";
import { computeStatuses, ACHIEVEMENTS, type GameRow } from "@/lib/achievements";
import { computeUnifiedStreak } from "@/lib/seal/streak";
import { computeUserHeatmap } from "@/lib/stats/heatmap";

export const dynamic = "force-dynamic";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const STAMP_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function formatSince(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

function streakStartDate(
  today: string,
  completed: Set<string>,
  frozen: Set<string>,
): string | null {
  const present = (d: string) => completed.has(d) || frozen.has(d);
  let cursor = today;
  if (!present(cursor)) {
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  if (!present(cursor)) return null;
  let last = cursor;
  while (present(cursor)) {
    last = cursor;
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return last;
}

export default async function Profile() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  const initial = user.email?.[0] ?? "·";
  const emailHandle = user.email?.split("@")[0] ?? "duman";

  const today = todayUTC();
  const windowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 181);
    return d.toISOString().slice(0, 10);
  })();
  const recentWindowStart = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 730);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: profile },
    { data: games },
    { data: dailyResults },
    { data: streakFreezes },
    { data: heatmapResults },
    { data: heatmapMedians },
  ] = await Promise.all([
    sb.from("profiles").select("created_at,city,username").eq("id", user.id).maybeSingle(),
    sb
      .from("games")
      .select(
        "difficulty,is_complete,elapsed_seconds,errors_made,hints_used,daily_date,created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("daily_results")
      .select("date")
      .eq("user_id", user.id)
      .gte("date", recentWindowStart)
      .lte("date", today),
    sb
      .from("streak_freezes")
      .select("date")
      .eq("user_id", user.id)
      .gte("date", recentWindowStart)
      .lte("date", today),
    sb
      .from("daily_results")
      .select("date,elapsed_seconds")
      .eq("user_id", user.id)
      .gte("date", windowStart)
      .lte("date", today),
    sb
      .from("daily_results")
      .select("date,elapsed_seconds")
      .gte("date", windowStart)
      .lte("date", today),
  ]);

  const globalDaily = heatmapMedians as { date: string; elapsed_seconds: number }[] | null;

  const all = (games ?? []) as GameRow[];
  const completed = all.filter((g) => g.is_complete);
  const byDiff = (d: string) => completed.filter((g) => g.difficulty === d);
  const best = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);

  const completedDates = new Set<string>(
    ((dailyResults ?? []) as { date: string }[]).map((r) => r.date),
  );
  const frozenDates = new Set<string>(
    ((streakFreezes ?? []) as { date: string }[]).map((f) => f.date),
  );
  const streak = computeUnifiedStreak(today, completedDates, frozenDates);

  const grouped = new Map<string, number[]>();
  for (const row of globalDaily ?? []) {
    const arr = grouped.get(row.date) ?? [];
    arr.push(row.elapsed_seconds);
    grouped.set(row.date, arr);
  }
  const mediansByDate = new Map<string, number>();
  for (const [d, arr] of grouped) {
    arr.sort((a, b) => a - b);
    const mid = arr.length / 2;
    mediansByDate.set(
      d,
      Number.isInteger(mid)
        ? Math.round((arr[mid - 1] + arr[mid]) / 2)
        : arr[Math.floor(mid)],
    );
  }
  const heatmap = computeUserHeatmap({
    today,
    results: ((heatmapResults ?? []) as { date: string; elapsed_seconds: number }[]),
    freezes: frozenDates,
    mediansByDate,
  });

  const daysOnHako = profile?.created_at
    ? Math.max(
        0,
        Math.floor(
          (new Date(today + "T00:00:00Z").getTime() -
            new Date(profile.created_at).getTime()) /
            86_400_000,
        ),
      )
    : 0;

  const streakStart = streakStartDate(today, completedDates, frozenDates);
  const streakSinceLabel = streakStart ? formatSince(streakStart) : null;
  const dailiesKept = completedDates.size;
  const missed = Math.max(0, daysOnHako - dailiesKept - frozenDates.size);

  const lastOpenedTime = (() => {
    const newest = (games ?? [])[0];
    if (!newest) return null;
    const d = new Date(newest.created_at);
    const iso = d.toISOString().slice(0, 10);
    if (iso !== today) return null;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  })();

  const diffs: { key: string; k: string; lvl: string }[] = [
    { key: "easy", k: "易", lvl: "easy" },
    { key: "medium", k: "中", lvl: "medium" },
    { key: "hard", k: "難", lvl: "hard" },
    { key: "expert", k: "極", lvl: "expert" },
  ];

  const diffStats = (d: string) => {
    const xs = byDiff(d).map((g) => g.elapsed_seconds);
    const bestSec = best(xs);
    const bestGame = bestSec > 0
      ? byDiff(d).find((g) => g.elapsed_seconds === bestSec)
      : undefined;
    return { best: bestSec, count: xs.length, bestGame };
  };

  const statuses = computeStatuses(all, { today, frozen: frozenDates });
  const earnedCount = statuses.filter((s) => s.earned).length;

  const lastEarned = statuses
    .filter((s) => s.earned && s.earnedAt)
    .map((s) => {
      const a = ACHIEVEMENTS.find((x) => x.key === s.key)!;
      return { glyph: a.glyph, when: s.earnedAt! };
    })[0];

  const rareCount = statuses.filter((s) => {
    const a = ACHIEVEMENTS.find((x) => x.key === s.key);
    return s.earned && a?.category === "special";
  }).length;

  const username = profile?.username?.trim() || emailHandle;
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  // Long handles get a smaller font so the h1 doesn't overflow the 360px rail.
  const headlineSize = displayName.length > 14 ? 28 : displayName.length > 10 ? 34 : 42;
  const cityLabel = (profile?.city ?? "—").trim() || "—";

  return (
    <>
      <Masthead active="profile" initial={initial} email={user.email ?? null} />

      <main>
        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] border-b-[1.5px] border-sumi bg-bone">
          {/* Left rail */}
          <div className="bg-rice border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi p-10 lg:px-12 lg:py-14 flex flex-col gap-9">
            <div>
              <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss mb-3.5 truncate" title={`/u/${username} · ${cityLabel}`}>
                /u/{username} · {cityLabel}
              </div>
              <div
                className="relative w-20 h-20 bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none mb-[18px]"
                style={{ fontSize: 48 }}
              >
                <span className="relative z-10">{initial.toUpperCase()}</span>
                <span
                  aria-hidden
                  className="absolute inset-0 mix-blend-multiply pointer-events-none"
                  style={{ backgroundImage: STAMP_NOISE }}
                />
              </div>
              <h1
                className="mincho font-medium leading-none -tracking-[0.015em] text-sumi m-0 break-words"
                style={{ fontSize: headlineSize }}
                title={displayName}
              >
                {displayName}
              </h1>
              <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-moss mt-2.5 flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[200px]" title={`@${username}`}>
                  @{username}
                </span>
                {daysOnHako > 0 && <span>· {daysOnHako}日 on Hako</span>}
                <UsernamePicker current={username} />
              </div>
              <p className="mt-[18px] ital text-[17px] text-moss leading-snug max-w-[30ch]">
                — solver on Hako.
              </p>
            </div>

            <div className="pt-7 border-t border-sumi/18">
              <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-vermillion mb-2">
                streak — kept
              </div>
              <div
                className="mincho font-semibold text-vermillion -tracking-[0.03em] tnum"
                style={{ fontSize: 128, lineHeight: 0.88 }}
              >
                {streak}
                <span
                  className="text-sumi font-medium"
                  style={{ fontSize: "0.28em", marginLeft: "0.06em", verticalAlign: "0.7em" }}
                >
                  日
                </span>
              </div>
              <span className="block ital text-[15px] text-moss mt-2 leading-snug">
                {streakSinceLabel && (
                  <>
                    since{" "}
                    <strong className="mincho not-italic font-semibold text-sumi">
                      {streakSinceLabel}
                    </strong>
                    .
                    {dailiesKept > 0 && " "}
                  </>
                )}
                {dailiesKept > 0 && (
                  <>
                    <strong className="mincho not-italic font-semibold text-sumi">
                      {dailiesKept}
                    </strong>{" "}
                    of{" "}
                    <strong className="mincho not-italic font-semibold text-sumi">
                      {Math.max(daysOnHako, dailiesKept)}
                    </strong>{" "}
                    dailies kept.
                  </>
                )}
                {!streakSinceLabel && dailiesKept === 0 && "— begin a streak today."}
              </span>
            </div>

            <div className="mt-auto pt-6 border-t border-sumi/18">
              <Link
                href="/play/daily"
                className="btn-hako"
                style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
              >
                Continue today&rsquo;s box{" "}
                <span className="font-jakarta font-light text-[18px]">→</span>
              </Link>
              {lastOpenedTime && (
                <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-3">
                  last opened today · {lastOpenedTime}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="p-8 lg:p-12 flex flex-col gap-12">
            {/* Heatmap block */}
            <div>
              <div className="flex flex-col md:flex-row md:justify-between md:items-baseline gap-2 mb-[18px]">
                <h2 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
                  Half a year, in seals
                  <span className="text-vermillion ml-2.5 text-[0.85em]">
                    章
                  </span>
                </h2>
                <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right leading-relaxed">
                  <strong className="text-sumi font-medium">{dailiesKept}</strong>{" "}
                  kept ·{" "}
                  <strong className="text-sumi font-medium">{missed}</strong>{" "}
                  missed
                  <br />
                  last 26 weeks
                </div>
              </div>
              <div className="overflow-x-auto -mx-7 px-7 lg:mx-0 lg:px-0">
                <Heatmap days={heatmap} />
              </div>
              <div className="mt-3.5 flex justify-between items-center mono text-[9.5px] tracking-[0.18em] uppercase text-moss">
                <div>density = time on the puzzle</div>
                <div className="flex gap-1.5 items-center">
                  <span>less</span>
                  <span className="w-[11px] h-[11px] border-[0.5px] border-sumi/20" />
                  <span className="w-[11px] h-[11px] bg-vermillion/22" />
                  <span className="w-[11px] h-[11px] bg-vermillion/55" />
                  <span className="w-[11px] h-[11px] bg-vermillion" />
                  <span>more</span>
                </div>
              </div>
            </div>

            {/* Personal best block */}
            <div>
              <div className="flex justify-between items-baseline mb-[18px] gap-6">
                <h3 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
                  Personal best
                  <span className="text-vermillion ml-2.5 text-[0.85em]">速</span>
                </h3>
                <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right">
                  your fastest, by floor
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-sumi/18">
                {diffs.map((d, i, arr) => {
                  const stat = diffStats(d.key);
                  const has = stat.count > 0;
                  return (
                    <div
                      key={d.key}
                      className={
                        "py-5 px-5 border-b border-sumi/12 " +
                        (i === 0 ? "pl-0 " : "") +
                        (i < arr.length - 1 ? "border-r border-sumi/10 " : "")
                      }
                    >
                      <div className="flex justify-between items-baseline">
                        <div
                          className={
                            "mincho font-semibold text-[32px] leading-none -tracking-[0.02em] " +
                            (has ? "text-sumi" : "text-moss/45")
                          }
                        >
                          {d.k}
                        </div>
                        <div className="mono text-[9.5px] tracking-[0.2em] uppercase text-moss">
                          {d.lvl}
                        </div>
                      </div>
                      <div
                        className={
                          "mincho font-semibold text-[32px] leading-none -tracking-[0.01em] tnum mt-5 " +
                          (has ? "text-vermillion" : "text-moss/50")
                        }
                      >
                        {has ? formatTime(stat.best) : "—:—"}
                      </div>
                      <div className="mono text-[9.5px] tracking-[0.16em] uppercase text-moss mt-1.5">
                        {has && stat.bestGame
                          ? `${formatSince(stat.bestGame.created_at)} · ${stat.count} solved`
                          : "no solves yet"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Marks block */}
            <div>
              <div className="flex justify-between items-baseline mb-[18px] gap-6">
                <h3 className="mincho font-medium text-[26px] leading-none -tracking-[0.005em] text-sumi m-0">
                  {earnedCount === 0
                    ? "No marks yet"
                    : `${numberWord(earnedCount)} of twelve`}
                  <span className="text-vermillion ml-2.5 text-[0.85em]">章</span>
                </h3>
                <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss text-right">
                  {lastEarned ? (
                    <>
                      last earned{" "}
                      <strong className="text-sumi font-medium">
                        {lastEarned.glyph}
                      </strong>{" "}
                      · {lastEarned.when}
                    </>
                  ) : (
                    <>{earnedCount} of 12 · earned</>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-6">
                {ACHIEVEMENTS.map((a) => {
                  const s = statuses.find((x) => x.key === a.key);
                  const earned = !!s?.earned;
                  const hidden = !earned && a.hideUntilEarned;
                  return (
                    <div
                      key={a.key}
                      className="flex flex-col items-center gap-2.5"
                    >
                      {earned ? (
                        <div
                          className="relative w-[54px] h-[54px] bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none"
                          style={{ fontSize: 26 }}
                        >
                          <span className="relative z-10">{a.glyph}</span>
                          <span
                            aria-hidden
                            className="absolute inset-0 mix-blend-multiply pointer-events-none"
                            style={{ backgroundImage: STAMP_NOISE }}
                          />
                        </div>
                      ) : (
                        <div
                          className="w-[54px] h-[54px] bg-transparent text-sumi flex items-center justify-center mincho font-semibold leading-none border-[1.5px] border-sumi/18"
                          style={{ fontSize: 26 }}
                        >
                          <span className="opacity-[0.22]">
                            {hidden ? "？" : a.glyph}
                          </span>
                        </div>
                      )}
                      <div
                        className={
                          "mincho font-semibold text-[11px] text-center leading-tight " +
                          (earned ? "text-sumi" : "text-moss")
                        }
                      >
                        {hidden ? "— hidden" : a.name}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-sumi/18 pt-3.5 mt-[18px] flex justify-between items-center mono text-[10px] tracking-[0.22em] uppercase text-moss">
                <span>
                  {earnedCount} of 12
                  {rareCount > 0 && <> · {rareCount} rare</>}
                </span>
                <Link
                  href="/achievements"
                  className="text-sumi border-b-[1.5px] border-vermillion pb-0.5"
                >
                  See the full ledger →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function numberWord(n: number): string {
  const words = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  ];
  return words[n] ?? n.toString();
}
