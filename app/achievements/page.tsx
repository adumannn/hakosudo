import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/Masthead";
import { AchievementsBody } from "./AchievementsBody";
import { AchievementsBodySkeleton } from "@/components/skeletons/AchievementsBodySkeleton";

export const dynamic = "force-dynamic";

export default async function Achievements() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  const initial = user.email?.[0] ?? "·";

  return (
    <>
      <Masthead active="profile" initial={initial} email={user.email ?? null} />
      <main className="px-7 lg:px-14 py-12 lg:py-16 max-w-[1480px] mx-auto">
        <Link
          href="/profile"
          className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss hover:text-sumi"
        >
          ← back to profile
        </Link>

        <div className="mt-6 flex justify-between items-end gap-6 border-b-[1.5px] border-sumi pb-[18px]">
          <div>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-moss">
              § achievements
            </div>
            <h1 className="mincho font-medium text-[42px] leading-none mt-2 -tracking-[0.01em]">
              The full ledger
              <span className="text-vermillion ml-3.5 text-[0.7em] align-baseline">章</span>
            </h1>
          </div>
          <div className="mono text-[10.5px] tracking-[0.18em] uppercase text-moss text-right leading-relaxed">
            twelve marks total
          </div>
        </div>

        <p className="ital text-[16px] text-moss leading-snug max-w-[60ch] mt-6">
          — twelve marks a serious solver might collect. Earned and locked sit
          next to each other; two specials stay hidden until you find them.
        </p>

        <Suspense fallback={<AchievementsBodySkeleton />}>
          <AchievementsBody userId={user.id} />
        </Suspense>
      </main>
    </>
  );
}
