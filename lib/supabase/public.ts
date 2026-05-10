import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-less anon Supabase client for queries that don't depend on the
 * viewer (e.g. public reads cached cross-request via unstable_cache).
 *
 * Cannot be used inside unstable_cache when the underlying client touches
 * cookies — that's what this client avoids. Returns a stub on missing env
 * so cached callers degrade to empty data instead of crashing.
 */
let cached: SupabaseClient | null | undefined;

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
