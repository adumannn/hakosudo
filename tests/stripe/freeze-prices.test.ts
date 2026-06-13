import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getFreezePriceId,
  getFreezeQuantity,
  getFreezeAmountCents,
  isFreezeSku,
  FREEZE_SKUS,
} from "@/lib/stripe/freeze-prices";

describe("freeze-prices", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_FREEZE_1 = "price_test_freeze_1";
    process.env.STRIPE_PRICE_ID_FREEZE_5 = "price_test_freeze_5";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("exposes both SKUs in FREEZE_SKUS", () => {
    expect(Object.keys(FREEZE_SKUS).sort()).toEqual(["freeze_1", "freeze_5"]);
  });

  it("isFreezeSku narrows to known SKUs and rejects prototype keys", () => {
    expect(isFreezeSku("freeze_1")).toBe(true);
    expect(isFreezeSku("freeze_5")).toBe(true);
    expect(isFreezeSku("freeze_99")).toBe(false);
    expect(isFreezeSku("constructor")).toBe(false);
  });

  it("returns the env price id for a known SKU", () => {
    expect(getFreezePriceId("freeze_1")).toBe("price_test_freeze_1");
    expect(getFreezePriceId("freeze_5")).toBe("price_test_freeze_5");
  });

  it("returns null when the env var is unset or empty", () => {
    delete process.env.STRIPE_PRICE_ID_FREEZE_1;
    expect(getFreezePriceId("freeze_1")).toBeNull();
    process.env.STRIPE_PRICE_ID_FREEZE_5 = "";
    expect(getFreezePriceId("freeze_5")).toBeNull();
  });

  it("returns null when the env var is whitespace-only", () => {
    process.env.STRIPE_PRICE_ID_FREEZE_1 = "   ";
    expect(getFreezePriceId("freeze_1")).toBeNull();
  });

  it("returns the bundle quantity", () => {
    expect(getFreezeQuantity("freeze_1")).toBe(1);
    expect(getFreezeQuantity("freeze_5")).toBe(5);
  });

  it("returns the bundle price in cents", () => {
    expect(getFreezeAmountCents("freeze_1")).toBe(100);
    expect(getFreezeAmountCents("freeze_5")).toBe(300);
  });
});
