import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";
import {
  isFreezeSku,
  getFreezePriceId,
  getFreezeQuantity,
} from "@/lib/stripe/freeze-prices";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user } = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  const form = await req.formData();
  const sku = String(form.get("sku") ?? "");
  if (!isFreezeSku(sku)) {
    return NextResponse.json({ error: "bad-sku" }, { status: 400 });
  }

  const priceId = getFreezePriceId(sku);
  if (!priceId) {
    console.error(`[freezes/checkout] missing price id for sku=${sku}`);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("[freezes/checkout] missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(stripeSecret);

  const quantity = getFreezeQuantity(sku);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/freezes/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/freezes/cancel`,
      ...(user.email ? { customer_email: user.email } : {}),
      metadata: { user_id: user.id, sku, quantity: String(quantity) },
    });
  } catch (error) {
    console.error("[freezes/checkout] checkout.sessions.create:", error);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!session.url) {
    console.error("[freezes/checkout] session created without url:", session.id);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
