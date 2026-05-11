import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import { computeUnifiedStreak } from "@/lib/seal/streak";

export const runtime = "edge";

interface Params { params: { date: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const date = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("bad-date", { status: 400 });
  }

  const { user, sb } = await getCurrentUser();

  const { data: cal } = await sb
    .from("daily_seal_calendar")
    .select("kanji,romaji,meaning")
    .eq("date", date)
    .maybeSingle();
  if (!cal) return new Response("no-seal", { status: 404 });

  let elapsed: number | null = null;
  let streak = 0;
  let dayIndex = 0;
  if (user) {
    const userId = user.id;
    const year = date.slice(0, 4);
    const [{ data: result }, { data: results }, { data: freezes }] = await Promise.all([
      sb.from("daily_results").select("elapsed_seconds")
        .eq("user_id", userId).eq("date", date).maybeSingle(),
      sb.from("daily_results").select("date")
        .eq("user_id", userId).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
      sb.from("streak_freezes").select("date")
        .eq("user_id", userId).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    ]);
    elapsed = result?.elapsed_seconds ?? null;
    const completed = new Set(((results ?? []) as { date: string }[]).map((r) => r.date));
    const frozen = new Set(((freezes ?? []) as { date: string }[]).map((f) => f.date));
    streak = computeUnifiedStreak(date, completed, frozen);
    dayIndex = Math.floor(
      (Date.parse(date + "T00:00:00Z") - Date.parse(`${year}-01-01T00:00:00Z`)) / 86400000,
    ) + 1;
  }

  const timeStr = elapsed != null
    ? `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`
    : "—";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080, height: 1080, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "#f5efe2", color: "#1c1c1a",
          fontFamily: "serif", position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 36, right: 54, color: "#b8330a", fontSize: 64, transform: "rotate(-4deg)" }}>箱</div>

        <div style={{
          width: 504, height: 504,
          border: "5px solid rgba(28,28,26,0.4)",
          background: "rgba(28,28,26,0.03)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 330, lineHeight: 1, position: "relative",
        }}>
          {cal.kanji}
          <div style={{
            position: "absolute", bottom: 30, right: 30,
            width: 78, height: 78, borderRadius: 999,
            background: "#b8330a", color: "#f5efe2",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 42, fontWeight: 700, transform: "rotate(-6deg)",
          }}>✓</div>
        </div>

        <div style={{ marginTop: 60, fontSize: 36, letterSpacing: 6, color: "#1c1c1a", textTransform: "uppercase", fontFamily: "monospace" }}>
          {timeStr} · streak {streak}d · day {dayIndex}/365
        </div>

        <div style={{ position: "absolute", bottom: 54, left: 54, fontSize: 28, color: "#6a5f4a", letterSpacing: 6, fontFamily: "monospace" }}>
          HAKO · {date.replace(/-/g, ".")}
        </div>
        <div style={{ position: "absolute", bottom: 54, right: 54, fontSize: 28, color: "#6a5f4a", letterSpacing: 4, fontFamily: "monospace" }}>
          hako.app
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
