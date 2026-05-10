import { describe, expect, it } from "vitest";
import { hasSupabaseAuthCookieName } from "@/lib/supabase/auth-cookie";

describe("hasSupabaseAuthCookieName", () => {
  it("matches Supabase auth token cookies", () => {
    expect(hasSupabaseAuthCookieName("sb-project-ref-auth-token")).toBe(true);
    expect(hasSupabaseAuthCookieName("sb-project-ref-auth-token.0")).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(hasSupabaseAuthCookieName("theme")).toBe(false);
    expect(hasSupabaseAuthCookieName("sb-project-ref-code-verifier")).toBe(false);
    expect(hasSupabaseAuthCookieName("__Host-next-auth.csrf-token")).toBe(false);
  });
});
