import { Article, PurchaseOrderItem } from "../types";
import { formatAssortment } from "./assortmentUtils";

// PO/Bill items saved before onlineMrp/offlineMrp/gender/assortment were
// tracked on the backend schema have those fields missing/blank — e.g.
// falling back to the single legacy `mrp` field for BOTH online and offline
// shows the same (online) number in both columns, which is wrong, and
// gender/assortment just don't display at all. Backfill all of these from
// the live catalog variant (via the item's own articleId/variantId)
// whenever the item's own saved values are missing. Used by both the PO
// screens and the Bill screens (a bill's items are a PO's items) so both
// stay consistent.
export const enrichItemsWithCatalogMrp = (
  items: PurchaseOrderItem[],
  articles: Article[]
): PurchaseOrderItem[] =>
  items.map((it) => {
    if (it.onlineMrp && it.offlineMrp && it.gender && it.assortment) return it;
    const article = articles.find(
      (a) => a.id === it.articleId || (a as any)._id === it.articleId
    );
    const variant = article?.variants?.find(
      (v: any) => v.id === it.variantId || v._id === it.variantId
    );
    if (!variant) return it;
    return {
      ...it,
      onlineMrp: it.onlineMrp || (variant.onlineMrp || 0) * 24,
      offlineMrp: it.offlineMrp || (variant.offlineMrp || 0) * 24,
      gender: it.gender || article?.category || "",
      assortment: it.assortment || formatAssortment(variant.sizeQuantities),
    };
  });
