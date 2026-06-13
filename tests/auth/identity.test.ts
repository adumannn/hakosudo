import { describe, expect, it, vi, beforeEach } from "vitest";

const cookiesGetAll = vi.fn();
const hasAuthCookie = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();
const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));
const from = vi.fn(() => ({ select }));
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

// React's `cache` is only exported under the `react-server` condition, which
// vitest (jsdom) doesn't activate. Replace it with an identity wrapper so the
// module under test can import it. Per-request dedupe is a React behaviour
// rather than something we exercise here, so a passthrough is fine.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});
vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: cookiesGetAll }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/supabase/auth-cookie", () => ({
  hasSupabaseAuthCookie: (cookies: unknown) => hasAuthCookie(cookies),
}));

beforeEach(() => {
  vi.resetModules();
  cookiesGetAll.mockReset();
  hasAuthCookie.mockReset();
  getUser.mockReset();
  maybeSingle.mockReset();
  redirect.mockReset();
  // `from` and `select` carry their `vi.fn()` implementations across tests;
  // clear call history so `expect(from).not.toHaveBeenCalled()` is independent
  // of test order. Use mockClear (preserves impl), not mockReset (would erase it).
  from.mockClear();
  select.mockClear();
});

async function importFresh() {
  return await import("@/lib/auth/identity");
}

describe("getCurrentUser", () => {
  it("returns null user without calling getUser when no auth cookie", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toBeNull();
    expect(result.sb).toBeDefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns user and sb when auth cookie present and getUser resolves", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toEqual({ id: "u1", email: "a@b.co" });
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("returns null user when getUser returns null", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getCurrentUser } = await importFresh();
    const result = await getCurrentUser();

    expect(result.user).toBeNull();
  });

  it("logs auth.getUser error when present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "boom" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getCurrentUser } = await importFresh();
    await getCurrentUser();

    expect(errSpy).toHaveBeenCalledWith(
      "[auth/identity] auth.getUser:",
      expect.objectContaining({ message: "boom" }),
    );
    errSpy.mockRestore();
  });
});

describe("requireUser", () => {
  it("redirects to /auth/login when no user", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { requireUser } = await importFresh();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/login");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("returns user when authenticated", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });

    const { requireUser } = await importFresh();
    const result = await requireUser();

    expect(result.user).toEqual({ id: "u1", email: "a@b.co" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("getProfile", () => {
  it("returns null without querying when no user", async () => {
    cookiesGetAll.mockReturnValue([]);
    hasAuthCookie.mockReturnValue(false);

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the row when user is present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: "u1",
        city: "tokyo",
        is_pro: false,
        active_skin_id: null,
        username: "alice",
        sfx_enabled: true,
        created_at: "2026-01-01T00:00:00Z",
        freeze_credits: 3,
      },
      error: null,
    });

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result?.city).toBe("tokyo");
    expect(result?.freeze_credits).toBe(3);
    expect(from).toHaveBeenCalledWith("profiles");
  });

  it("returns null when row is missing", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { getProfile } = await importFresh();
    const result = await getProfile();

    expect(result).toBeNull();
  });

  it("logs profiles.select error when present", async () => {
    cookiesGetAll.mockReturnValue([{ name: "sb-x-auth-token" }]);
    hasAuthCookie.mockReturnValue(true);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.co" } },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getProfile } = await importFresh();
    await getProfile();

    expect(errSpy).toHaveBeenCalledWith(
      "[auth/identity] profiles.select:",
      expect.objectContaining({ message: "db down" }),
    );
    errSpy.mockRestore();
  });
});
