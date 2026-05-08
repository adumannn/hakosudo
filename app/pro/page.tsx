import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Sparkles, Palette, ShieldOff } from "lucide-react";

export default async function Pro() {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_pro) {
    return (
      <main className="container max-w-md py-12">
        <h1 className="text-3xl font-bold mb-4">You're Pro</h1>
        <p className="text-muted-foreground">Thanks for supporting the app.</p>
      </main>
    );
  }

  return (
    <main className="container max-w-md py-12">
      <h1 className="text-3xl font-bold mb-2">Sudoku Pro</h1>
      <p className="text-muted-foreground mb-6">$4.99 / month</p>
      <ul className="space-y-3 mb-8">
        <li className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 mt-0.5 text-primary" />
          <div>
            <div className="font-medium">Unlimited AI Coach</div>
            <div className="text-sm text-muted-foreground">No daily cap on hints from Claude.</div>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Palette className="h-5 w-5 mt-0.5 text-primary" />
          <div>
            <div className="font-medium">Custom themes</div>
            <div className="text-sm text-muted-foreground">Pick from extra accent colors.</div>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <ShieldOff className="h-5 w-5 mt-0.5 text-primary" />
          <div>
            <div className="font-medium">Ad-free</div>
            <div className="text-sm text-muted-foreground">Reserved placement only — no ads in v1.</div>
          </div>
        </li>
      </ul>
      <form action="/api/stripe/checkout" method="POST">
        <Button type="submit" className="w-full">Upgrade</Button>
      </form>
    </main>
  );
}
