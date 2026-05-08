import { createServerClient as create } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client. Falls back to a `null`-shaped no-op client
 * when env vars are absent so server components don't crash during a
 * misconfigured deploy. Callers already use safe-access patterns
 * (`?.`, try/catch around queries) so this degrades gracefully.
 */
export const createServerClient = () => {
  const store = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return makeNullClient();
  }
  return create(url, key, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        try {
          store.set({ name, value, ...options });
        } catch {}
      },
      remove: (name: string, options: CookieOptions) => {
        try {
          store.set({ name, value: "", ...options });
        } catch {}
      },
    },
  });
};

// Minimal stub matching the surface our pages use. Anything else throws
// loudly so we notice missing coverage during dev.
function makeNullClient() {
  const noData = async () => ({ data: null, error: null });
  const queryStub: any = {
    select: () => queryStub,
    eq: () => queryStub,
    order: () => queryStub,
    limit: () => queryStub,
    maybeSingle: () => noData(),
    then: (resolve: (v: { data: null; error: null }) => unknown) =>
      resolve({ data: null, error: null }),
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => queryStub,
  } as any;
}
