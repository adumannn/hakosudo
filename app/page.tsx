import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";

const difficulties = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
  { key: "expert", label: "Expert" },
];

export default async function Home() {
  return (
    <main className="container py-8 max-w-3xl">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Sudoku</h1>
        <div className="flex gap-2 items-center">
          <Link href="/leaderboard" className="text-sm hover:underline">Leaderboard</Link>
          <Link href="/stats" className="text-sm hover:underline">Stats</Link>
          <UserMenu />
          <ThemeToggle />
        </div>
      </header>
      <Link href="/play/daily" className="block rounded-lg border p-6 mb-6 hover:bg-accent">
        <div className="font-semibold mb-1">Daily Challenge</div>
        <div className="text-sm text-muted-foreground">One puzzle for everyone, every day.</div>
      </Link>
      <div className="grid grid-cols-2 gap-3">
        {difficulties.map((d) => (
          <Link key={d.key} href={`/play/${d.key}`} className="rounded-lg border p-6 hover:bg-accent">
            <div className="font-semibold">{d.label}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
