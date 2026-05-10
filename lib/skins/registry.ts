import type { SkinRegistryEntry } from "./types";

export const SKIN_REGISTRY: Record<string, SkinRegistryEntry> = {
  "default":     { paletteKey: "default", sealKanji: "完", masthead: "Today's box.",     kanjiLabel: "完" },
  "spring-2026": { paletteKey: "spring",  sealKanji: "桜", masthead: "Today's bloom.",   kanjiLabel: "春" },
  "summer-2026": { paletteKey: "summer",  sealKanji: "蓮", masthead: "Today's pond.",    kanjiLabel: "夏" },
  "autumn-2026": { paletteKey: "autumn",  sealKanji: "楓", masthead: "Today's leaf.",    kanjiLabel: "秋" },
  "winter-2026": { paletteKey: "winter",  sealKanji: "雪", masthead: "Today's hush.",    kanjiLabel: "冬" },
  "sumi-e":      { paletteKey: "sumi",    sealKanji: "墨", masthead: "Today's stroke.",  kanjiLabel: "墨" },
  "indigo":      { paletteKey: "indigo",  sealKanji: "藍", masthead: "Today's depth.",   kanjiLabel: "藍" },
  // Challenge unlocks (kind: "limited"). Free, granted via user_skin_entitlements(source="challenge").
  "matsuri":     { paletteKey: "matsuri", sealKanji: "祭", masthead: "Today's lantern.", kanjiLabel: "祭" },
  "koi":         { paletteKey: "koi",     sealKanji: "鯉", masthead: "Today's pond.",    kanjiLabel: "鯉" },
  "yurei":       { paletteKey: "yurei",   sealKanji: "幽", masthead: "Today's dawn.",    kanjiLabel: "幽" },
};

export function getRegistryEntry(slug: string): SkinRegistryEntry {
  return SKIN_REGISTRY[slug] ?? SKIN_REGISTRY["default"];
}
