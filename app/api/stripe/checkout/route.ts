import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";

export async function POST() {
  const { user } = await getCurrentUser();

  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let siteBase: URL | null = null;
  if (rawSiteUrl) {
    try {
      siteBase = new URL(rawSiteUrl);
    } catch {
      siteBase = null;
    }
  }

  if (!user) {
    if (!siteBase) {
      console.error("[stripe/checkout] missing or malformed NEXT_PUBLIC_SITE_URL");
      return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/auth/login", siteBase), { status: 303 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const proPriceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!stripeSecretKey || !proPriceId || !siteBase) {
    console.error("[stripe/checkout] missing checkout config");
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }

  const stripe = new Stripe(stripeSecretKey);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url: new URL("/pro?success=true", siteBase).toString(),
      cancel_url: new URL("/pro?cancel=true", siteBase).toString(),
      customer_email: user.email,
      metadata: { user_id: user.id },
    });
  } catch (error) {
    console.error("[stripe/checkout] checkout.sessions.create:", error);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!session.url) {
    console.error("[stripe/checkout] session created without url:", session.id);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  // TODO(stripe): implement webhook to set profiles.is_pro = true on
  // `customer.subscription.created`. For prototype, manually run in Supabase SQL editor:
  //   update profiles set is_pro = true where id = '<your-uuid>';
  return NextResponse.redirect(session.url, { status: 303 });
}
