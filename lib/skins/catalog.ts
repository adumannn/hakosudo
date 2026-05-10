import type { SkinRecord } from "./types";
import type { Viewer } from "./viewer";
import { getPriceIdForSkinSlug } from "@/lib/stripe/skin-prices";

export type CatalogAction =
  | { kind: "hidden" }
  | { kind: "wearing"; skinId: string }
  | { kind: "wear"; skinId: string }
  | { kind: "wear-included"; skinId: string }
  | { kind: "buy"; slug: string; priceCents: number }
  | { kind: "in-print"; seasonName: string }
  | { kind: "back-issue"; seasonName: string }
  | { kind: "future"; startDate: string; seasonName: string }
  | { kind: "locked-challenge"; slug: string; hint: string };

// Per-slug unlock hints for challenge-locked skins. Surfaced in the catalog
// when a free user hasn't earned the entitlement yet. Auto-granting on
// challenge completion is a separate task; this map is the source of truth
// for the user-facing description of each challenge.
const CHALLENGE_HINTS: Record<string, string> = {
  matsuri: "7-day streak",
  koi: "30 puzzles solved",
  yurei: "solve a daily at 3 a.m.",
};

export function getCatalogAction(
  skin: SkinRecord,
  viewer: Viewer,
  today: string,
): CatalogAction {
  // Default skin is engine plumbing, not a product surface.
  if (skin.slug === "default") return { kind: "hidden" };

  // Already wearing this skin? Always show "wearing" first so the action exists.
  if (viewer.activeSkinId === skin.id) {
    return { kind: "wearing", skinId: skin.id };
  }

  if (skin.kind === "season") {
    return getSeasonAction(skin, viewer, today);
  }

  if (skin.kind === "limited") {
    return getChallengeAction(skin, viewer);
  }

  // Premium path (kind: "premium").
  if (viewer.isPro) {
    return { kind: "wear-included", skinId: skin.id };
  }
  if (viewer.ownedSkinIds.has(skin.id)) {
    return { kind: "wear", skinId: skin.id };
  }
  // Real Stripe price ID must be present — not just an allow-listed slug — so a
  // user never sees "Buy" for a skin whose env var is unset (and would 503 at checkout).
  if (skin.price_cents !== null && getPriceIdForSkinSlug(skin.slug)) {
    return { kind: "buy", slug: skin.slug, priceCents: skin.price_cents };
  }
  // Premium skin without a Stripe price configured — treat as hidden.
  return { kind: "hidden" };
}

function getChallengeAction(
  skin: SkinRecord,
  viewer: Viewer,
): CatalogAction {
  // Pro users see all skins as included. Pro is the master gate for
  // override; the challenge entitlement is the free path for non-Pro users.
  if (viewer.isPro) {
    return { kind: "wear-included", skinId: skin.id };
  }
  // Free user with an entitlement row (source="challenge") owns the skin.
  if (viewer.ownedSkinIds.has(skin.id)) {
    return { kind: "wear", skinId: skin.id };
  }
  // Locked. Surface a hint if we know one; otherwise hide so we don't
  // render an unlabelled "Locked" CTA.
  const hint = CHALLENGE_HINTS[skin.slug];
  if (!hint) return { kind: "hidden" };
  return { kind: "locked-challenge", slug: skin.slug, hint };
}

function getSeasonAction(
  skin: SkinRecord,
  viewer: Viewer,
  today: string,
): CatalogAction {
  if (!skin.start_date || !skin.end_date) {
    return { kind: "hidden" };
  }

  const isFuture = today < skin.start_date;
  const isCurrent = !isFuture && today <= skin.end_date;
  const isPast = today > skin.end_date;

  if (isFuture) {
    return { kind: "future", startDate: skin.start_date, seasonName: skin.name };
  }

  if (isCurrent) {
    if (viewer.isPro) return { kind: "wear", skinId: skin.id };
    return { kind: "in-print", seasonName: skin.name };
  }

  if (isPast) {
    if (viewer.isPro) return { kind: "wear", skinId: skin.id };
    return { kind: "back-issue", seasonName: skin.name };
  }

  return { kind: "hidden" };
}
