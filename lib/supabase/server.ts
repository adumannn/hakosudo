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
// loudly so we notice missing coverage during dev. We cast through `unknown`
// at the boundary because the null client deliberately doesn't implement the
// full Supabase client surface — pages only consume `.from()` chains and the
// auth methods covered here.
type NullQueryStub = {
  select: () => NullQueryStub;
  eq: () => NullQueryStub;
  order: () => NullQueryStub;
  limit: () => NullQueryStub;
  gte: () => NullQueryStub;
  lte: () => NullQueryStub;
  maybeSingle: () => Promise<{ data: null; error: null; count: 0 }>;
  insert: () => Promise<{ data: null; error: null; count: 0 }>;
  upsert: () => Promise<{ data: null; error: null; count: 0 }>;
  then: (resolve: (v: { data: null; error: null; count: 0 }) => unknown) => unknown;
};

function makeNullClient() {
  const noData = async () => ({ data: null, error: null, count: 0 as const });
  const queryStub: NullQueryStub = {
    select: () => queryStub,
    eq: () => queryStub,
    order: () => queryStub,
    limit: () => queryStub,
    gte: () => queryStub,
    lte: () => queryStub,
    maybeSingle: () => noData(),
    insert: () => noData(),
    upsert: () => noData(),
    then: (resolve) => resolve({ data: null, error: null, count: 0 }),
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: () => queryStub,
  } as unknown as ReturnType<typeof create>;
}
