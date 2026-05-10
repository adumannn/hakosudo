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

async function fetchTodaySealBundleUncached(date: string): Promise<TodaySealBundle> {
  const sb = createPublicClient();
  if (!sb) return { cal: null, line: null, sealKanji: "完" };

  const [
    { data: cal },
    { data: line },
    { data: puzzle },
  ] = await Promise.all([
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

  const sealKanji =
    (puzzle?.skins as unknown as { seal_kanji: string } | null)?.seal_kanji ?? "完";
  return {
    cal: (cal as TodaySealRow | null) ?? null,
    line: (line as { line: string | null } | null)?.line ?? null,
    sealKanji,
  };
}

export function getTodaySealBundle(date: string): Promise<TodaySealBundle> {
  return unstable_cache(
    () => fetchTodaySealBundleUncached(date),
    ["home:today-seal-bundle", date],
    { revalidate: 3600, tags: ["daily-seal", `daily-seal:${date}`] },
  )();
}

// Daily seq lookup — by date, fully static for the day.
export function getDailySeq(date: string): Promise<number | null> {
  return unstable_cache(
    async (): Promise<number | null> => {
      const sb = createPublicClient();
      if (!sb) return null;
      const { data } = await sb
        .from("daily_puzzles")
        .select("seq")
        .eq("date", date)
        .maybeSingle();
      return (data as { seq: number } | null)?.seq ?? null;
    },
    ["home:daily-seq", date],
    { revalidate: 86400, tags: ["daily-puzzles", `daily-puzzles:${date}`] },
  )();
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

// Public snapshot — what the marketing landing & home need. Cached briefly so
// "solving now" stays roughly fresh without crushing the DB on every visit.
export function getPublicDailySnapshot(date: string): Promise<DailySnapshotRaw> {
  return unstable_cache(
    async (): Promise<DailySnapshotRaw> => {
      const sb = createPublicClient();
      if (!sb) return { rows: [], activeGames: 0 };

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const [
        { data: snapshotRows },
        { count: activeGames },
      ] = await Promise.all([
        sb
          .from("daily_results")
          .select("user_id,elapsed_seconds,city,created_at,profiles(username)")
          .eq("date", date)
          .order("elapsed_seconds", { ascending: true })
          .order("created_at", { ascending: true }),
        sb
          .from("games")
          .select("*", { count: "exact", head: true })
          .eq("is_complete", false)
          .gte("updated_at", fifteenMinAgo),
      ]);

      type RawRow = {
        user_id: string;
        elapsed_seconds: number;
        city: string | null;
        created_at: string;
        profiles: { username: string | null } | null;
      };
      const rows = ((snapshotRows ?? []) as unknown as RawRow[]).map((r) => ({
        user_id: r.user_id,
        username: r.profiles?.username ?? "anon",
        elapsed_seconds: r.elapsed_seconds,
        city: r.city,
        created_at: r.created_at,
      }));
      return { rows, activeGames: activeGames ?? 0 };
    },
    ["home:public-snapshot", date],
    { revalidate: 30, tags: ["daily-snapshot", `daily-snapshot:${date}`] },
  )();
}
