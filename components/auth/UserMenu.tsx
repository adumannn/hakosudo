import Link from "next/link";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import { createServerClient } from "@/lib/supabase/server";
import { computeAllotment } from "@/lib/seal/freeze";
import { SignOutButton } from "./SignOutButton";
import { UserMenuClient } from "./UserMenuClient";

export async function UserMenu() {
  const { user } = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/auth/login" className="text-sm hover:underline">
        Sign in
      </Link>
    );
  }

  const profile = await getProfile();
  let allotmentRemaining = 0;
  if (profile?.is_pro) {
    const sb = createServerClient();
    const grantedMonth = new Date().toISOString().slice(0, 7) + "-01";
    const { count } = await sb
      .from("streak_freezes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("granted_month", grantedMonth);
    const used = count ?? 0;
    const allotment = computeAllotment(profile.created_at, grantedMonth);
    allotmentRemaining = Math.max(0, allotment - used);
  }

  return (
    <UserMenuClient
      email={user.email ?? null}
      displayName={user.email?.split("@")[0] ?? "Account"}
      signOut={<SignOutButton />}
      freezeBalance={profile?.freeze_credits ?? 0}
      isPro={profile?.is_pro ?? false}
      allotmentRemaining={allotmentRemaining}
    />
  );
}
