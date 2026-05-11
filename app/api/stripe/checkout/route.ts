import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/identity";

export async function POST() {
  const { user } = await getCurrentUser();
  if (!user)
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_SITE_URL!));

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID_PRO!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pro?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pro?cancel=true`,
    customer_email: user.email,
    metadata: { user_id: user.id },
  });
  // TODO(stripe): implement webhook to set profiles.is_pro = true on
  // `customer.subscription.created`. For prototype, manually run in Supabase SQL editor:
  //   update profiles set is_pro = true where id = '<your-uuid>';
  return NextResponse.redirect(session.url!, { status: 303 });
}
