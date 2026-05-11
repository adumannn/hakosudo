import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * **Use in:** server code that must bypass Row-Level Security — webhooks,
 * admin operations, batch jobs.
 *
 * **DANGER:** RLS is bypassed. Never pass user input through this client
 * without explicit authorization checks first. Prefer `createServerClient`
 * for anything that should respect user permissions.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
