import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// Today's seal calendar row, sensei line, and puzzle skin are essentially
// static for the day. We cache them in one round-trip-free fetch keyed by
// date so signed-out marketing visits don't hammer the DB.

export interface TodaySealRow {
  date: string;
  kanji: string;
  romaji: string;
  meaning: string;
}

export interface TodaySealBundle {
  cal: TodaySealRow | null;
  line: string | null;
  sealKanji: string;
}

const EMPTY_SEAL_BUNDLE: TodaySealBundle = { cal: null, line: null, sealKanji: "完" };

async function fetchTodaySealBundleUncached(date: string): Promise<TodaySealBundle> {
  const sb = createPublicClient();
  if (!sb) return EMPTY_SEAL_BUNDLE;

  const [calRes, lineRes, puzzleRes] = await Promise.all([
    sb
      .from("daily_seal_calendar")
      .select("date,kanji,romaji,meaning")
      .eq("date", date)
      .maybeSingle(),
    sb
      .from("daily_seal_lines")
      .select("line")
      .eq("date", date)
      .maybeSingle(),
    sb
      .from("daily_puzzles")
      .select("skins(seal_kanji)")
      .eq("date", date)
      .maybeSingle(),
  ]);
  if (calRes.error) throw calRes.error;
  if (lineRes.error) throw lineRes.error;
  if (puzzleRes.error) throw puzzleRes.error;

  const sealKanji =
    (puzzleRes.data?.skins as unknown as { seal_kanji: string } | null)?.seal_kanji ?? "完";
  return {
    cal: (calRes.data as TodaySealRow | null) ?? null,
    line: (lineRes.data as { line: string | null } | null)?.line ?? null,
    sealKanji,
  };
}

export async function getTodaySealBundle(date: string): Promise<TodaySealBundle> {
  try {
    return await unstable_cache(
      () => fetchTodaySealBundleUncached(date),
      ["home:today-seal-bundle", date],
      { revalidate: 3600, tags: ["daily-seal", `daily-seal:${date}`] },
    )();
  } catch (err) {
    console.error("[home-data] getTodaySealBundle failed:", err);
    return EMPTY_SEAL_BUNDLE;
  }
}

// Daily seq lookup — by date, fully static for the day.
export async function getDailySeq(date: string): Promise<number | null> {
  try {
    return await unstable_cache(
      async (): Promise<number | null> => {
        const sb = createPublicClient();
        if (!sb) return null;
        const { data, error } = await sb
          .from("daily_puzzles")
          .select("seq")
          .eq("date", date)
          .maybeSingle();
        if (error) throw error;
        return (data as { seq: number } | null)?.seq ?? null;
      },
      ["home:daily-seq", date],
      { revalidate: 86400, tags: ["daily-puzzles", `daily-puzzles:${date}`] },
    )();
  } catch (err) {
    console.error("[home-data] getDailySeq failed:", err);
    return null;
  }
}

export interface SnapshotRow {
  user_id: string;
  username: string;
  elapsed_seconds: number;
  city: string | null;
  created_at: string;
}

export interface DailySnapshotRaw {
  rows: SnapshotRow[];
  activeGames: number;
}

// Date-scoped daily results for the snapshot. Cached briefly so the leaderboard
// preview / first-solve / median don't requery on every visit. activeGames is
// intentionally NOT bundled here — it's a global "right now" count that spans
// daily + casual play and shouldn't fork its cache by date (see below).
export function getPublicDailyResults(date: string): Promise<SnapshotRow[]> {
  return unstable_cache(
    async (): Promise<SnapshotRow[]> => {
      const sb = createPublicClient();
      if (!sb) return [];
      const { data, error } = await sb
        .from("daily_results")
        .select("user_id,elapsed_seconds,city,created_at,profiles(username)")
        .eq("date", date)
        .order("elapsed_seconds", { ascending: true })
        .order("created_at", { ascending: true });
      // Throw rather than fall through to []. unstable_cache won't memoize
      // a thrown error, so a transient blip won't poison the 30s TTL with
      // a bogus "empty leaderboard" snapshot.
      if (error) throw error;
      type RawRow = {
        user_id: string;
        elapsed_seconds: number;
        city: string | null;
        created_at: string;
        profiles: { username: string | null } | null;
      };
      return ((data ?? []) as unknown as RawRow[]).map((r) => ({
        user_id: r.user_id,
        username: r.profiles?.username ?? "anon",
        elapsed_seconds: r.elapsed_seconds,
        city: r.city,
        created_at: r.created_at,
      }));
    },
    ["home:public-results", date],
    { revalidate: 30, tags: ["daily-snapshot", `daily-snapshot:${date}`] },
  )();
}

// "Solving now" — any in-progress game (daily or casual) updated in the last
// 15 minutes. Date-independent on purpose: it's a global liveness counter, not
// a per-day metric, so the cache key is also date-independent.
export function getActiveGamesCount(): Promise<number> {
  return unstable_cache(
    async (): Promise<number> => {
      const sb = createPublicClient();
      if (!sb) return 0;
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count, error } = await sb
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("is_complete", false)
        .gte("updated_at", fifteenMinAgo);
      // Fail fast — caching `0` on a query failure would silently render
      // "nobody solving now" for 30s, which is worse than a server error.
      if (error) throw error;
      return count ?? 0;
    },
    ["home:active-games"],
    { revalidate: 30, tags: ["active-games"] },
  )();
}

// Convenience wrapper preserving the previous shape, fanning the two caches
// out in parallel. Each helper throws on a real Supabase error so a transient
// blip doesn't poison the 30s cache with [] / 0 — we catch here and degrade
// gracefully rather than 500 the whole homepage. unstable_cache doesn't
// memoize the thrown error, so the next request retries.
export async function getPublicDailySnapshot(date: string): Promise<DailySnapshotRaw> {
  const [rows, activeGames] = await Promise.all([
    getPublicDailyResults(date).catch((err) => {
      console.error("[home-data] getPublicDailyResults failed:", err);
      return [] as SnapshotRow[];
    }),
    getActiveGamesCount().catch((err) => {
      console.error("[home-data] getActiveGamesCount failed:", err);
      return 0;
    }),
  ]);
  return { rows, activeGames };
}
