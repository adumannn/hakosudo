import type { SkinRecord, SkinResolved, Surface } from "./types";

interface ResolveArgs {
  surface: Surface;
  activeSkinId: string | null;
  isPro: boolean;
  ownedSkinIds: Set<string>;
  dailySkinId: string | null;     // only for surface="daily"
  today: string;                   // ISO YYYY-MM-DD (UTC)
  skins: SkinRecord[];
}

// Hardcoded last-resort fallback used only when the skins array is empty —
// e.g. a brief misconfiguration where neither the seed nor the 0009 default
// row exists yet. Mirrors the SKIN_REGISTRY "default" entry so the UI still
// renders deterministically without a runtime crash.
const HARDCODED_DEFAULT: SkinResolved = {
  slug: "default",
  paletteKey: "default",
  sealKanji: "完",
  masthead: "Today's box.",
  kanjiLabel: "完",
};

function toResolved(s: SkinRecord): SkinResolved {
  return {
    slug: s.slug,
    paletteKey: s.palette_key,
    sealKanji: s.seal_kanji,
    masthead: s.masthead,
    kanjiLabel: s.kanji_label,
  };
}

function findById(skins: SkinRecord[], id: string | null): SkinRecord | undefined {
  if (!id) return undefined;
  return skins.find((s) => s.id === id);
}

function findCurrentSeason(skins: SkinRecord[], today: string): SkinRecord | undefined {
  return skins.find(
    (s) =>
      s.kind === "season" &&
      s.start_date !== null &&
      s.end_date !== null &&
      s.start_date <= today &&
      today <= s.end_date,
  );
}

function findDefault(skins: SkinRecord[]): SkinRecord | undefined {
  return skins.find((s) => s.slug === "default");
}

export function canApplyOverride(args: {
  isPro: boolean;
  skin: SkinRecord;
  ownedSkinIds: Set<string>;
}): boolean {
  if (args.isPro) return true;
  if (args.skin.kind !== "season") {
    return args.ownedSkinIds.has(args.skin.id);
  }
  return false;
}

export function resolveActiveSkin(args: ResolveArgs): SkinResolved {
  // 0. Empty input — no skins seeded yet. Hand back a hardcoded default so
  // the UI renders deterministically instead of crashing on an undefined.
  if (args.skins.length === 0) return HARDCODED_DEFAULT;

  // 1. Daily surface is locked to the puzzle's published skin.
  if (args.surface === "daily") {
    const daily = findById(args.skins, args.dailySkinId);
    if (daily) return toResolved(daily);
    const fallback = findDefault(args.skins) ?? args.skins[0];
    return toResolved(fallback);
  }

  // 2. Home or casual: try the user's override if entitled.
  const override = findById(args.skins, args.activeSkinId);
  if (override && canApplyOverride({ isPro: args.isPro, skin: override, ownedSkinIds: args.ownedSkinIds })) {
    return toResolved(override);
  }

  // 3. Otherwise, current-date season skin.
  const season = findCurrentSeason(args.skins, args.today);
  if (season) return toResolved(season);

  // 4. Final fallback.
  const fallback = findDefault(args.skins) ?? args.skins[0];
  return toResolved(fallback);
}
