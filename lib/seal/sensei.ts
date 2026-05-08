import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const SENSEI_SYSTEM_PROMPT = `You are the Sensei in a Japanese-aesthetic daily sudoku app. Each calendar day has a featured kanji. Write ONE micro-line introducing today's kanji.

Constraints:
- 8 to 14 words.
- Present tense, declarative, no questions.
- No mention of sudoku, puzzles, players, or solving.
- Reference the kanji's character or imagery, not its English meaning literally.
- Spare and grounded. No emoji. No exclamations.

Return ONLY the line. No quotes, no preamble.`;

export interface SenseiInput {
  kanji: string;
  romaji: string;
  meaning: string;
}

/** Generate a Sensei micro-line. Throws on API failure. */
export async function generateSenseiLine(input: SenseiInput): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const userMessage = `Kanji: ${input.kanji} (${input.romaji}, "${input.meaning}").`;
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 80,
    system: SENSEI_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = res.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") throw new Error("no-text");
  return block.text.trim().replace(/^["']|["']$/g, "");
}

/** Read or write the cached line for a given date.
 *
 * Read uses the regular server client (table is world-readable).
 * Write uses the admin client because `daily_seal_lines` has no
 * INSERT policy by design — see migration 0005. If service-role envs
 * are missing the cache write is skipped silently and the live-
 * generated line is still returned.
 */
export async function getOrCreateLine(
  date: string,
  kanji: { kanji: string; romaji: string; meaning: string },
): Promise<string | null> {
  const sb = createServerClient();
  const { data: cached } = await sb
    .from("daily_seal_lines")
    .select("line")
    .eq("date", date)
    .maybeSingle();
  if (cached?.line) return cached.line;

  let line: string;
  try {
    line = await generateSenseiLine(kanji);
  } catch {
    // Generation failed; UI will omit the line.
    return null;
  }

  const admin = createAdminClient();
  if (admin) {
    // Best-effort cache write. A duplicate-key race (two simultaneous
    // first-of-day requests) is acceptable: the loser's row insert hits
    // 23505 inside Supabase and is reported as `error` rather than thrown.
    await admin.from("daily_seal_lines").insert({ date, line });
  }
  return line;
}
