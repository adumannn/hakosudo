import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/Masthead";
import { SkinCard } from "@/components/skins/SkinCard";
import { SkinChip } from "@/components/skins/SkinChip";
import { getViewer } from "@/lib/skins/viewer";
import { getCatalogAction } from "@/lib/skins/catalog";

export const dynamic = "force-dynamic";

export default async function SkinsPage({
  searchParams,
}: {
  searchParams: { purchased?: string; canceled?: string };
}) {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const viewer = await getViewer();
  const today = new Date().toISOString().slice(0, 10);
  const initial = (user.email ?? "·")[0] ?? "·";

  const seasons = viewer.allSkins
    .filter((s) => s.kind === "season")
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  const premium = viewer.allSkins.filter(
    (s) => s.kind === "premium" && s.slug !== "default",
  );
  const limited = viewer.allSkins
    .filter((s) => s.kind === "limited")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="min-h-screen bg-bone">
      <Masthead
        active="skins"
        initial={initial}
        email={user.email ?? null}
        rightChip={<SkinChip />}
      />

      <div className="max-w-[960px] mx-auto px-6 md:px-10 pt-10 pb-20">
        <header className="mb-12">
          <div className="eyebrow red">巻 · back issues &amp; editions</div>
          <h1 className="h-disp text-[clamp(40px,8vw,64px)] mt-2 text-sumi leading-[0.95]">
            The skin rack.
          </h1>
          <p className="ital text-sumi/65 text-[18px] mt-3 max-w-[560px]">
            Seasons come in print, then file as back issues. Premium editions stay on the
            shelf. Challenge unlocks reward streaks and milestones. Pro members wear any
            of them; one-off purchases stay yours.
          </p>
        </header>

        {searchParams.purchased && (
          <div
            role="status"
            className="border border-vermillion/30 bg-vermillion/5 px-5 py-4 mb-10"
          >
            <div className="mono text-[11px] tracking-[0.18em] uppercase text-vermillion">
              thanks
            </div>
            <div className="mincho text-[14px] text-sumi mt-1">
              Your purchase is processing. The skin will appear in your library once
              payment confirms.
            </div>
          </div>
        )}

        {searchParams.canceled && (
          <div className="mono text-[11px] tracking-[0.18em] uppercase text-moss mb-10">
            checkout canceled · no charge
          </div>
        )}

        <section className="mb-16">
          <h2 className="mincho text-[20px] text-sumi mb-6">Seasonal volumes · 季</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {seasons.map((s) => (
              <SkinCard key={s.id} skin={s} action={getCatalogAction(s, viewer, today)} />
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="mincho text-[20px] text-sumi mb-6">Premium editions · 別</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {premium.map((s) => (
              <SkinCard key={s.id} skin={s} action={getCatalogAction(s, viewer, today)} />
            ))}
          </div>
        </section>

        {limited.length > 0 && (
          <section className="mb-16">
            <h2 className="mincho text-[20px] text-sumi mb-6">Challenge unlocks · 限</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {limited.map((s) => (
                <SkinCard key={s.id} skin={s} action={getCatalogAction(s, viewer, today)} />
              ))}
            </div>
          </section>
        )}

        {!viewer.isPro && (
          <footer className="border-t border-sumi/12 pt-10 text-center">
            <div className="ital text-sumi/65 text-[16px] mb-4">
              or go Pro — every skin, every season, every back issue.
            </div>
            <Link href="/pro" className="btn-hako red">
              See Pro
            </Link>
          </footer>
        )}
      </div>
    </main>
  );
}
