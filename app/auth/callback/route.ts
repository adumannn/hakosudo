import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    await createServerClient().auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", req.url));
}
