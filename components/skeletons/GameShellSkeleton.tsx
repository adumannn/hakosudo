import Link from "next/link";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Mirrors the variant="game" Masthead + a 9x9 board placeholder + number-pad row. */
export function GameShellSkeleton() {
  return (
    <>
      <header className="masthead">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="stamp">日</div>
            <div className="name">Daily</div>
          </Link>
        </div>
        <div aria-hidden="true" className="flex items-center gap-3 sm:gap-6">
          <SkeletonBox className="h-6 w-16" />
          <SkeletonBox className="h-8 w-8 rounded-full" />
        </div>
      </header>
      <main className="px-4 py-6 max-w-[640px] mx-auto">
        <div
          aria-hidden="true"
          className="grid grid-cols-9 grid-rows-9 border-[2px] border-sumi"
          style={{ aspectRatio: "1 / 1" }}
        >
          {Array.from({ length: 81 }).map((_, i) => {
            const row = Math.floor(i / 9);
            const col = i % 9;
            const borderR = col % 3 === 2 && col !== 8 ? "border-r-2 border-r-sumi" : "border-r border-r-sumi/15";
            const borderB = row % 3 === 2 && row !== 8 ? "border-b-2 border-b-sumi" : "border-b border-b-sumi/15";
            return <div key={i} className={`${borderR} ${borderB}`} />;
          })}
        </div>
        <div className="mt-6 grid grid-cols-9 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonBox key={i} className="aspect-square" />
          ))}
        </div>
      </main>
    </>
  );
}
