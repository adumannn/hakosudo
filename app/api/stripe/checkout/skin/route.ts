import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getPriceIdForSkinSlug, isPurchasableSlug } from "@/lib/stripe/skin-prices";

export async function POST(req: Request) {
  const sb = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();
  if (userError) {
    // Auth service failure (AuthApiError, network) — surface as 5xx, not a login redirect.
    console.error("[stripe/checkout/skin] auth.getUser:", userError);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));
  }

  // Form-encoded body: { slug: "sumi-e" }
  // We accept slug rather than skin_id so the form action is stable across DB resets.
  const form = await req.formData();
  const slug = String(form.get("slug") ?? "");

  if (!isPurchasableSlug(slug)) {
    return NextResponse.json({ error: "skin not purchasable" }, { status: 400 });
  }

  const priceId = getPriceIdForSkinSlug(slug);
  if (!priceId) {
    // Slug is in the allow-list but the env var is unset — config error, not user error.
    console.error(`[stripe/checkout/skin] missing price id for slug=${slug}`);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }

  // Look up skin_id for the metadata so the (future) webhook can insert
  // user_skin_entitlements directly without a slug→id round-trip.
  const { data: skin, error: skinError } = await sb
    .from("skins")
    .select("id")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (skinError) {
    console.error("[stripe/checkout/skin] skins.select:", skinError);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!skin) {
    return NextResponse.json({ error: "skin not found" }, { status: 404 });
  }

  // Guard env var explicitly: stripe-node v17 throws synchronously from new Stripe()
  // when the key is missing/undefined, which would escape the try/catch below.
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("[stripe/checkout/skin] missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  const stripe = new Stripe(stripeSecretKey);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/skins?purchased=${encodeURIComponent(slug)}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/skins?canceled=1`,
      // Stripe rejects null/undefined customer_email; only include when present.
      // OAuth users without an email still get a session — Stripe collects email at checkout.
      ...(user.email ? { customer_email: user.email } : {}),
      metadata: { user_id: user.id, skin_id: skin.id, skin_slug: slug },
    });
  } catch (error) {
    console.error("[stripe/checkout/skin] checkout.sessions.create:", error);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  if (!session.url) {
    console.error("[stripe/checkout/skin] session created without url:", session.id);
    return NextResponse.json({ error: "checkout temporarily unavailable" }, { status: 503 });
  }
  // TODO(stripe): implement webhook to insert user_skin_entitlements row on
  // `checkout.session.completed`. For prototype, manually run in Supabase SQL editor:
  //   insert into user_skin_entitlements (user_id, skin_id, source)
  //   values ('<user-uuid>', '<skin-uuid>', 'purchase');
  return NextResponse.redirect(session.url, { status: 303 });
}
