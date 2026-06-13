import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { withTimeout } from "@/lib/promise/with-timeout";

// Hard ceiling on the auth-token refresh. A healthy round-trip to Supabase is
// well under this; the cap exists so a slow or hung call can never push the
// middleware past the platform's invocation timeout (504) and take the whole
// site down. On timeout we fall through to the catch and serve the page —
// protected routes still re-validate auth downstream via the server client.
const AUTH_REFRESH_TIMEOUT_MS = 3000;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  // If env vars aren't configured (e.g. preview deploys without secrets),
  // skip the auth refresh entirely instead of crashing the request.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  if (!hasSupabaseAuthCookie(req.cookies.getAll())) return res;

  try {
    const sb = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (
          cookies: { name: string; value: string; options: CookieOptions }[]
        ) => {
          cookies.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    });
    await withTimeout(sb.auth.getUser(), AUTH_REFRESH_TIMEOUT_MS);
  } catch (err) {
    // Network blip, cookie corruption, key mismatch, or a stalled call that
    // blew past AUTH_REFRESH_TIMEOUT_MS — none of these should bring down the
    // whole site. Log for observability and serve the page.
    console.error("[middleware] supabase getUser failed:", err);
  }

  return res;
}

export const config = {
  // Run on app routes only. Skip Next.js internals, static assets, and the
  // /api/* surface (which handles its own auth where it needs to).
  matcher: [
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
