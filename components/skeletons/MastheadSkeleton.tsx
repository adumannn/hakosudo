import Link from "next/link";

/**
 * Mirrors the default-variant <Masthead> chrome shape. Server component, no client JS.
 * The Hako stamp + name remain real (instant render); nav links and avatar are placeholders.
 */
export function MastheadSkeleton() {
  return (
    <header className="masthead">
      <div className="flex items-center gap-3 md:gap-7">
        <div aria-hidden="true" className="md:hidden size-8 border border-sumi/15" />
        <Link href="/" className="flex items-center gap-2.5">
          <div className="stamp">箱</div>
          <div className="name">Hako</div>
        </Link>
        <nav aria-hidden="true" className="hidden md:flex gap-[22px]">
          {[36, 44, 40, 32, 44, 24].map((w, i) => (
            <span
              key={i}
              className="inline-block h-3 bg-sumi/[0.06]"
              style={{ width: w }}
            />
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-[16px] md:gap-[22px]">
        <div aria-hidden="true" className="size-8 bg-sumi/[0.04] border border-sumi/10" />
      </div>
    </header>
  );
}
