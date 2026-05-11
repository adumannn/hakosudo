import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockUpdate, mockEq, mockFrom, mockGetViewer } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockFrom: vi.fn(),
  mockGetViewer: vi.fn(),
}));

// React's `cache` is only exported under the `react-server` condition, which
// vitest (jsdom) doesn't activate. Replace it with an identity wrapper so the
// module under test can import it via `@/lib/auth/identity`.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: () => [{ name: "sb-x-auth-token" }] }),
}));

vi.mock("@/lib/supabase/auth-cookie", () => ({
  hasSupabaseAuthCookie: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/skins/viewer", () => ({
  getViewer: mockGetViewer,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { setActiveSkin } from "@/app/actions/skins";

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { update: mockUpdate };
    }
    return {};
  });
});

describe("setActiveSkin", () => {
  it("rejects unauthenticated callers", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await setActiveSkin("skin-1");
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("clears active_skin_id when called with null (any signed-in user)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const result = await setActiveSkin(null);
    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ active_skin_id: null });
  });

  it("rejects free user trying to set a season skin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockGetViewer.mockResolvedValue({
      userId: "u1",
      isPro: false,
      activeSkinId: null,
      ownedSkinIds: new Set(),
      allSkins: [
        {
          id: "spring-id",
          slug: "spring-2026",
          kind: "season",
          name: "Spring",
          kanji_label: "春",
          seal_kanji: "桜",
          palette_key: "spring",
          masthead: "",
          start_date: "2026-03-01",
          end_date: "2026-05-31",
          price_cents: null,
          active: true,
        },
      ],
    });

    const result = await setActiveSkin("spring-id");
    expect(result).toEqual({ ok: false, error: "not entitled" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows Pro user to set any active skin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockGetViewer.mockResolvedValue({
      userId: "u1",
      isPro: true,
      activeSkinId: null,
      ownedSkinIds: new Set(),
      allSkins: [
        {
          id: "sumi-id",
          slug: "sumi-e",
          kind: "premium",
          name: "Sumi-e",
          kanji_label: "墨",
          seal_kanji: "墨",
          palette_key: "sumi",
          masthead: "",
          start_date: null,
          end_date: null,
          price_cents: 100,
          active: true,
        },
      ],
    });

    const result = await setActiveSkin("sumi-id");
    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ active_skin_id: "sumi-id" });
  });

  it("allows free user with entitlement to set a purchased premium skin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockGetViewer.mockResolvedValue({
      userId: "u1",
      isPro: false,
      activeSkinId: null,
      ownedSkinIds: new Set(["sumi-id"]),
      allSkins: [
        {
          id: "sumi-id",
          slug: "sumi-e",
          kind: "premium",
          name: "Sumi-e",
          kanji_label: "墨",
          seal_kanji: "墨",
          palette_key: "sumi",
          masthead: "",
          start_date: null,
          end_date: null,
          price_cents: 100,
          active: true,
        },
      ],
    });

    const result = await setActiveSkin("sumi-id");
    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ active_skin_id: "sumi-id" });
  });

  it("returns 'not found' for unknown skin id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockGetViewer.mockResolvedValue({
      userId: "u1",
      isPro: true,
      activeSkinId: null,
      ownedSkinIds: new Set(),
      allSkins: [],
    });

    const result = await setActiveSkin("nonexistent");
    expect(result).toEqual({ ok: false, error: "not found" });
  });
});
