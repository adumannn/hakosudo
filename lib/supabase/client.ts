import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * **Use in:** client components that need realtime subscriptions,
 * client-side mutations, or auth-state subscriptions (`onAuthStateChange`).
 *
 * **Don't use in:** server components, actions, or API routes — use
 * `createServerClient` (or the cached helpers in `lib/auth/identity.ts`)
 * instead.
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
