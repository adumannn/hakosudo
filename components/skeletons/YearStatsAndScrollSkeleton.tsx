import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

/** Stats triplet (stamped/streak/filled) + the year-scroll body. */
export function YearStatsAndScrollSkeleton() {
  return (
    <>
      <dl className="grid grid-cols-3 gap-x-10 gap-y-2 self-end">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-9 w-20 mt-1" />
          </div>
        ))}
      </dl>
      <section className="mt-10 lg:mt-14 relative">
        <SkeletonBox className="h-[420px] w-full" />
      </section>
    </>
  );
}
