import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { getCity } from "@/lib/geo";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = (await req.json()) as {
    date: string;
    finalState: string;
    elapsed: number;
    consentCity: boolean;
  };

  const { data: daily } = await sb
    .from("daily_puzzles")
    .select("*")
    .eq("date", body.date)
    .maybeSingle();
  if (!daily) return NextResponse.json({ error: "no-daily" }, { status: 404 });

  if (body.finalState !== daily.solution)
    return NextResponse.json({ error: "wrong-solution" }, { status: 400 });
  if (body.elapsed < daily.min_seconds)
    return NextResponse.json({ error: "too-fast" }, { status: 400 });

  // City: profile-set value wins. Fall back to Vercel header for users
  // who haven't picked a city yet, but only if they consented.
  let city: string | null = null;
  if (body.consentCity) {
    const { data: profile } = await sb
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .maybeSingle();
    city = profile?.city ?? getCity();
  }

  const { error } = await sb.from("daily_results").upsert(
    {
      date: body.date,
      user_id: user.id,
      elapsed_seconds: body.elapsed,
      city,
    },
    { onConflict: "date,user_id" }
  );

  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  // The home page snapshot is cached cross-request — fresh solve invalidates it
  // so "first solve / solving now / median" reflect this submission immediately.
  revalidateTag(`daily-snapshot:${body.date}`);
  return NextResponse.json({ ok: true });
}
