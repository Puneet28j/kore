// RFD/PreOrder is never stored — it's computed fresh from live stock +
// PO-pending everywhere in the app (Catalogue Manager, Shop, Wishlist, Cart,
// reports). This is the single shared source of that computation.
//
// RFD: live stock (sizeMap qty summed) > 0. PO-pending/booked qty has no
// effect on this.
// PREORDER: live stock === 0 AND poPendingPairs > 0 (an approved PO with
// unreceived qty).
// NONE: live stock === 0 AND poPendingPairs <= 0 — nothing in stock, nothing
// incoming, not orderable.
export type CatalogAvailability = "RFD" | "PREORDER" | "NONE";

export function getVariantLiveStock(variant: {
  sizeMap?: Record<string, { qty?: number }>;
}): number {
  const sizeMap = variant.sizeMap || {};
  return Object.values(sizeMap).reduce(
    (sum, cell) => sum + Math.max(0, Number(cell?.qty || 0)),
    0
  );
}

export function getVariantAvailability(variant: {
  sizeMap?: Record<string, { qty?: number }>;
  poPendingPairs?: number;
}): CatalogAvailability {
  if (getVariantLiveStock(variant) > 0) return "RFD";
  if (Number(variant.poPendingPairs || 0) > 0) return "PREORDER";
  return "NONE";
}
