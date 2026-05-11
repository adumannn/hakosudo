import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetProfile } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({
  getProfile: mockGetProfile,
}));

import { getSfxEnabledServer } from "@/lib/sfx/server";

describe("getSfxEnabledServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGetProfile.mockReset();
  });

  // getProfile returns null for both anonymous users and lookup failures
  // (the helper swallows errors and returns null), so they share one test.
  it("returns false when there is no profile (anonymous user or lookup failure)", async () => {
    mockGetProfile.mockResolvedValue(null);

    await expect(getSfxEnabledServer()).resolves.toBe(false);
  });

  it("returns true when the profile has sfx enabled", async () => {
    mockGetProfile.mockResolvedValue({ sfx_enabled: true });

    await expect(getSfxEnabledServer()).resolves.toBe(true);
  });

  it("returns false when sfx is disabled", async () => {
    mockGetProfile.mockResolvedValue({ sfx_enabled: false });

    await expect(getSfxEnabledServer()).resolves.toBe(false);
  });
});
