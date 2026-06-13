export const FREEZE_SKUS = {
  freeze_1: { quantity: 1, amountCents: 100, priceEnv: "STRIPE_PRICE_ID_FREEZE_1" },
  freeze_5: { quantity: 5, amountCents: 300, priceEnv: "STRIPE_PRICE_ID_FREEZE_5" },
} as const;

export type FreezeSku = keyof typeof FREEZE_SKUS;

export function isFreezeSku(s: string): s is FreezeSku {
  return Object.prototype.hasOwnProperty.call(FREEZE_SKUS, s);
}

export function getFreezePriceId(s: FreezeSku): string | null {
  const v = process.env[FREEZE_SKUS[s].priceEnv]?.trim();
  return v && v.length > 0 ? v : null;
}

export function getFreezeQuantity(s: FreezeSku): number {
  return FREEZE_SKUS[s].quantity;
}

export function getFreezeAmountCents(s: FreezeSku): number {
  return FREEZE_SKUS[s].amountCents;
}
