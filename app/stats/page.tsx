import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils";

export default async function Stats() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: games } = await sb
    .from("games")
    .select("difficulty,is_complete,elapsed_seconds,created_at")
    .eq("user_id", user.id);

  const all = games ?? [];
  const completed = all.filter((g) => g.is_complete);
  const byDiff = (d: string) => completed.filter((g) => g.difficulty === d);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const days = new Set<string>(completed.map((g) => g.created_at.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return (
    <main className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Your Stats</h1>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Games Played" value={all.length} />
        <Stat label="Wins" value={completed.length} />
        <Stat
          label="Win Rate"
          value={`${all.length ? Math.round((completed.length / all.length) * 100) : 0}%`}
        />
        <Stat label="Current Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
      </div>
      <h2 className="text-lg font-semibold mb-3">Average time</h2>
      <div className="grid grid-cols-2 gap-3">
        {(["easy", "medium", "hard", "expert"] as const).map((diff) => (
          <Stat
            key={diff}
            label={diff}
            value={formatTime(Math.round(avg(byDiff(diff).map((g) => g.elapsed_seconds))))}
          />
        ))}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs text-muted-foreground capitalize">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
