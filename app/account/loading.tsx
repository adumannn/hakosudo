import { MastheadSkeleton } from "@/components/skeletons/MastheadSkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

export default function Loading() {
  return (
    <>
      <MastheadSkeleton />
      <main className="max-w-[760px] mx-auto px-6 py-10 lg:py-14">
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-[42px] w-64 mt-3" />
        <div className="mt-8">
          <SkeletonBox className="h-[68px] w-full" />
        </div>
      </main>
    </>
  );
}
