import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";
import { dateLine } from "@/lib/kanji";

export default function Loading() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const yearKanjiDigits = String(year)
    .split("")
    .map((d) => "〇一二三四五六七八九"[parseInt(d, 10)])
    .join("");

  return (
    <>
      <MastheadSkeleton />
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
          <YearStatsAndScrollSkeletonStatsOnly />
        </header>

        <YearStatsAndScrollSkeletonScrollOnly />
      </main>
    </>
  );
}

/* The two halves of the skeleton are inlined here so the header stats
 * can sit inside the <header> grid while the scroll lives below it. */
function YearStatsAndScrollSkeletonStatsOnly() {
  return (
    <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <SkeletonBox className="h-3 w-16" />
          <SkeletonBox className="h-9 w-20 mt-1" />
        </div>
      ))}
    </dl>
  );
}

function YearStatsAndScrollSkeletonScrollOnly() {
  return (
    <section className="mt-10 lg:mt-14 relative">
      <SkeletonBox className="h-[420px] w-full" />
    </section>
  );
}
