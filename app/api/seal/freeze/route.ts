import { NextResponse } from "next/server";
import { getCurrentUser, getProfile } from "@/lib/auth/identity";
import { computeAllotment, chooseFreezeSource } from "@/lib/seal/freeze";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, sb } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  const body = (await req.json().catch(() => null)) as { date?: string } | null;
  if (!body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "bad-date" }, { status: 400 });
  }
  const parsed = new Date(`${body.date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== body.date) {
    return NextResponse.json({ error: "bad-date" }, { status: 400 });
  }

  const targetMs = Date.parse(body.date + "T23:59:59Z");
  const ageHours = (Date.now() - targetMs) / 1000 / 3600;
  if (ageHours < 0 || ageHours > 24) {
    return NextResponse.json({ error: "out-of-window" }, { status: 400 });
  }

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "no-profile" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await sb
    .from("daily_results")
    .select("date")
    .eq("user_id", userId)
    .eq("date", body.date)
    .maybeSingle();
  if (existingError) {
    console.error("[seal/freeze] daily_results lookup:", existingError);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ error: "already-completed" }, { status: 400 });
  }

  const grantedMonth = body.date.slice(0, 7) + "-01";
  const { count, error: countError } = await sb
    .from("streak_freezes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("granted_month", grantedMonth);
  if (countError) {
    console.error("[seal/freeze] streak_freezes count:", countError);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  const used = count ?? 0;
  const allotment = profile.is_pro ? computeAllotment(profile.created_at, grantedMonth) : 0;

  const source = chooseFreezeSource(profile, used, allotment);

  if (source === "none") {
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }

  if (source === "allotment") {
    const { error } = await sb.from("streak_freezes").insert({
      user_id: userId,
      date: body.date,
      granted_month: grantedMonth,
    });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "already-frozen" }, { status: 400 });
      }
      console.error("[seal/freeze] insert:", error);
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      source: "allotment" as const,
      remaining_allotment: Math.max(0, allotment - used - 1),
      balance: profile.freeze_credits,
    });
  }

  // source === "credit"
  const { data: newBalance, error: rpcError } = await sb.rpc("consume_freeze_credit", {
    p_user_id: userId,
    p_date: body.date,
    p_granted_month: grantedMonth,
  });
  if (rpcError) {
    console.error("[seal/freeze] rpc consume:", rpcError);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  if (typeof newBalance !== "number" || newBalance < 0) {
    return NextResponse.json({ error: "no-freezes" }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    source: "credit" as const,
    remaining_allotment: Math.max(0, allotment - used),
    balance: newBalance,
  });
}
