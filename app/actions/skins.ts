"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/identity";
import { canApplyOverride } from "@/lib/skins/resolve";
import { getViewer } from "@/lib/skins/viewer";

export type SetActiveSkinResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "not found" | "not entitled" | "write failed" };

export async function setActiveSkin(skinId: string | null): Promise<SetActiveSkinResult> {
  const { user, sb } = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (skinId === null) {
    const { error } = await sb
      .from("profiles")
      .update({ active_skin_id: null })
      .eq("id", user.id);
    if (error) {
      console.error("[actions/skins] clear failed:", error);
      return { ok: false, error: "write failed" };
    }
    revalidatePath("/", "layout");
    revalidatePath("/skins");
    return { ok: true };
  }

  const viewer = await getViewer();
  const skin = viewer.allSkins.find((s) => s.id === skinId);
  if (!skin) return { ok: false, error: "not found" };

  const allowed = canApplyOverride({
    isPro: viewer.isPro,
    skin,
    ownedSkinIds: viewer.ownedSkinIds,
  });
  if (!allowed) return { ok: false, error: "not entitled" };

  const { error } = await sb
    .from("profiles")
    .update({ active_skin_id: skinId })
    .eq("id", user.id);
  if (error) {
    console.error("[actions/skins] update failed:", error);
    return { ok: false, error: "write failed" };
  }
  revalidatePath("/", "layout");
  revalidatePath("/skins");
  return { ok: true };
}
