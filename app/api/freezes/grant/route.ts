import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import {
  isFreezeSku,
  getFreezeQuantity,
  getFreezeAmountCents,
} from "@/lib/stripe/freeze-prices";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, sb } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { session_id?: string };
  const sessionId = body.session_id;
  if (!sessionId) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("[freezes/grant] missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(stripeSecret);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error("[freezes/grant] sessions.retrieve:", error);
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "unpaid" }, { status: 400 });
  }
  if (session.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sku = session.metadata?.sku ?? "";
  if (!isFreezeSku(sku)) {
    return NextResponse.json({ error: "bad-sku" }, { status: 400 });
  }
  const quantity = getFreezeQuantity(sku);
  const expectedAmountCents = getFreezeAmountCents(sku);
  if (session.amount_total !== expectedAmountCents) {
    console.error("[freezes/grant] amount mismatch:", {
      sessionId: session.id,
      sku,
      amount_total: session.amount_total,
      expectedAmountCents,
    });
    return NextResponse.json({ error: "bad-session" }, { status: 400 });
  }
  const amountCents = session.amount_total;

  const { data, error } = await sb.rpc("grant_freeze_credits", {
    p_user_id: user.id,
    p_session_id: session.id,
    p_sku: sku,
    p_quantity: quantity,
    p_amount_cents: amountCents,
  });
  if (error) {
    console.error("[freezes/grant] rpc:", error);
    return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
  }

  // RPC returns table(balance int, granted int); supabase-js wraps as [{balance, granted}].
  const row = Array.isArray(data) ? data[0] : data;
  const balance = (row?.balance as number) ?? 0;
  const granted = (row?.granted as number) ?? 0;
  return NextResponse.json({ ok: true, balance, granted });
}
