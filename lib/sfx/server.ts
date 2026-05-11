import { getProfile } from "@/lib/auth/identity";

export async function getSfxEnabledServer(): Promise<boolean> {
  const profile = await getProfile();
  return Boolean(profile?.sfx_enabled);
}
