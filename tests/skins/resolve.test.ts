import { describe, it, expect } from "vitest";
import { resolveActiveSkin } from "@/lib/skins/resolve";
import type { SkinRecord } from "@/lib/skins/types";

const SPRING: SkinRecord = {
  id: "s-spring", slug: "spring-2026", kind: "season", name: "Spring 2026",
  kanji_label: "春", seal_kanji: "桜", palette_key: "spring",
  masthead: "Today's bloom.", start_date: "2026-03-01", end_date: "2026-05-31",
  price_cents: null, active: true,
};
const SUMMER: SkinRecord = {
  id: "s-summer", slug: "summer-2026", kind: "season", name: "Summer 2026",
  kanji_label: "夏", seal_kanji: "蓮", palette_key: "summer",
  masthead: "Today's pond.", start_date: "2026-06-01", end_date: "2026-08-31",
  price_cents: null, active: true,
};
const SUMI: SkinRecord = {
  id: "s-sumi", slug: "sumi-e", kind: "premium", name: "Sumi-e",
  kanji_label: "墨", seal_kanji: "墨", palette_key: "sumi",
  masthead: "Today's stroke.", start_date: null, end_date: null,
  price_cents: 300, active: true,
};
const DEFAULT: SkinRecord = {
  id: "s-default", slug: "default", kind: "premium", name: "Default",
  kanji_label: "完", seal_kanji: "完", palette_key: "default",
  masthead: "Today's box.", start_date: null, end_date: null,
  price_cents: null, active: true,
};
const SKINS = [SPRING, SUMMER, SUMI, DEFAULT];

describe("resolveActiveSkin — daily surface", () => {
  it("returns the daily's locked skin regardless of override", () => {
    const result = resolveActiveSkin({
      surface: "daily",
      activeSkinId: "s-sumi",
      isPro: true,
      ownedSkinIds: new Set(["s-sumi"]),
      dailySkinId: "s-spring",
      today: "2026-09-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("spring-2026");
    expect(result.sealKanji).toBe("桜");
  });

  it("falls back to default if daily has no skin_id", () => {
    const result = resolveActiveSkin({
      surface: "daily",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("default");
  });
});

describe("resolveActiveSkin — home/casual surface", () => {
  it("uses override when Pro user has it set and is entitled", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",
      isPro: true,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("sumi-e");
  });

  it("falls back to current-date season for free user even with override set", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",        // override is set on profile
      isPro: false,
      ownedSkinIds: new Set(),       // but free user has no entitlement
      dailySkinId: null,
      today: "2026-04-01",           // mid-spring
      skins: SKINS,
    });
    expect(result.slug).toBe("spring-2026");
  });

  it("returns the current-date season skin when no override", () => {
    const result = resolveActiveSkin({
      surface: "casual",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-07-15",
      skins: SKINS,
    });
    expect(result.slug).toBe("summer-2026");
  });

  it("returns default when no season covers today", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-12-25",           // outside all seeded seasons in this test
      skins: SKINS,
    });
    expect(result.slug).toBe("default");
  });

  it("ex-Pro user keeps purchased skin entitlement", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: "s-sumi",
      isPro: false,
      ownedSkinIds: new Set(["s-sumi"]),
      dailySkinId: null,
      today: "2026-04-01",
      skins: SKINS,
    });
    expect(result.slug).toBe("sumi-e");
  });
});

describe("resolveActiveSkin — empty input guard", () => {
  it("returns hardcoded default when skins is empty (home surface)", () => {
    const result = resolveActiveSkin({
      surface: "home",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: null,
      today: "2026-04-01",
      skins: [],
    });
    expect(result.slug).toBe("default");
    expect(result.sealKanji).toBe("完");
    expect(result.paletteKey).toBe("default");
  });

  it("returns hardcoded default when skins is empty (daily surface)", () => {
    const result = resolveActiveSkin({
      surface: "daily",
      activeSkinId: null,
      isPro: false,
      ownedSkinIds: new Set(),
      dailySkinId: "s-spring",
      today: "2026-04-01",
      skins: [],
    });
    expect(result.slug).toBe("default");
  });
});
