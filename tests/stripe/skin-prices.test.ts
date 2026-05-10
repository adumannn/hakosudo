import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPriceIdForSkinSlug } from "@/lib/stripe/skin-prices";

describe("getPriceIdForSkinSlug", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_SKIN_SUMI = "price_test_sumi";
    process.env.STRIPE_PRICE_ID_SKIN_INDIGO = "price_test_indigo";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns the env price id for sumi-e", () => {
    expect(getPriceIdForSkinSlug("sumi-e")).toBe("price_test_sumi");
  });

  it("returns the env price id for indigo", () => {
    expect(getPriceIdForSkinSlug("indigo")).toBe("price_test_indigo");
  });

  it("returns null for an unmapped slug", () => {
    expect(getPriceIdForSkinSlug("spring-2026")).toBeNull();
    expect(getPriceIdForSkinSlug("default")).toBeNull();
    expect(getPriceIdForSkinSlug("nonexistent")).toBeNull();
  });

  it("returns null when the env var is unset", () => {
    delete process.env.STRIPE_PRICE_ID_SKIN_SUMI;
    expect(getPriceIdForSkinSlug("sumi-e")).toBeNull();
  });

  it("returns null when the env var is empty string", () => {
    process.env.STRIPE_PRICE_ID_SKIN_SUMI = "";
    expect(getPriceIdForSkinSlug("sumi-e")).toBeNull();
  });
});
