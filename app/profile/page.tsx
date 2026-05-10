import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/Masthead";
import { UsernamePicker } from "@/components/profile/UsernamePicker";
import { ProfileBody } from "./ProfileBody";
import { ProfileStreakBlock } from "./ProfileStreakBlock";
import { ProfileLastOpened } from "./ProfileLastOpened";
import { ProfileBodySkeleton } from "@/components/skeletons/ProfileBodySkeleton";
import { SkeletonBox } from "@/components/skeletons/SkeletonBox";

export const dynamic = "force-dynamic";

const STAMP_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export default async function Profile() {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  // Fetch the small profile row needed by the synchronous left-rail header.
  // ProfileBody/ProfileStreakBlock fetch the heavy data themselves via cache().
  const { data: profile } = await sb
    .from("profiles")
    .select("created_at,city,username")
    .eq("id", user.id)
    .maybeSingle();

  const initial = user.email?.[0] ?? "·";
  const emailHandle = user.email?.split("@")[0] ?? user.id.slice(0, 8);
  const username = profile?.username?.trim() || emailHandle;
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const headlineSize = displayName.length > 14 ? 28 : displayName.length > 10 ? 34 : 42;
  const cityLabel = (profile?.city ?? "—").trim() || "—";
  const today = new Date().toISOString().slice(0, 10);
  const daysOnHako = profile?.created_at
    ? Math.max(
        0,
        Math.floor(
          (new Date(today + "T00:00:00Z").getTime() -
            new Date(profile.created_at).getTime()) /
            86_400_000,
        ),
      )
    : 0;
  const userCreatedAt = profile?.created_at ?? null;

  return (
    <>
      <Masthead active="profile" initial={initial} email={user.email ?? null} />

      <main>
        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] border-b-[1.5px] border-sumi bg-bone">
          {/* Left rail */}
          <div className="bg-rice border-b lg:border-b-0 lg:border-r-[1.5px] border-sumi p-10 lg:px-12 lg:py-14 flex flex-col gap-9">
            <div>
              <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss mb-3.5 truncate" title={`/u/${username} · ${cityLabel}`}>
                /u/{username} · {cityLabel}
              </div>
              <div
                className="relative w-20 h-20 bg-vermillion text-bone flex items-center justify-center mincho font-bold leading-none mb-[18px]"
                style={{ fontSize: 48 }}
              >
                <span className="relative z-10">{initial.toUpperCase()}</span>
                <span
                  aria-hidden
                  className="absolute inset-0 mix-blend-multiply pointer-events-none"
                  style={{ backgroundImage: STAMP_NOISE }}
                />
              </div>
              <h1
                className="mincho font-medium leading-none -tracking-[0.015em] text-sumi m-0 break-words"
                style={{ fontSize: headlineSize }}
                title={displayName}
              >
                {displayName}
              </h1>
              <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-moss mt-2.5 flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[200px]" title={`@${username}`}>
                  @{username}
                </span>
                {daysOnHako > 0 && <span>· {daysOnHako}日 on Hako</span>}
                <UsernamePicker current={username} />
              </div>
              <p className="mt-[18px] ital text-[17px] text-moss leading-snug max-w-[30ch]">
                — solver on Hako.
              </p>
            </div>

            <Suspense
              fallback={
                <div className="pt-7 border-t border-sumi/18">
                  <SkeletonBox className="h-3 w-24" />
                  <SkeletonBox className="h-[112px] w-32 mt-2" />
                  <SkeletonBox className="h-3 w-3/4 mt-3" />
                </div>
              }
            >
              <ProfileStreakBlock userId={user.id} userCreatedAt={userCreatedAt} />
            </Suspense>

            <div className="mt-auto pt-6 border-t border-sumi/18">
              <Link
                href="/play/daily"
                className="btn-hako"
                style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
              >
                Continue today&rsquo;s box{" "}
                <span className="font-jakarta font-light text-[18px]">→</span>
              </Link>
              <Suspense fallback={null}>
                <ProfileLastOpened userId={user.id} userCreatedAt={userCreatedAt} />
              </Suspense>
            </div>
          </div>

          {/* Right column */}
          <div className="p-8 lg:p-12 flex flex-col gap-12">
            <Suspense fallback={<ProfileBodySkeleton />}>
              <ProfileBody userId={user.id} userCreatedAt={userCreatedAt} />
            </Suspense>
          </div>
        </section>
      </main>
    </>
  );
}
