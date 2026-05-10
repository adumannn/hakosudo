// tests/skins/access.test.ts
import { describe, it, expect } from "vitest";
import { canApplyOverride } from "@/lib/skins/resolve";
import type { SkinRecord } from "@/lib/skins/types";

const PREMIUM: SkinRecord = {
  id: "s-sumi", slug: "sumi-e", kind: "premium", name: "Sumi-e",
  kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
  masthead: "Today's stroke.", start_date: null, end_date: null,
  price_cents: 100, active: true,
};
const SEASON: SkinRecord = {
  id: "s-spring", slug: "spring-2026", kind: "season", name: "Spring 2026",
  kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
  masthead: "Today's bloom.", start_date: "2026-03-01", end_date: "2026-05-31",
  price_cents: null, active: true,
};

describe("canApplyOverride", () => {
  it("Pro user can apply any skin", () => {
    expect(canApplyOverride({ isPro: true, skin: PREMIUM, ownedSkinIds: new Set() })).toBe(true);
    expect(canApplyOverride({ isPro: true, skin: SEASON, ownedSkinIds: new Set() })).toBe(true);
  });

  it("free user cannot apply season skins as override", () => {
    expect(canApplyOverride({ isPro: false, skin: SEASON, ownedSkinIds: new Set() })).toBe(false);
  });

  it("free user can apply purchased premium skins (post-Pro persistence)", () => {
    expect(
      canApplyOverride({ isPro: false, skin: PREMIUM, ownedSkinIds: new Set(["s-sumi"]) }),
    ).toBe(true);
  });

  it("free user cannot apply premium skins they don't own", () => {
    expect(canApplyOverride({ isPro: false, skin: PREMIUM, ownedSkinIds: new Set() })).toBe(false);
  });
});
