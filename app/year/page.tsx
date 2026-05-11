// app/year/page.tsx
import Link from "next/link";
import { Suspense } from "react";
import { Masthead } from "@/components/Masthead";
import { getCurrentUser } from "@/lib/auth/identity";
import { todayUTC } from "@/lib/utils";
import { dateLine } from "@/lib/kanji";
import { YearStats } from "./YearStats";
import { YearScrollOnly } from "./YearScrollOnly";
import {
  YearStatsSkeleton,
  YearScrollSkeleton,
} from "@/components/skeletons/YearStatsAndScrollSkeleton";

export const dynamic = "force-dynamic";

export default async function YearPage() {
  const { user } = await getCurrentUser();
  const initial = user?.email?.[0] ?? "·";
  const today = todayUTC();
  const year = parseInt(today.slice(0, 4), 10);
  const yearKanjiDigits = String(year)
    .split("")
    .map((d) => "〇一二三四五六七八九"[parseInt(d, 10)])
    .join("");

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

          {user ? (
            <Suspense fallback={<YearStatsSkeleton />}>
              <YearStats userId={user.id} today={today} year={year} />
            </Suspense>
          ) : (
            <div />
          )}
        </header>

        {user ? (
          <Suspense fallback={<YearScrollSkeleton />}>
            <YearScrollOnly userId={user.id} today={today} year={year} />
          </Suspense>
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
