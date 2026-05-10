// scripts/seed-seal-calendar.ts
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { assignKanjiForRange } from "@/lib/seal/calendar";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Seed from the start of the current year so the year scroll has every day
// of the current year populated, then continue ~2 years forward.
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const startStr =
  process.env.SEAL_SEED_START ?? `${today.getUTCFullYear()}-01-01`;
const DAYS_AHEAD = Number.parseInt(process.env.SEAL_SEED_DAYS ?? "730", 10);

if (
  !/^\d{4}-\d{2}-\d{2}$/.test(startStr) ||
  Number.isNaN(Date.parse(`${startStr}T00:00:00Z`))
) {
  throw new Error(`invalid SEAL_SEED_START: "${startStr}" (expected YYYY-MM-DD)`);
}
if (!Number.isInteger(DAYS_AHEAD) || DAYS_AHEAD <= 0) {
  throw new Error(
    `invalid SEAL_SEED_DAYS: "${process.env.SEAL_SEED_DAYS}" (expected positive integer)`,
  );
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  console.log(`seeding ${DAYS_AHEAD} days from ${startStr}`);
  const entries = assignKanjiForRange(startStr, DAYS_AHEAD);

  const chunkSize = 200;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize).map((e) => ({
      date: e.date,
      kanji: e.kanji,
      romaji: e.romaji,
      meaning: e.meaning,
    }));
    const { error } = await sb.from("daily_seal_calendar").upsert(chunk, { onConflict: "date" });
    if (error) {
      console.error("chunk failed:", error);
      process.exit(1);
    }
    console.log(`upserted ${i + chunk.length} / ${entries.length}`);
  }
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
