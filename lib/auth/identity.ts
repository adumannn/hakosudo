import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

export interface Identity {
  user: User | null;
  sb: SupabaseClient;
}

export const getCurrentUser = cache(async (): Promise<Identity> => {
  const sb = createServerClient();
  if (!hasSupabaseAuthCookie(cookies().getAll())) {
    return { user: null, sb };
  }
  const { data: { user }, error } = await sb.auth.getUser();
  if (error) console.error("[auth/identity] auth.getUser:", error);
  return { user, sb };
});

export async function requireUser(): Promise<{ user: User; sb: SupabaseClient }> {
  const { user, sb } = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return { user, sb };
}

export interface Profile {
  id: string;
  city: string | null;
  is_pro: boolean;
  active_skin_id: string | null;
  username: string | null;
  sfx_enabled: boolean;
  created_at: string;
  freeze_credits: number;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const { user, sb } = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id,city,is_pro,active_skin_id,username,sfx_enabled,created_at,freeze_credits")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("[auth/identity] profiles.select:", error);
  return (data as Profile | null) ?? null;
});
