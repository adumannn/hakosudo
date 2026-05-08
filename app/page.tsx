import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { createServerClient } from "@/lib/supabase/server";
import { dateLine } from "@/lib/kanji";
import { todayUTC } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface LedgerRow {
  user_id: string;
  elapsed_seconds: number;
  profiles: { username: string | null } | null;
}

const NAMES_FALLBACK = [
  { rank: "01", name: "nurali", time: "02:48", first: true },
  { rank: "02", name: "aigerim", time: "02:54", first: false },
  { rank: "03", name: "dauren", time: "03:01", first: false },
];

function formatHMS(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default async function Home() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;

  const initial = user?.email?.[0] ?? "·";
  const dateString = dateLine();
  const today = todayUTC();

  // pull a small ledger preview if present
  let preview: { rank: string; name: string; time: string; first: boolean }[] = NAMES_FALLBACK;
  try {
    const { data } = await sb
      .from("daily_results")
      .select("user_id,elapsed_seconds,profiles(username)")
      .eq("date", today)
      .order("elapsed_seconds", { ascending: true })
      .limit(3);
    const rows = (data ?? []) as unknown as LedgerRow[];
    if (rows.length) {
      preview = rows.map((r, i) => ({
        rank: (i + 1).toString().padStart(2, "0"),
        name: r.profiles?.username ?? "anon",
        time: formatHMS(r.elapsed_seconds),
        first: i === 0,
      }));
    }
  } catch {
    /* schema may not exist yet — fall back to fixtures */
  }

  return (
    <>
      <Masthead active="today" initial={initial} />

      <main className="px-6 lg:px-24 py-10 lg:py-16 max-w-[1480px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_540px] gap-10 lg:gap-20 items-start">
          {/* LEFT: Today's daily */}
          <div>
            <div className="eyebrow red">{dateString}</div>
            <h1 className="h-disp text-[clamp(48px,12vw,108px)] mt-4 leading-[0.96]">
              Today&rsquo;s
              <br />
              box.
            </h1>
            <p className="ital text-moss text-[18px] lg:text-[22px] mt-4 leading-[1.4] max-w-[36ch]">
              № 0472 · Hard. You haven&rsquo;t opened it yet.
              <br />
              2,184 are solving now &mdash; the board is quiet at this hour.
            </p>

            <Link
              href="/play/daily"
              className="group mt-12 bg-sumi text-bone px-7 py-6 flex items-center justify-between max-w-[520px] hover:bg-sumi/95 transition-colors"
            >
              <div>
                <div className="mono text-[10px] tracking-[0.22em] uppercase text-bone/70">
                  Daily · unlocks daily 00:00 local
                </div>
                <div className="mincho text-[28px] font-semibold mt-2">
                  Begin today
                </div>
                <div className="ital text-[13px] text-bone/70 mt-1">
                  enter takes you straight in
                </div>
              </div>
              <div className="mincho text-[42px] text-vermillion leading-none transition-transform group-hover:translate-x-1">
                →
              </div>
            </Link>

            <p className="mt-8 mono text-[10px] tracking-[0.2em] uppercase text-moss">
              global pace · today
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <div className="kdate-jp text-2xl font-semibold tnum">02:48</div>
                <div className="txt-small">first solve · nurali, ала</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">14:52</div>
                <div className="txt-small">global median</div>
              </div>
              <div className="sm:border-l sm:border-sumi sm:pl-6">
                <div className="kdate-jp text-2xl font-semibold tnum">2,184</div>
                <div className="txt-small">solving now</div>
              </div>
            </div>
          </div>

          {/* RIGHT: difficulty grid + leaderboard preview */}
          <div>
            <div className="eyebrow mb-3">or just play</div>
            <div className="grid grid-cols-2 gap-2">
              <DifficultyTile k="易 Easy" sub="avg 4:12 · best 2:18" href="/play/easy" />
              <DifficultyTile k="中 Medium" sub="avg 8:30 · best 5:42" href="/play/medium" />
              <DifficultyTile k="難 Hard" sub="avg 14:50 · best 9:14" href="/play/hard" />
              <DifficultyTile
                k="極 Expert"
                sub="23:00+ · pro"
                href="/play/expert"
                accent
              />
            </div>

            <div className="mt-9">
              <div className="flex justify-between items-baseline mb-3.5">
                <div className="eyebrow">ledger · ала today</div>
                <Link
                  href="/leaderboard"
                  className="ital text-vermillion text-[14px] no-underline hover:underline"
                >
                  see all →
                </Link>
              </div>
              <div>
                {preview.map((row) => (
                  <div
                    key={row.rank}
                    className="grid grid-cols-[28px_1fr_auto] gap-3.5 py-2.5 border-b border-sumi/12"
                  >
                    <div
                      className={
                        "kdate-jp text-[13px] " +
                        (row.first ? "text-vermillion" : "text-moss")
                      }
                    >
                      {row.rank}
                    </div>
                    <div className="text-[14px]">{row.name}</div>
                    <div className="mincho text-[15px] font-semibold tnum">
                      {row.time}
                    </div>
                  </div>
                ))}
                <div className="text-center py-3.5 ital text-moss text-[14px]">
                  <span className="text-vermillion mr-1">↘</span>
                  your name lands when you finish.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function DifficultyTile({
  k,
  sub,
  href,
  accent,
}: {
  k: string;
  sub: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "border border-sumi p-4 transition-colors block " +
        (accent
          ? "bg-vermillion text-bone hover:bg-vermillion-deep"
          : "bg-bone hover:bg-rice")
      }
    >
      <div
        className={
          "kdate-jp text-[22px] font-semibold " + (accent ? "" : "")
        }
      >
        {k}
      </div>
      <div
        className={
          "txt-small mt-1 " +
          (accent
            ? "text-bone/70 font-jakarta"
            : "")
        }
      >
        {sub}
      </div>
    </Link>
  );
}

function Footer() {
  return (
    <footer className="border-t border-sumi/15 mt-16 px-6 lg:px-12 py-8 max-w-[1480px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-6 mono text-[10px] tracking-[0.2em] uppercase text-moss">
        <div>
          hako.app · since february · made in almaty
        </div>
        <div>
          v1.0 · 8 may 2026
        </div>
      </div>
    </footer>
  );
}
