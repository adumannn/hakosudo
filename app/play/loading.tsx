import Link from "next/link";
import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

const TIERS = [
  { k: "易", lvl: "i", name: "Easy", stats: "avg 4:12 · 38 givens", href: "/play/easy" },
  { k: "中", lvl: "ii", name: "Medium", stats: "avg 8:30 · 30 givens", href: "/play/medium" },
  { k: "難", lvl: "iii", name: "Hard", stats: "avg 14:50 · 26 givens", href: "/play/hard" },
  { k: "極", lvl: "iv", name: "Expert", stats: "23:00+ · 22 givens", href: "/play/expert", accent: true },
];

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="px-8 py-14 lg:px-16 lg:py-20 max-w-[1200px] mx-auto">
        <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">§ casual</div>
        <SkeletonBox className="h-[56px] w-72 mt-3.5" />
        <SkeletonBox className="h-3 w-full max-w-[40ch] mt-5" />
        <SkeletonBox className="h-3 w-3/4 max-w-[40ch] mt-2" />
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 border-[1.5px] border-sumi">
          {TIERS.map((t, i, arr) => (
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
                <div className={"mincho font-semibold text-[54px] leading-none -tracking-[0.02em] " + (t.accent ? "text-bone" : "text-sumi")}>
                  {t.k}
                </div>
                <div className={"mono text-[10px] tracking-[0.22em] uppercase " + (t.accent ? "text-bone/70" : "text-moss")}>
                  {t.lvl}
                </div>
              </div>
              <div>
                <div className={"mincho font-semibold text-[22px] -tracking-[0.005em] " + (t.accent ? "text-bone" : "text-sumi")}>
                  {t.name}
                </div>
                <div className={"mono text-[10.5px] tracking-[0.14em] uppercase mt-2 leading-relaxed " + (t.accent ? "text-bone/70" : "text-moss")}>
                  {t.stats}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
