// app/api/seal/freeze/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { computeAllotment } from "@/lib/seal/freeze";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json()) as { date?: string };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "bad-date" }, { status: 400 });
  }

  // 24-hour window: target date must already have ended (ageHours >= 0,
  // i.e. not today or future) and must not be more than 24h past
  // (ageHours <= 24). Today is rejected because today's daily is still
  // playable; the UI's freezePrompt only ever sends yesterday's date.
  const targetMs = Date.parse(body.date + "T23:59:59Z");
  const ageHours = (Date.now() - targetMs) / 1000 / 3600;
  if (ageHours < 0 || ageHours > 24) {
    return NextResponse.json({ error: "out-of-window" }, { status: 400 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_pro) {
    return NextResponse.json({ error: "pro-only" }, { status: 403 });
  }

  // Allotment check
  const grantedMonth = body.date.slice(0, 7) + "-01";
  const { count } = await sb
    .from("streak_freezes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("granted_month", grantedMonth);
  const used = count ?? 0;
  const allotment = computeAllotment(profile.created_at, grantedMonth);
  if (used >= allotment) {
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }

  // Already completed? No freeze needed.
  const { data: existing } = await sb
    .from("daily_results")
    .select("date")
    .eq("user_id", userId)
    .eq("date", body.date)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already-completed" }, { status: 400 });
  }

  const { error } = await sb.from("streak_freezes").insert({
    user_id: userId,
    date: body.date,
    granted_month: grantedMonth,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already-frozen" }, { status: 400 });
    }
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, remaining: allotment - used - 1 });
}

