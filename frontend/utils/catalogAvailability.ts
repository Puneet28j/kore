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

// Single shared source of "what does this variant actually cost, right now,
// for this distributor" — a variant's own onlineMrp/offlineMrp based on the
// distributor's online/offline tag, never article.pricePerPair (that's
// derived once from the article's first variant and is wrong for every
// other color/size-range combo, and doesn't distinguish online vs offline
// at all). Cart/order code must call this live at display/checkout time
// rather than trusting a price snapshot frozen at add-to-cart time — a
// price edited in the catalog after an item was added must be reflected
// immediately, not just on the next add/update-cart action.
export function getVariantPricePerPair(
  variant: { onlineMrp?: number; offlineMrp?: number } | null | undefined,
  tag: "online" | "offline" | undefined,
  fallback = 0
): number {
  const priced =
    tag === "offline"
      ? variant?.offlineMrp || variant?.onlineMrp
      : variant?.onlineMrp || variant?.offlineMrp;
  return Number(priced) || fallback;
}
