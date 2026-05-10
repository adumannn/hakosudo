import { createServerClient } from "@/lib/supabase/server";
import type { SkinRecord } from "./types";

export interface Viewer {
  userId: string | null;
  isPro: boolean;
  activeSkinId: string | null;
  ownedSkinIds: Set<string>;
  allSkins: SkinRecord[];
}

const EMPTY_VIEWER: Viewer = {
  userId: null,
  isPro: false,
  activeSkinId: null,
  ownedSkinIds: new Set(),
  allSkins: [],
};

export async function getViewer(): Promise<Viewer> {
  const sb = createServerClient();

  const logQueryError = (where: string, error: unknown) => {
    if (error) console.error(`[skins/viewer] ${where}:`, error);
  };

  const { data: skinsRaw, error: skinsError } = await sb
    .from("skins")
    .select(
      "id,slug,kind,name,kanji_label,seal_kanji,palette_key,masthead,start_date,end_date,price_cents,active",
    )
    .eq("active", true);
  logQueryError("skins.select", skinsError);
  const allSkins: SkinRecord[] = (skinsRaw ?? []) as unknown as SkinRecord[];

  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();
  logQueryError("auth.getUser", userError);

  if (!user) {
    return { ...EMPTY_VIEWER, allSkins };
  }

  const [
    { data: profile, error: profileError },
    { data: ents, error: entsError },
  ] = await Promise.all([
    sb.from("profiles").select("active_skin_id,is_pro").eq("id", user.id).maybeSingle(),
    sb.from("user_skin_entitlements").select("skin_id").eq("user_id", user.id),
  ]);
  logQueryError("profiles.select", profileError);
  logQueryError("user_skin_entitlements.select", entsError);

  return {
    userId: user.id,
    isPro: profile?.is_pro ?? false,
    activeSkinId: profile?.active_skin_id ?? null,
    ownedSkinIds: new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id)),
    allSkins,
  };
}
