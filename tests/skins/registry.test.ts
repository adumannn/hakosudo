import { describe, it, expect } from "vitest";
import { SKIN_REGISTRY, getRegistryEntry } from "@/lib/skins/registry";

describe("skin registry", () => {
  it("contains the 7 launch slugs", () => {
    expect(Object.keys(SKIN_REGISTRY).sort()).toEqual([
      "autumn-2026",
      "default",
      "indigo",
      "spring-2026",
      "sumi-e",
      "summer-2026",
      "winter-2026",
    ]);
  });

  it("returns the default entry for unknown slugs", () => {
    expect(getRegistryEntry("not-a-real-skin").paletteKey).toBe("default");
    expect(getRegistryEntry("not-a-real-skin").sealKanji).toBe("完");
  });

  it("returns spring-2026 metadata correctly", () => {
    const entry = getRegistryEntry("spring-2026");
    expect(entry.paletteKey).toBe("spring");
    expect(entry.sealKanji).toBe("桜");
    expect(entry.masthead).toBe("Today's bloom.");
  });
});
