import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Cookieless anonymous Supabase client.
 *
 * **Use in:** cached read paths that don't depend on user identity, such
 * as the skins catalog or the daily seal calendar. Compatible with
 * `next/cache`'s `unstable_cache` (no `cookies()` reads inside).
 *
 * **Don't use in:** user-scoped reads — use `createServerClient` (or the
 * helpers in `lib/auth/identity.ts`) so RLS sees the authenticated user.
 */
export function createPublicClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
