import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils";
import { kanjiNum } from "@/lib/kanji";
import { Masthead } from "@/components/Masthead";
import { Heatmap } from "@/components/stats/Heatmap";

export const dynamic = "force-dynamic";

export default async function Stats() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const initial = user.email?.[0] ?? "·";
  const username = user.email?.split("@")[0] ?? "duman";

  type GameRow = {
    difficulty: string;
    is_complete: boolean;
    elapsed_seconds: number;
    created_at: string;
  };
  const { data: games } = await sb
    .from("games")
    .select("difficulty,is_complete,elapsed_seconds,created_at")
    .eq("user_id", user.id);

  const all = (games ?? []) as GameRow[];
  const completed = all.filter((g) => g.is_complete);
  const byDiff = (d: string) => completed.filter((g) => g.difficulty === d);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const best = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);

  const days = new Set<string>(
    completed.map((g) => g.created_at.slice(0, 10))
  );
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  // Demo fallback values when there's no data yet
  const totals = {
    streak: streak || 22,
    bestStreak: 41,
    missed: 4,
    solvedAll: completed.length || 186,
    daily: completed.filter((g) => g.difficulty !== "casual").length || 142,
    casual: 44,
    expert: byDiff("expert").length || 8,
    avgSecs:
      avg(completed.map((g) => g.elapsed_seconds)) || 11 * 60 + 42,
  };

  const since = "6 february";

  const diffs: { key: string; label: string; accent?: boolean }[] = [
    { key: "easy", label: "易 Easy" },
    { key: "medium", label: "中 Medium" },
    { key: "hard", label: "難 Hard" },
    { key: "expert", label: "極 Expert", accent: true },
  ];

  const diffStats = (d: string) => {
    const xs = byDiff(d).map((g) => g.elapsed_seconds);
    return { best: best(xs), avg: avg(xs), count: xs.length };
  };
  const diffFallback: Record<
    string,
    { best: number; avg: number; count: number }
  > = {
    easy: { best: 138, avg: 230, count: 64 },
    medium: { best: 342, avg: 431, count: 78 },
    hard: { best: 554, avg: 822, count: 36 },
    expert: { best: 1028, avg: 1290, count: 8 },
  };
  const merged = (k: string) =>
    diffStats(k).count > 0 ? diffStats(k) : diffFallback[k];

  return (
    <>
      <Masthead active="stats" initial={initial} streakDays={totals.streak} />

      <main className="px-7 lg:px-14 py-12 lg:py-16 max-w-[1480px] mx-auto">
        <div className="eyebrow">
          {username} · since {since}
        </div>
        <h1 className="h-disp text-[42px] sm:text-[54px] mt-2">
          A solver&rsquo;s ledger.
        </h1>

        {/* Top stats row */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 border-t-2 border-b-2 border-sumi py-6">
          <div className="md:border-r border-sumi/20 md:pr-6">
            <div className="eyebrow">streak · today</div>
            <div className="kdate-jp text-[60px] md:text-[72px] text-vermillion font-semibold leading-none mt-2">
              {kanjiNum(totals.streak)}
            </div>
            <div className="txt-small mt-2">
              {totals.streak} days · best {totals.bestStreak} ·{" "}
              {totals.missed} missed
            </div>
          </div>
          <div className="md:border-r border-sumi/20 md:px-6 mt-6 md:mt-0">
            <div className="eyebrow">solved · all</div>
            <div className="kdate-jp text-[60px] md:text-[72px] font-bold leading-none mt-2 tnum">
              {totals.solvedAll}
            </div>
            <div className="txt-small mt-2">
              {totals.daily} daily · {totals.casual} casual · {totals.expert} expert
            </div>
          </div>
          <div className="md:pl-6 mt-6 md:mt-0">
            <div className="eyebrow">average pace</div>
            <div className="kdate-jp text-[60px] md:text-[72px] font-semibold leading-none mt-2 tnum">
              {formatTime(Math.round(totals.avgSecs))}
            </div>
            <div className="txt-small mt-2">
              faster than median in ала
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="mt-12">
          <div className="flex flex-col md:flex-row md:justify-between md:items-baseline gap-2 mb-3.5">
            <div>
              <div className="eyebrow">last 26 weeks · 完 stamps</div>
              <h3 className="h-disp text-[24px] mt-1.5">
                Half a year, mostly kept.
              </h3>
            </div>
            <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss">
              nov · dec · jan · feb · mar · apr · may
            </div>
          </div>
          <Heatmap weeks={26} />
          <div className="mt-3.5 flex justify-between items-center mono text-[10px] tracking-[0.18em] uppercase text-moss">
            <span>
              {totals.missed} missed days · 2 ↻ catchups
            </span>
            <div className="flex gap-1.5 items-center">
              <span className="text-[10px]">less</span>
              <span className="w-3 h-3 border-[0.5px] border-sumi/20" />
              <span className="w-3 h-3 bg-vermillion/20" />
              <span className="w-3 h-3 bg-vermillion/55" />
              <span className="w-3 h-3 bg-vermillion" />
              <span className="text-[10px]">more</span>
            </div>
          </div>
        </div>

        {/* Best times grid */}
        <div className="mt-12">
          <div className="eyebrow mb-3.5">best times by box</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {diffs.map((d) => {
              const stat = merged(d.key);
              return (
                <div
                  key={d.key}
                  className={
                    "border-[1.5px] border-sumi p-6 " +
                    (d.accent ? "bg-vermillion text-bone" : "")
                  }
                >
                  <div className="kdate-jp text-2xl">{d.label}</div>
                  <div
                    className={
                      "mincho font-semibold mt-2 leading-none text-[36px] lg:text-[42px] tnum " +
                      (d.accent ? "" : "")
                    }
                  >
                    {formatTime(stat.best)}
                  </div>
                  <div
                    className={
                      "text-[12.5px] mt-1.5 " +
                      (d.accent
                        ? "text-bone/70 font-jakarta"
                        : "txt-small")
                    }
                  >
                    avg {formatTime(Math.round(stat.avg))} · {stat.count} solved
                    {d.accent ? " · pro" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
