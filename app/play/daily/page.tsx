import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { GameShell } from "@/components/game/GameShell";
import { todayUTC } from "@/lib/utils";
import { Difficulty } from "@/lib/sudoku/types";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";
import { getSfxEnabledServer } from "@/lib/sfx/server";
import { getViewer } from "@/lib/skins/viewer";

export default async function Daily() {
  const sb = createServerClient();
  const date = todayUTC();
  const [{ data }, { data: cal }] = await Promise.all([
    sb.from("daily_puzzles").select("*").eq("date", date).maybeSingle(),
    sb
      .from("daily_seal_calendar")
      .select("kanji,romaji,meaning")
      .eq("date", date)
      .maybeSingle(),
  ]);
  if (!data) notFound();

  const [viewer, sfxEnabled] = await Promise.all([
    getViewer(),
    getSfxEnabledServer(),
  ]);
  const skin = await resolveActiveSkinServer({ surface: "daily", dailyDate: date, viewer });

  type DailyKanjiRow = { kanji: string; romaji: string; meaning: string };
  const dailyKanji = (cal as DailyKanjiRow | null) ?? null;

  return (
    <div data-skin={skin.paletteKey}>
      <SkinProvider skin={skin}>
        <GameShell
          difficulty={data.difficulty as Difficulty}
          puzzle={{ givens: data.givens, solution: data.solution }}
          dailyDate={date}
          dailyNumber={data.seq}
          dailyKanji={dailyKanji}
          sfxEnabled={sfxEnabled}
          signedIn={!!viewer.userId}
        />
      </SkinProvider>
    </div>
  );
}
