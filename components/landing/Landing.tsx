import Link from "next/link";

interface LandingProps {
  dateLabelJp: string;
  dateLabelEn: string;
  dailySeq: number | null;
  solvingNow: number;
  firstSolveTime: string | null;
  cityCount: { city: string; count: number } | null;
}

const HERO_BOARD: ReadonlyArray<ReadonlyArray<number | null>> = [
  [5, null, null, 6, null, 2, null, null, 8],
  [null, null, 1, null, 5, null, 9, null, null],
  [null, 9, null, null, null, null, 3, null, 6],
  [3, null, null, 7, null, 6, null, null, 5],
  [4, null, null, 2, null, 9, null, null, 1],
  [9, null, null, 5, null, 3, null, null, 2],
  [6, null, 7, null, null, null, 4, null, 9],
  [null, null, 2, null, 9, null, 8, null, null],
  [8, null, null, 3, null, 7, null, null, null],
];

const HERO_PLAYER: ReadonlySet<string> = new Set([
  "0,1", "0,4", "1,3", "1,7", "2,1", "2,7",
  "3,1", "3,7", "4,1", "4,7", "5,1", "5,7",
  "6,3", "7,3", "7,7", "8,1", "8,7",
]);

const STAMP_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function VermillionStamp({
  glyph,
  size,
  fontSize,
  rotate,
  className,
}: {
  glyph: string;
  size: number;
  fontSize: number;
  rotate?: number;
  className?: string;
}) {
  return (
    <div
      className={"relative inline-flex items-center justify-center bg-vermillion text-bone mincho font-bold leading-none " + (className ?? "")}
      style={{
        width: size,
        height: size,
        fontSize,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      <span className="relative z-10">{glyph}</span>
      <span
        aria-hidden
        className="absolute inset-0 mix-blend-multiply pointer-events-none"
        style={{ backgroundImage: STAMP_NOISE }}
      />
    </div>
  );
}

function LockedStamp({
  glyph,
  size,
  fontSize,
}: {
  glyph: string;
  size: number;
  fontSize: number;
}) {
  return (
    <div
      className="inline-flex items-center justify-center bg-transparent text-sumi mincho font-semibold leading-none border-[1.5px] border-sumi/18"
      style={{ width: size, height: size, fontSize }}
    >
      <span className="opacity-[0.22]">{glyph}</span>
    </div>
  );
}

function HeroBoard() {
  const cells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = HERO_BOARD[r][c];
      const isPlayer = HERO_PLAYER.has(`${r},${c}`);
      const cls =
        v === null
          ? "hako-cell text-transparent"
          : isPlayer
            ? "hako-cell player"
            : "hako-cell given";
      cells.push(
        <div key={`${r}-${c}`} className={cls} style={{ cursor: "default" }}>
          {v ?? "·"}
        </div>,
      );
    }
  }
  return <div className="hako-board">{cells}</div>;
}

export function Landing({
  dateLabelJp,
  dateLabelEn,
  dailySeq,
  solvingNow,
  firstSolveTime,
  cityCount,
}: LandingProps) {
  const seqLabel = dailySeq != null ? dailySeq.toString().padStart(4, "0") : "—";
  const cityLabel =
    cityCount && cityCount.count > 0
      ? `${cityCount.count.toLocaleString()} in ${cityCount.city}`
      : null;

  return (
    <main className="bg-bone text-sumi">
      {/* ──────────── MARKETING NAV ──────────── */}
      <nav className="flex items-center justify-between px-6 lg:px-16 py-4 lg:py-5 border-b-[1.5px] border-sumi bg-bone sticky top-0 z-30">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-[28px] h-[28px] bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none"
            style={{ fontSize: 14 }}
          >
            箱
          </div>
          <span className="mincho font-semibold text-[18px] text-sumi">Hako</span>
        </Link>
        <Link
          href="/auth/login"
          className="mono text-[10.5px] tracking-[0.22em] uppercase text-sumi border-b-[1.5px] border-vermillion pb-0.5 hover:text-vermillion transition-colors"
        >
          Sign in →
        </Link>
      </nav>

      {/* ──────────── HERO ──────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] border-b-[1.5px] border-sumi lg:min-h-[660px]">
        <div className="px-8 py-14 lg:px-16 lg:pt-20 lg:pb-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi">
          <div>
            <div className="flex items-center gap-3.5">
              <VermillionStamp glyph="日" size={42} fontSize={20} />
              <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss leading-relaxed">
                <div>
                  <span>{dateLabelJp}</span>
                  <span className="text-moss/80"> · </span>
                  <span>{dateLabelEn}</span>
                </div>
                <div>
                  daily №{" "}
                  <strong className="text-vermillion font-medium">
                    {seqLabel}
                  </strong>{" "}
                  · hard
                </div>
              </div>
            </div>

            <h1 className="mincho font-medium text-[64px] lg:text-[128px] leading-[0.92] -tracking-[0.025em] mt-9 text-sumi">
              <span className="block">Today&rsquo;s</span>
              <span className="block">
                box.
                <span className="text-vermillion text-[0.42em] align-[0.55em] ml-4 font-semibold">
                  箱
                </span>
              </span>
            </h1>

            <p className="mt-8 max-w-[46ch] text-[18px] leading-[1.55] text-sumi">
              A new sudoku, opened once a day. Twelve to twenty quiet minutes.{" "}
              <span className="ital text-moss">
                The seal prints when you finish — never before.
              </span>
            </p>

            <div className="mt-11 flex flex-wrap items-center gap-4">
              <Link
                href="/play/hard"
                className="btn-hako red"
                style={{ padding: "18px 28px", fontSize: 18 }}
              >
                Begin today <span className="font-jakarta font-light text-[20px]">→</span>
              </Link>
              <Link
                href="/play"
                className="relative mono text-[11px] tracking-[0.22em] uppercase text-sumi pb-2"
              >
                or pick a difficulty →
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[-4px] right-[-12px] bottom-0 h-[3px] bg-vermillion rounded-[2px] opacity-90"
                  style={{ transform: "rotate(-0.6deg)", transformOrigin: "left center" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[-2px] right-[-8px] -bottom-[2px] h-px bg-vermillion-deep opacity-55"
                  style={{ transform: "rotate(0.4deg)", transformOrigin: "left center" }}
                />
              </Link>
            </div>
          </div>

          <div className="mt-9 flex items-center gap-3 pt-6 border-t border-sumi/18 max-w-[46ch]">
            <span
              className="inline-block w-2 h-2 bg-vermillion rounded-full flex-shrink-0"
              style={{ animation: "hako-pulse 1.6s ease-in-out infinite" }}
            />
            <div className="ital text-[15px] text-moss leading-snug">
              <strong className="mincho not-italic font-semibold text-sumi tnum">
                {solvingNow.toLocaleString()}
              </strong>{" "}
              solving today
              {cityLabel && (
                <>
                  {" "}&middot;{" "}
                  <strong className="mincho not-italic font-semibold text-sumi tnum">
                    {cityCount!.count.toLocaleString()}
                  </strong>{" "}
                  in {cityCount!.city}
                </>
              )}
              {firstSolveTime && (
                <>
                  {" "}&middot; first solve at{" "}
                  <strong className="mincho not-italic font-semibold text-sumi tnum">
                    {firstSolveTime}
                  </strong>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="relative px-8 pt-14 pb-12 lg:p-16 bg-rice flex flex-col justify-center overflow-hidden">
          <div className="absolute top-6 left-6 right-6 flex justify-between items-center">
            <span className="mono text-[9.5px] tracking-[0.22em] uppercase text-moss">
              — preview · today&rsquo;s grid, mid-solve
            </span>
            <span className="mono text-[9.5px] tracking-[0.22em] uppercase text-moss">
              № {seqLabel}
            </span>
          </div>

          <div className="absolute top-[18px] right-[18px]">
            <VermillionStamp glyph="日" size={64} fontSize={34} rotate={8} />
          </div>

          <div className="mt-9 mx-auto w-full max-w-[440px]">
            <HeroBoard />
          </div>

          <div className="mt-6 text-center max-w-[440px] self-center ital text-[15px] text-moss leading-snug">
            — sumi numerals are <em className="text-vermillion-deep">given</em>;
            vermillion are <em className="text-vermillion-deep">yours</em>. The
            grid is the brand.
          </div>

          <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end mono text-[9.5px] tracking-[0.18em] uppercase text-moss">
            <div>
              seed <strong className="text-sumi font-medium">7b3c</strong> ·{" "}
              <strong className="text-sumi font-medium">21</strong> placed
            </div>
            <div>
              conflicts <strong className="text-sumi font-medium">0</strong> ·{" "}
              <strong className="text-sumi font-medium">60</strong> to go
            </div>
          </div>
        </div>
      </section>

      {/* ──────────── PRINCIPLES ──────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 border-b-[1.5px] border-sumi bg-bone">
        {[
          {
            num: "i · the rule",
            k: "静",
            title: "Quiet",
            body: (
              <>
                No streak-saver pop-ups, no ads, no &ldquo;you might also
                like.&rdquo; Two type families, one accent. The product never
                raises its voice.{" "}
                <em className="ital text-vermillion-deep">
                  If you miss a day, the streak just resets.
                </em>
              </>
            ),
          },
          {
            num: "ii · the rule",
            k: "日",
            title: "Daily",
            body: (
              <>
                One puzzle a day, the same one for everyone. It unlocks at
                midnight in your timezone and stays open for thirty hours.{" "}
                <em className="ital text-vermillion-deep">Casual mode</em> is
                always there if you want more.
              </>
            ),
          },
          {
            num: "iii · the rule",
            k: "完",
            title: "Finished",
            body: (
              <>
                The 完 seal prints once, off-axis, the moment the grid resolves.
                No confetti, no toast, no level-up.{" "}
                <em className="ital text-vermillion-deep">
                  You earn the mark; you do not chase it.
                </em>
              </>
            ),
          },
        ].map((p, i) => (
          <div
            key={p.k}
            className={
              "px-12 pt-12 pb-14 relative " +
              (i < 2 ? "border-b md:border-b-0 md:border-r-[1.5px] border-sumi" : "")
            }
          >
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-vermillion">
              {p.num}
            </div>
            <div className="mincho font-semibold text-[46px] text-sumi leading-none mt-3.5 -tracking-[0.01em]">
              {p.k}
            </div>
            <h3 className="mincho font-semibold text-[24px] mt-[18px] mb-2.5 -tracking-[0.005em] text-sumi">
              {p.title}
            </h3>
            <p className="text-[14.5px] leading-[1.6] text-moss max-w-[38ch]">
              {p.body}
            </p>
          </div>
        ))}
      </section>

      {/* ──────────── DIFFICULTY ──────────── */}
      <section className="px-8 py-16 lg:px-16 lg:py-20 border-b-[1.5px] border-sumi grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 lg:gap-12 items-start">
        <div>
          <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">
            § casual
          </div>
          <h2 className="mincho font-medium text-[42px] leading-none mt-3.5 -tracking-[0.01em] text-sumi">
            Or pick a difficulty
            <span className="text-vermillion">.</span>
          </h2>
          <p className="mt-[18px] text-[14.5px] leading-[1.6] text-moss max-w-[34ch]">
            Same engine, same number-pad, same coach — only the floor moves.{" "}
            <em className="ital text-vermillion-deep">Expert</em> is opt-in;
            daily is always Hard.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-[1.5px] border-sumi">
          {[
            { k: "易", lvl: "i", name: "Easy", stats: "avg 4:12 · 38 givens", href: "/play/easy" },
            { k: "中", lvl: "ii", name: "Medium", stats: "avg 8:30 · 30 givens", href: "/play/medium" },
            { k: "難", lvl: "iii", name: "Hard", stats: "avg 14:50 · 26 givens", href: "/play/hard" },
            { k: "極", lvl: "iv", name: "Expert", stats: "23:00+ · 22 givens", href: "/play/expert", accent: true },
          ].map((t, i, arr) => (
            <Link
              key={t.k}
              href={t.href}
              className={
                "p-6 min-h-[200px] flex flex-col justify-between transition-opacity hover:opacity-90 " +
                (i < arr.length - 1 ? "border-r-[1.5px] border-sumi " : "") +
                (i < 2 ? "border-b-[1.5px] border-sumi lg:border-b-0 " : "") +
                (t.accent ? "bg-vermillion text-bone" : "bg-bone")
              }
            >
              <div className="flex justify-between items-start">
                <div
                  className={
                    "mincho font-semibold text-[54px] leading-none -tracking-[0.02em] " +
                    (t.accent ? "text-bone" : "text-sumi")
                  }
                >
                  {t.k}
                </div>
                <div
                  className={
                    "mono text-[10px] tracking-[0.22em] uppercase " +
                    (t.accent ? "text-bone/70" : "text-moss")
                  }
                >
                  {t.lvl}
                </div>
              </div>
              <div>
                <div
                  className={
                    "mincho font-semibold text-[22px] -tracking-[0.005em] " +
                    (t.accent ? "text-bone" : "text-sumi")
                  }
                >
                  {t.name}
                </div>
                <div
                  className={
                    "mono text-[10.5px] tracking-[0.14em] uppercase mt-2 leading-relaxed " +
                    (t.accent ? "text-bone/70" : "text-moss")
                  }
                >
                  {t.stats}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ──────────── COACH + WIN MOMENT ──────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 border-b-[1.5px] border-sumi">
        <div className="p-10 lg:p-16 bg-bone border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi flex flex-col min-h-[520px]">
          <div className="mono text-[11px] tracking-[0.22em] uppercase text-vermillion">
            § 02 · the coach
          </div>
          <h2 className="mincho font-medium text-[40px] lg:text-[48px] leading-[1.02] mt-3.5 -tracking-[0.015em] text-sumi">
            Sensei,
            <br />
            not chatbot.
          </h2>
          <p className="text-[15.5px] leading-[1.6] mt-[18px] max-w-[42ch] text-sumi">
            An AI that never says the answer. It points at{" "}
            <em className="ital">where</em> to look, in one or two sentences, in
            the language of solving. Asking for a nudge feels like reading over
            a master&rsquo;s shoulder.
          </p>

          <div className="mt-8 bg-rice border-[1.5px] border-sumi p-[22px]">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-[26px] h-[26px] bg-vermillion text-bone flex items-center justify-center mincho font-semibold leading-none"
                  style={{ fontSize: 13 }}
                >
                  S
                </div>
                <div className="mincho font-semibold text-[14px] text-sumi">
                  Sensei
                </div>
              </div>
              <div className="mono text-[9.5px] tracking-[0.2em] uppercase text-moss flex items-center gap-1.5">
                <span
                  className="inline-block w-1.5 h-1.5 bg-vermillion rounded-full"
                  style={{ animation: "hako-pulse 1.6s ease-in-out infinite" }}
                />
                streaming
              </div>
            </div>
            <div className="mincho text-[15.5px] leading-[1.5] text-sumi">
              Look at the middle-right box. The{" "}
              <strong className="text-vermillion font-semibold">7</strong> can
              only live in one place — R6C8. Place it, and column 8 collapses.
              <span className="ital text-moss text-[14px] block mt-2">
                — want a hint instead? tap <em>nudge</em>, I won&rsquo;t say the
                answer.
              </span>
            </div>
          </div>
        </div>

        <div className="p-10 lg:p-16 bg-sumi text-bone flex flex-col min-h-[520px]">
          <div className="mono text-[11px] tracking-[0.22em] uppercase text-vermillion">
            § 03 · the moment
          </div>
          <h2 className="mincho font-medium text-[40px] lg:text-[48px] leading-[1.02] mt-3.5 -tracking-[0.015em] text-bone">
            One stroke,
            <br />
            one seal.
          </h2>
          <p className="text-[15.5px] leading-[1.6] mt-[18px] max-w-[42ch] text-moss-2">
            The minute the grid resolves, an ink stroke completes the puzzle
            and the <em className="ital text-bone">完</em> seal stamps off-axis
            on top of it. <em className="ital text-bone">Time is read, not
            displayed.</em> The stats sit below, like a deed in a ledger.
          </p>

          <div className="relative mt-8 bg-bone text-sumi p-7 border-[1.5px] border-sumi">
            <div className="absolute -top-[22px] right-8">
              <VermillionStamp glyph="完" size={64} fontSize={34} rotate={8} />
            </div>
            <div className="mono text-[9.5px] tracking-[0.22em] uppercase text-vermillion">
              完 · solved · daily № 0472
            </div>
            <div className="mincho font-semibold text-[40px] lg:text-[46px] text-sumi leading-none mt-1.5 -tracking-[0.01em]">
              In three&nbsp;minutes, forty-two.
            </div>
            <div className="grid grid-cols-3 mt-[18px] border-t border-sumi/18 border-b border-sumi/18 py-3">
              {[
                { lab: "time", v: "03:42", red: false },
                { lab: "streak", v: "22日", red: true },
                { lab: "rank · ала", v: "#14", red: false },
              ].map((m, i, arr) => (
                <div
                  key={m.lab}
                  className={
                    "px-3 " +
                    (i === 0 ? "pl-0 " : "") +
                    (i === arr.length - 1 ? "pr-0 " : "border-r border-sumi/18 ")
                  }
                >
                  <div className="mono text-[9.5px] tracking-[0.22em] uppercase text-moss mb-1">
                    {m.lab}
                  </div>
                  <div
                    className={
                      "mincho font-semibold text-[18px] tnum " +
                      (m.red ? "text-vermillion" : "text-sumi")
                    }
                  >
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
            <span className="ital text-moss text-[14px] mt-3.5 block">
              — faster than 71% of Almaty today.
            </span>
          </div>
        </div>
      </section>

      {/* ──────────── ACHIEVEMENTS TEASER ──────────── */}
      <section className="px-8 py-16 lg:px-16 lg:py-16 border-b-[1.5px] border-sumi bg-bone grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 lg:gap-12 items-center">
        <div>
          <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">
            § 04 · the marks
          </div>
          <h2 className="mincho font-medium text-[38px] leading-[1.05] mt-3.5 -tracking-[0.01em] text-sumi">
            Twelve marks a serious solver collects
            <span className="text-vermillion">.</span>
          </h2>
          <p className="mt-3.5 text-[14px] leading-[1.6] text-moss max-w-[32ch]">
            — streaks, speed, and six rare ones. Two stay hidden until you earn
            them.
          </p>
          <Link
            href="/achievements"
            className="mt-4 inline-block mono text-[10.5px] tracking-[0.22em] uppercase text-sumi border-b-[1.5px] border-vermillion pb-0.5"
          >
            See all twelve →
          </Link>
        </div>
        <div className="flex gap-[18px] flex-wrap">
          {[
            { g: "連", earned: true, nm: "Seven days" },
            { g: "月", earned: true, nm: "A month, kept" },
            { g: "百", earned: false, nm: "A hundred days" },
            { g: "速", earned: true, nm: "Under three" },
            { g: "鋭", earned: true, nm: "Sharp on Hard" },
            { g: "神", earned: false, nm: "Divine on Expert" },
            { g: "初", earned: true, nm: "First in" },
            { g: "暁", earned: true, nm: "Before dawn" },
            { g: "？", earned: false, nm: "A hidden mark" },
          ].map((a) => (
            <div
              key={a.nm}
              className="flex flex-col items-center gap-2.5 w-24"
            >
              {a.earned ? (
                <VermillionStamp glyph={a.g} size={72} fontSize={38} />
              ) : (
                <LockedStamp glyph={a.g} size={72} fontSize={38} />
              )}
              <div
                className={
                  "mincho font-semibold text-[11.5px] text-center leading-tight " +
                  (a.earned ? "text-sumi" : "text-moss")
                }
              >
                {a.nm}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────── FOOTER ──────────── */}
      <footer className="bg-sumi text-bone px-8 lg:px-16 pt-16 pb-9">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-end pb-9 border-b border-bone/12">
          <div>
            <h2 className="mincho font-medium text-[48px] lg:text-[64px] leading-[0.96] -tracking-[0.015em] text-bone m-0">
              Open the box.
              <span className="text-vermillion ml-2">箱</span>
            </h2>
            <p className="ital text-[18px] text-moss-2 mt-3.5 leading-[1.5] max-w-[50ch]">
              — the daily unlocks at{" "}
              <strong className="mincho not-italic font-semibold text-bone">
                00:00
              </strong>{" "}
              wherever you are. Free, no account needed; sign in to keep a
              streak.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 items-start">
            <Link
              href="/play/hard"
              className="btn-hako red"
              style={{ fontSize: 18, padding: "18px 28px" }}
            >
              Begin today{" "}
              <span className="font-jakarta font-light text-[20px]">→</span>
            </Link>
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-moss">
              no install · no email · ~12 minutes
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col md:flex-row md:justify-between gap-4 mono text-[10px] tracking-[0.18em] uppercase text-moss">
          <div>
            <strong className="text-bone font-medium">Hako</strong>
          </div>
          <div className="text-moss/60">v1.0 · {seqLabel}</div>
        </div>
      </footer>
    </main>
  );
}
