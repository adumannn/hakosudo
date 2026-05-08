import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client backed by the service role key. Bypasses RLS.
 *
 * Server-only. NEVER import this from a client component, and never
 * surface results from this client back to a client without first
 * filtering them through the user's identity.
 *
 * Returns null when env vars are missing (e.g. local contributor setup
 * without secrets). Callers should treat the null case as a soft
 * failure: skip the elevated operation, do not throw.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
