import { config } from "dotenv";
config({ path: ".env.local" });

import { createAdminClient } from "../lib/supabase/admin";

interface SeedSkin {
  slug: string;
  kind: "season" | "premium" | "limited";
  name: string;
  kanji_label: string;
  seal_kanji: string;
  palette_key: string;
  masthead: string;
  start_date: string | null;
  end_date: string | null;
  price_cents: number | null;
}

const LAUNCH_SKINS: SeedSkin[] = [
  // Default fallback (premium-kind keeps it out of the season-date check; never sold).
  {
    slug: "default", kind: "premium", name: "Default",
    kanji_label: "完", seal_kanji: "完", palette_key: "default",
    masthead: "Today's box.",
    start_date: null, end_date: null, price_cents: null,
  },
  // 4 seasonal volumes for 2026.
  {
    slug: "spring-2026", kind: "season", name: "Spring 2026",
    kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
    masthead: "Today's bloom.",
    start_date: "2026-03-01", end_date: "2026-05-31", price_cents: null,
  },
  {
    slug: "summer-2026", kind: "season", name: "Summer 2026",
    kanji_label: "夏", seal_kanji: "蓮", palette_key: "summer",
    masthead: "Today's pond.",
    start_date: "2026-06-01", end_date: "2026-08-31", price_cents: null,
  },
  {
    slug: "autumn-2026", kind: "season", name: "Autumn 2026",
    kanji_label: "秋", seal_kanji: "楓", palette_key: "autumn",
    masthead: "Today's leaf.",
    start_date: "2026-09-01", end_date: "2026-11-30", price_cents: null,
  },
  {
    slug: "winter-2026", kind: "season", name: "Winter 2026",
    kanji_label: "冬", seal_kanji: "雪", palette_key: "winter",
    masthead: "Today's hush.",
    start_date: "2026-12-01", end_date: "2027-02-28", price_cents: null,
  },
  // Premium skins (catalog UI ships in Plan 2 — these are seeded now so the engine is ready).
  {
    slug: "sumi-e", kind: "premium", name: "Sumi-e",
    kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
    masthead: "Today's stroke.",
    start_date: null, end_date: null, price_cents: 300,
  },
  {
    slug: "indigo", kind: "premium", name: "Indigo",
    kanji_label: "藍", seal_kanji: "藍", palette_key: "indigo",
    masthead: "Today's depth.",
    start_date: null, end_date: null, price_cents: 300,
  },
];

async function main() {
  const sb = createAdminClient();
  if (!sb) {
    console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  console.log("Seeding skins...");
  for (const skin of LAUNCH_SKINS) {
    const { error } = await sb.from("skins").upsert(skin, { onConflict: "slug" });
    if (error) {
      console.error(`Failed to upsert ${skin.slug}:`, error);
      process.exit(1);
    }
    console.log(`  ✓ ${skin.slug}`);
  }

  // Validate seasons are non-overlapping (editorial constraint).
  const { data: seasons } = await sb
    .from("skins")
    .select("slug, start_date, end_date")
    .eq("kind", "season")
    .order("start_date", { ascending: true });
  if (seasons) {
    for (let i = 1; i < seasons.length; i++) {
      if (seasons[i].start_date! <= seasons[i - 1].end_date!) {
        console.error(
          `Overlap detected: ${seasons[i - 1].slug} (${seasons[i - 1].end_date}) vs ${seasons[i].slug} (${seasons[i].start_date})`,
        );
        process.exit(1);
      }
    }
  }
  console.log(`  ✓ ${seasons?.length ?? 0} seasons disjoint`);

  console.log("Backfilling daily_puzzles.skin_id by date range...");
  // Iterate dailies and assign by season range using the JS client (RPC `exec_sql`
  // is not available by default in Supabase; the plan suggested it as a primary
  // path with a fallback. Keep it simple: just iterate.)
  const { data: unset } = await sb
    .from("daily_puzzles")
    .select("date")
    .is("skin_id", null);
  for (const row of unset ?? []) {
    const season = (seasons ?? []).find(
      (s) => row.date >= s.start_date! && row.date <= s.end_date!,
    );
    if (!season) continue;
    const { data: seasonRow } = await sb.from("skins").select("id").eq("slug", season.slug).single();
    if (!seasonRow) continue;
    await sb.from("daily_puzzles").update({ skin_id: seasonRow.id }).eq("date", row.date);
  }

  console.log("Backfilling stragglers with default skin...");
  const { data: defaultSkin } = await sb.from("skins").select("id").eq("slug", "default").single();
  if (!defaultSkin) {
    console.error("Default skin not found after seed.");
    process.exit(1);
  }
  await sb.from("daily_puzzles").update({ skin_id: defaultSkin.id }).is("skin_id", null);

  const { count: stillNull } = await sb
    .from("daily_puzzles")
    .select("*", { count: "exact", head: true })
    .is("skin_id", null);
  if ((stillNull ?? 0) > 0) {
    console.error(`${stillNull} daily_puzzles rows still have NULL skin_id after backfill.`);
    process.exit(1);
  }
  console.log("  ✓ all daily_puzzles have skin_id");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
