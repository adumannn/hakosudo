import { redirect } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { SfxToggle } from "@/components/account/SfxToggle";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/auth/login");

  const initial = user.email?.[0] ?? "·";
  const { data: profile } = await sb
    .from("profiles")
    .select("sfx_enabled")
    .eq("id", user.id)
    .maybeSingle();

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
