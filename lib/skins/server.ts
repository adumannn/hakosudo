import { createServerClient } from "@/lib/supabase/server";
import { resolveActiveSkin } from "./resolve";
import type { SkinRecord, SkinResolved, Surface } from "./types";

interface ResolveServerArgs {
  surface: Surface;
  dailyDate?: string;        // YYYY-MM-DD when surface === "daily"
}

export async function resolveActiveSkinServer(args: ResolveServerArgs): Promise<SkinResolved> {
  const sb = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Failed reads are logged and treated as empty so the resolver falls back
  // to its hardcoded default — better than throwing during SSR.
  const logQueryError = (where: string, error: unknown) => {
    if (error) console.error(`[skins/server] ${where}:`, error);
  };

  // Fetch all active skins (small table — 7 rows at launch).
  const { data: skinsRaw, error: skinsError } = await sb
    .from("skins")
    .select("id,slug,kind,name,kanji_label,seal_kanji,palette_key,masthead,start_date,end_date,price_cents,active")
    .eq("active", true);
  logQueryError("skins.select", skinsError);
  const skins: SkinRecord[] = (skinsRaw ?? []) as unknown as SkinRecord[];

  // Fetch the user's profile (active_skin_id, is_pro) and entitlements.
  const { data: { user }, error: userError } = await sb.auth.getUser();
  logQueryError("auth.getUser", userError);
  let activeSkinId: string | null = null;
  let isPro = false;
  let ownedSkinIds = new Set<string>();
  if (user) {
    const [
      { data: profile, error: profileError },
      { data: ents, error: entsError },
    ] = await Promise.all([
      sb.from("profiles").select("active_skin_id,is_pro").eq("id", user.id).maybeSingle(),
      sb.from("user_skin_entitlements").select("skin_id").eq("user_id", user.id),
    ]);
    logQueryError("profiles.select", profileError);
    logQueryError("user_skin_entitlements.select", entsError);
    activeSkinId = profile?.active_skin_id ?? null;
    isPro = profile?.is_pro ?? false;
    ownedSkinIds = new Set((ents ?? []).map((e: { skin_id: string }) => e.skin_id));
  }

  // For daily surface, look up the daily's skin_id.
  let dailySkinId: string | null = null;
  if (args.surface === "daily" && args.dailyDate) {
    const { data: daily, error: dailyError } = await sb
      .from("daily_puzzles")
      .select("skin_id")
      .eq("date", args.dailyDate)
      .maybeSingle();
    logQueryError("daily_puzzles.select", dailyError);
    dailySkinId = daily?.skin_id ?? null;
  }

  return resolveActiveSkin({
    surface: args.surface,
    activeSkinId,
    isPro,
    ownedSkinIds,
    dailySkinId,
    today,
    skins,
  });
}
