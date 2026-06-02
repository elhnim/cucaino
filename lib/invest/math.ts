export function quantityForAmount(amountCents: number, priceCents: number): number {
  if (priceCents <= 0) return 0;
  return amountCents / priceCents;
}

export function newAvgCostCents(
  existingQty: number,
  existingAvgCents: number,
  addQty: number,
  addPriceCents: number,
): number {
  const totalQty = existingQty + addQty;
  if (totalQty <= 0) return 0;
  const totalCost = existingQty * existingAvgCents + addQty * addPriceCents;
  return Math.round(totalCost / totalQty);
}

export function holdingValueCents(quantity: number, priceCents: number): number {
  return Math.round(quantity * priceCents);
}

export function unrealizedPnlCents(quantity: number, priceCents: number, avgCostCents: number): number {
  return Math.round(quantity * (priceCents - avgCostCents));
}

export function proceedsCents(sellQty: number, priceCents: number): number {
  return Math.round(sellQty * priceCents);
}

export function sellQuantityForAmount(amountCents: number, priceCents: number, ownedQty: number): number {
  if (priceCents <= 0) return 0;
  return Math.min(ownedQty, amountCents / priceCents);
}

export function changePct(priceCents: number, prevCloseCents: number): number {
  if (prevCloseCents <= 0) return 0;
  return (priceCents - prevCloseCents) / prevCloseCents;
}

export const DUST_VALUE_CENTS = 1;

export function isDust(quantity: number, priceCents: number): boolean {
  return holdingValueCents(quantity, priceCents) < DUST_VALUE_CENTS || quantity <= 0;
}

/*
 * Example-based assertions:
 * quantityForAmount(200, 67940_00) = 200 / 6794000, approximately 0.0000294
 * newAvgCostCents(0, 0, 1, 3750) = 3750
 * newAvgCostCents(1, 3750, 1, 4188) = 3969
 * holdingValueCents(0.08, 4188) = 335
 * unrealizedPnlCents(0.08, 4188, 3750) = 35
 * changePct(20134, 19895) = about 0.0120
 * isDust(0.0000000001, 6794000) = true
 */
