import { describe, expect, it } from "vitest";
import { PREMIUM_SKIN_PRICE_CENTS } from "@/lib/skins/prices";

describe("premium skin prices", () => {
  it("prices individual premium skins at one dollar", () => {
    expect(PREMIUM_SKIN_PRICE_CENTS).toBe(100);
  });
});
