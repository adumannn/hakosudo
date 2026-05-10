import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { GameShell } from "@/components/game/GameShell";
import { todayUTC } from "@/lib/utils";
import { Difficulty } from "@/lib/sudoku/types";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";
import { getSfxEnabledServer } from "@/lib/sfx/server";

export default async function Daily() {
  const sb = createServerClient();
  const date = todayUTC();
  const { data } = await sb
    .from("daily_puzzles")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  if (!data) notFound();

  const [skin, sfxEnabled] = await Promise.all([
    resolveActiveSkinServer({ surface: "daily", dailyDate: date }),
    getSfxEnabledServer(),
  ]);

  return (
    <div data-skin={skin.paletteKey}>
      <SkinProvider skin={skin}>
        <GameShell
          difficulty={data.difficulty as Difficulty}
          puzzle={{ givens: data.givens, solution: data.solution }}
          dailyDate={date}
          dailyNumber={data.seq}
          sfxEnabled={sfxEnabled}
        />
      </SkinProvider>
    </div>
  );
}
