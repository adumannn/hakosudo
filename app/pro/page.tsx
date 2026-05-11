import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function Pro() {
  await requireUser();
  const profile = await getProfile();

  if (profile?.is_pro) {
    return (
      <main className="bg-seal text-bone min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="seal-stamp w-[88px] h-[88px] text-[40px] mx-auto rotate-[7deg]">
            完
          </div>
          <h1 className="h-disp text-[clamp(44px,9vw,64px)] text-bone mt-6">You&rsquo;re Pro.</h1>
          <p className="ital text-bone/60 mt-3 text-[18px]">
            Thanks for keeping the seal clean.
          </p>
          <Link
            href="/"
            className="btn-hako ghost mt-8 border-bone text-bone justify-center"
          >
            home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-seal text-bone min-h-screen relative">
      {/* Top bar */}
      <div className="flex justify-between items-center px-8 py-5 border-b border-bone/10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-vermillion text-bone flex items-center justify-center mincho font-bold text-[14px]">
            箱
          </div>
          <div className="mincho font-semibold text-[16px]">Hako Pro</div>
        </Link>
        <Link
          href="/"
          className="mono text-[11px] tracking-[0.2em] text-bone/65 uppercase hover:text-bone"
        >
          close ×
        </Link>
      </div>

      {/* Centered column */}
      <div className="max-w-[520px] mx-auto px-8 py-16 lg:py-24 text-center">
        <div className="eyebrow red">一 · one tier · one price</div>
        <h2 className="h-disp text-[clamp(48px,10vw,80px)] mt-4 text-bone leading-[0.95]">
          A quieter
          <br />
          box.
        </h2>
        <p className="ital text-bone/65 text-[18px] md:text-[20px] mt-4 leading-[1.45]">
          Three things. Nothing else.
        </p>

        <ul className="list-none p-0 mt-12 text-left">
          <li className="pro-bn">
            <div className="pro-bk">先</div>
            <div>
              <div className="pro-bt">Unlimited coach.</div>
              <div className="pro-bd">
                Ask as often as you want.
              </div>
            </div>
          </li>
          <li className="pro-bn">
            <div className="pro-bk">極</div>
            <div>
              <div className="pro-bt">Expert &amp; archive.</div>
              <div className="pro-bd">
                極 difficulty, plus every past Daily.
              </div>
            </div>
          </li>
          <li className="pro-bn last">
            <div className="pro-bk">完</div>
            <div>
              <div className="pro-bt">Every skin.</div>
              <div className="pro-bd">
                The full library, yours while you&rsquo;re a member.
              </div>
            </div>
          </li>
        </ul>

        <div className="mt-12 flex items-baseline justify-center gap-3.5 flex-wrap">
          <span className="kdate-jp text-[48px] text-bone font-semibold">
            $4
          </span>
          <span className="mono text-[12px] tracking-[0.2em] text-bone/65 uppercase">
            / month · 月
          </span>
        </div>

        <form action="/api/stripe/checkout" method="POST">
          <button className="btn-hako red mt-6 w-full justify-between">
            Begin Pro <span className="font-jakarta font-light text-lg">→</span>
          </button>
        </form>
        <p className="text-[11px] text-bone/45 mt-3.5">
          Cancel from settings, any time.
        </p>
      </div>
    </main>
  );
}
