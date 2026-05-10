import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { SkinRecord } from "./types";

export interface Viewer {
  userId: string | null;
  email: string | null;
  isPro: boolean;
  activeSkinId: string | null;
  ownedSkinIds: Set<string>;
  allSkins: SkinRecord[];
}

const EMPTY_VIEWER: Viewer = {
  userId: null,
  email: null,
  isPro: false,
  activeSkinId: null,
  ownedSkinIds: new Set(),
  allSkins: [],
};

// Skins are essentially static config (~10 rows, edited rarely). Cross-request
// cache keeps SSR off the auth-shared Supabase pool for this read. The inner
// fetch must not touch cookies(), so we use the cookieless anon client.
const fetchAllSkinsCached = unstable_cache(
  async (): Promise<SkinRecord[]> => {
    const sb = createPublicClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("skins")
      .select(
        "id,slug,kind,name,kanji_label,seal_kanji,palette_key,masthead,start_date,end_date,price_cents,active",
      )
      .eq("active", true);
    if (error) throw error;
    return (data ?? []) as unknown as SkinRecord[];
  },
  ["skins:active:v1"],
  { revalidate: 3600, tags: ["skins"] },
);

// Wrapper so a Supabase blip on the skins read can't 500 the layout (which
// renders on every page). The cache won't memoize the throw, so the next
// request retries; in the meantime callers get an empty list and degrade
// gracefully.
async function fetchAllSkins(): Promise<SkinRecord[]> {
  try {
    return await fetchAllSkinsCached();
  } catch (err) {
    console.error("[skins/viewer] skins.select failed:", err);
    return [];
  }
}

// React cache() dedupes within a single request: layout, /skins page, and
// <SkinChip /> all call getViewer(); without this, each call re-queries
// Supabase. With cache, the first call's promise is reused.
export const getViewer = cache(async (): Promise<Viewer> => {
  const sb = createServerClient();

  const logQueryError = (where: string, error: unknown) => {
    if (error) console.error(`[skins/viewer] ${where}:`, error);
  };

  // Skins (cached cross-request) and the auth check are independent — fire in parallel.
  const [allSkins, userResult] = await Promise.all([
    fetchAllSkins(),
    sb.auth.getUser(),
  ]);
  const { data: { user }, error: userError } = userResult;
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
    email: user.email ?? null,
    isPro: profile?.is_pro ?? false,
    activeSkinId: profile?.active_skin_id ?? null,
    ownedSkinIds: new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id)),
    allSkins,
  };
});
