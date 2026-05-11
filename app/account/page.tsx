import { Masthead } from "@/components/Masthead";
import { SfxToggle } from "@/components/account/SfxToggle";
import { requireUser, getProfile } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await requireUser();
  const profile = await getProfile();
  const initial = user.email?.[0] ?? "·";

  return (
    <>
      <Masthead initial={initial} email={user.email ?? null} />
      <main className="max-w-[760px] mx-auto px-6 py-10 lg:py-14">
        <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss mb-3">
          settings
        </div>
        <h1 className="mincho text-[42px] leading-none font-medium text-sumi m-0">
          Preferences
        </h1>
        <div className="mt-8">
          <SfxToggle initialEnabled={Boolean(profile?.sfx_enabled)} />
        </div>
      </main>
    </>
  );
}
