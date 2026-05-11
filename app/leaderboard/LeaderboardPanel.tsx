import Link from "next/link";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { computeCityCounts, computeUserStanding } from "@/lib/stats/leaderboard";

type Range = "today" | "7d" | "all";

interface Row {
  user_id: string;
  elapsed_seconds: number;
  city: string | null;
  created_at: string;
  hints_used?: number | null;
  profiles: { username: string | null } | null;
}

interface LeaderboardPanelProps {
  userId: string | null;
  username: string | null;
  date: string;
  cityFilter: string | null;
  cityFilterRaw: string | null;
  range: Range;
}

export async function LeaderboardPanel({
  userId,
  username,
  date,
  cityFilter,
  cityFilterRaw,
  range,
}: LeaderboardPanelProps) {
  const { sb } = await getCurrentUser();

  // Fan out the queries the panel needs.
  const [profile, dailyMetaRes, allTodayRes] = await Promise.all([
    getProfile(),
    sb.from("daily_puzzles").select("seq,difficulty").eq("date", date).maybeSingle(),
    sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,city,created_at,hints_used,profiles(username)")
      .eq("date", date)
      .order("elapsed_seconds", { ascending: true }),
  ]);

  const userProfileCity = profile?.city ?? null;
  const dailyMeta = dailyMetaRes.data as { seq: number | null; difficulty: string | null } | null;
  const seq = dailyMeta?.seq ?? null;
  const difficulty = dailyMeta?.difficulty ?? "—";
  const allRowsToday = ((allTodayRes.data ?? []) as unknown as Row[]) ?? [];

  let tableRowsAll: Row[] = [];
  if (range === "today") {
    tableRowsAll = allRowsToday;
  } else {
    const fromDate = (() => {
      if (range === "all") return null;
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 6);
      return d.toISOString().slice(0, 10);
    })();
    let bestQ = sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,city,created_at,hints_used,profiles(username)");
    if (fromDate) bestQ = bestQ.gte("date", fromDate).lte("date", date);
    bestQ = bestQ.order("elapsed_seconds", { ascending: true });
    let allRows: Row[] = [];
    try {
      const { data } = await bestQ;
      allRows = (data ?? []) as unknown as Row[];
    } catch {
      allRows = [];
    }
    const seen = new Set<string>();
    const dedup: Row[] = [];
    for (const r of allRows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      dedup.push(r);
    }
    tableRowsAll = dedup;
  }

  const cityCounts = computeCityCounts({
    rows: allRowsToday.map((r) => ({ city: r.city })),
    userCity: userProfileCity,
  });
  const totalAllCities = allRowsToday.length;

  const tableRowsFiltered = cityFilter
    ? tableRowsAll.filter(
        (r) => r.city && r.city.trim().toLowerCase() === cityFilter,
      )
    : tableRowsAll;
  const tableRows = tableRowsFiltered.slice(0, 20);

  const userRow = userId
    ? allRowsToday.find((r) => r.user_id === userId) ?? null
    : null;
  const userCity = userRow?.city ? userRow.city.trim().toLowerCase() : null;
  const userCityRows = userCity
    ? allRowsToday.filter((r) => r.city && r.city.trim().toLowerCase() === userCity)
    : [];
  const standing = computeUserStanding({
    userRow: userRow
      ? { elapsed_seconds: userRow.elapsed_seconds, city: userRow.city }
      : null,
    cityResults: userCityRows.map((r) => ({ elapsed_seconds: r.elapsed_seconds })),
  });

  const cityLabel = cityFilter ?? "global";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] max-w-[1480px] mx-auto">
      {/* CITY RAIL */}
      <aside className="border-r border-sumi/15 lg:border-r-2 lg:border-r-sumi p-7 lg:p-9">
        <div className="eyebrow mb-3.5">solving in</div>
        <h3 className="h-disp text-[36px] tracking-[-0.02em]">
          {cityLabel}
          <span className="text-vermillion">.</span>
        </h3>
        <div className="eyebrow mt-8 mb-3">cities</div>
        <div>
          {cityCounts.length === 0 ? (
            <p className="ital text-moss text-[14px]">— no city activity yet today.</p>
          ) : (
            cityCounts.map((c) => (
              <Link
                key={c.city}
                href={{ pathname: "/leaderboard", query: { city: c.city, range } }}
                className={cn("city-row", c.city === cityFilter && "on")}
              >
                <span className="city-name">{c.city}</span>
                <span className="ct">{c.count.toLocaleString()}</span>
              </Link>
            ))
          )}
        </div>
        <div className="eyebrow mt-8 mb-3">global</div>
        <Link
          href={{ pathname: "/leaderboard", query: { range } }}
          className={cn("city-row", !cityFilter && "on")}
        >
          <span className="city-name">All cities</span>
          <span className="ct">{totalAllCities.toLocaleString()}</span>
        </Link>
        <div className="mt-8 border-t border-sumi pt-4">
          <p className="ital text-moss text-[14px]">
            — set your city in profile to land on the right ledger.
          </p>
        </div>
      </aside>

      {/* LEDGER */}
      <section className="p-7 lg:p-14">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-3.5">
          <div>
            <div className="eyebrow red">
              {seq != null
                ? `daily № ${seq.toString().padStart(4, "0")} · ${date} · ${difficulty}`
                : `${date} · ${difficulty}`}
              {range !== "today" && ` · ${range === "7d" ? "7-day" : "all-time"} best`}
            </div>
            <h2 className="h-disp text-[42px] mt-1.5">
              {range === "today"
                ? `Today in ${cityLabel}.`
                : range === "7d"
                ? `7 days in ${cityLabel}.`
                : `All-time in ${cityLabel}.`}
            </h2>
          </div>
          <div className="flex gap-1.5">
            <RangePill k="today" active={range === "today"} city={cityFilterRaw} />
            <RangePill k="7d" label="7-day" active={range === "7d"} city={cityFilterRaw} />
            <RangePill k="all" label="All-time" active={range === "all"} city={cityFilterRaw} />
          </div>
        </div>

        <div className="mt-7 border-t-2 border-sumi">
          <div className="led-row hd">
            <div>rank</div>
            <div>solver</div>
            <div>time</div>
            <div>hints</div>
            <div className="col-hide-md">finished</div>
            <div className="col-hide-md"></div>
          </div>
          {tableRows.length === 0 ? (
            <p className="ital text-moss text-[14px] py-6 px-1">
              — the ledger fills as solvers finish today&rsquo;s box.
            </p>
          ) : (
            tableRows.map((r, i) => (
              <LedgerRow
                key={`${r.user_id}-${i}`}
                rank={(i + 1).toString().padStart(2, "0")}
                name={r.profiles?.username ?? "anon"}
                city={r.city}
                time={formatTime(r.elapsed_seconds)}
                hints={r.hints_used ?? null}
                finished={new Date(r.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
                first={i === 0}
              />
            ))
          )}
        </div>

        {username && standing && (
          <div className="led-row you mt-1.5 bg-vermillion text-bone">
            <div className="kdate-jp text-[18px] font-bold">
              {standing.rankInCity.toString().padStart(2, "0")}
            </div>
            <div>
              <span className="kdate-jp text-[16px] font-bold">{username}</span>
              <span className="mono text-[9.5px] tracking-[0.18em] uppercase opacity-70 ml-2">
                you
              </span>
            </div>
            <div className="kdate-jp text-[18px] font-bold tnum">
              {formatTime(standing.time)}
            </div>
            <div>—</div>
            <div className="text-[12.5px] col-hide-md" />
            <div className="ital col-hide-md">
              faster than {standing.percentile}%
              {standing.city ? ` in ${standing.city}` : ""} today
            </div>
          </div>
        )}
        {username && !standing && (
          <p className="ital text-moss text-[14px] mt-4">
            — finish today&rsquo;s box to land on the ledger.
          </p>
        )}
      </section>
    </div>
  );
}

function RangePill({
  k,
  label,
  active,
  city,
}: {
  k: Range;
  label?: string;
  active: boolean;
  city: string | null;
}) {
  const query: Record<string, string> = { range: k };
  if (city) query.city = city;
  return (
    <Link
      href={{ pathname: "/leaderboard", query }}
      className={cn("kpill", active ? "red" : "outline")}
    >
      {label ?? k.charAt(0).toUpperCase() + k.slice(1)}
    </Link>
  );
}

function LedgerRow({
  rank,
  name,
  city,
  time,
  hints,
  finished,
  first,
}: {
  rank: string;
  name: string;
  city: string | null;
  time: string;
  hints: number | null;
  finished: string;
  first: boolean;
}) {
  return (
    <div className={cn("led-row", first && "top1")}>
      <div className={cn("kdate-jp font-semibold tnum", first ? "text-vermillion text-[18px] font-bold" : "text-[16px]")}>{rank}</div>
      <div>
        <span className={cn("kdate-jp", first ? "text-[16px] font-semibold" : "text-[15px]")}>{name}</span>
        {city && <span className="txt-small ml-2">/ {city.trim().toLowerCase()}</span>}
      </div>
      <div className={cn("kdate-jp font-semibold tnum", first ? "text-[18px]" : "text-[16px]")}>{time}</div>
      <div className="text-[14px]">{hints && hints > 0 ? hints : "—"}</div>
      <div className="txt-small col-hide-md">{finished}</div>
      <div className="col-hide-md">
        {first && <span className="kpill red text-[10px]">完 first</span>}
      </div>
    </div>
  );
}
