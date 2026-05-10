import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { GameShell } from "@/components/game/GameShell";
import { Difficulty } from "@/lib/sudoku/types";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";
import { getSfxEnabledServer } from "@/lib/sfx/server";

const VALID = ["easy", "medium", "hard", "expert"] as const;

export default async function Page({ params }: { params: { difficulty: string } }) {
  if (!VALID.includes(params.difficulty as Difficulty)) notFound();
  const sb = createServerClient();
  const { data } = await sb
    .from("puzzles")
    .select("id,givens,solution")
    .eq("difficulty", params.difficulty)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data?.length) notFound();
  const pick = data[Math.floor(Math.random() * data.length)];

  // Casual surface: user override (Pro-only) or current-date season fallback.
  const [skin, sfxEnabled] = await Promise.all([
    resolveActiveSkinServer({ surface: "casual" }),
    getSfxEnabledServer(),
  ]);

  return (
    <div data-skin={skin.paletteKey}>
      <SkinProvider skin={skin}>
        <GameShell
          difficulty={params.difficulty as Difficulty}
          puzzle={pick}
          sfxEnabled={sfxEnabled}
        />
      </SkinProvider>
    </div>
  );
}
