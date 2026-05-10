export function hasSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && /-auth-token(?:\.\d+)?$/.test(name);
}

export function hasSupabaseAuthCookie(
  cookies: ReadonlyArray<{ name: string }>,
): boolean {
  return cookies.some((cookie) => hasSupabaseAuthCookieName(cookie.name));
}
