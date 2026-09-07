import { apiFetch } from "./api";
import { masterCatalogService } from "./masterCatalogService";

// Types matching frontend expectations
export type MockPORef = {
  id: string; // Internal PO ID or poNumber
  poNo: string;
  vendor: string;
  article: string;
  date: string;
  totalQty: number;
};

export type MockSizeData = {
  qty: number;
  sku: string;
};

export type MockPOItem = {
  itemName: string;
  variantId: string;
  color: string;
  sizeRange: string;
  cartonCount: number;
  sizeMap: Record<string, MockSizeData>;
  // Carton-level SKU (Master Catalog's "Channel & SKU" field), used to build
  // the carton barcode as "<sku>CT001".
  sku: string;
};

export type MockPODetail = {
  id: string; // The MongoDB _id
  poNo: string;
  vendorName: string;
  vendorCode: string;
  poDate: string;
  deliveryDate: string;
  shipTo: string;
  totalQty: number;
  items: MockPOItem[];
};

export type GRNHistoryItem = {
  grnId: string;
  grnNo: string;
  refId: string;
  vendorName: string;
  articleName: string;
  totalPairs: number;
  cartons: number;
  createdAt: string;
};

// Per-pair SKU like "ARM-NVY-M-6" → "ARM-NVY-6": strip single-letter gender segment before the size
function fixPerPairSku(sku: string, size: string): string {
  const sizeStr = String(size);
  if (!sku.endsWith(`-${sizeStr}`)) return sku;
  const base = sku.slice(0, sku.length - sizeStr.length - 1);
  const segments = base.split("-");
  const lastSeg = segments[segments.length - 1] || "";
  if (lastSeg.length === 1 && /^[A-Za-z]$/.test(lastSeg)) {
    return segments.slice(0, -1).join("-") + "-" + sizeStr;
  }
  return sku;
}

export const grnService = {
  async listReferences(search: string = "") {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch(`/grn/references${query}`);
    
    const mapped: MockPORef[] = (res.data || []).map((ref: any) => ({
      id: ref.id,
      poNo: ref.id,
      vendor: ref.party,
      article: ref.article,
      date: "",
      totalQty: 0,
    }));
    
    return { data: mapped };
  },

  async getReferenceDetail(poId: string) {
    let poDoc: any = null;
    try {
      const listRes = await apiFetch(`/purchase-orders?q=${encodeURIComponent(poId)}`);
      poDoc = (listRes.data || []).find((p: any) => p.poNumber === poId);
      if (!poDoc) throw new Error("PO not found");
    } catch (err) {
      throw err;
    }

    // PurchaseOrder items don't store sizeRange at all, and their itemName/
    // color are a point-in-time snapshot from when the PO was raised — if a
    // variant's real itemName carries a disambiguating suffix (two variants
    // can share one Carton SKU with a different assortment, e.g.
    // "...-7-11" vs "...-7-11-A" — see CatalogueManager's makeVariantKey),
    // the stale snapshot can silently drop that suffix. getCartonBarcodeSku
    // (GRN.tsx) rebuilds the real carton barcode from color+sizeRange+
    // itemName, so a stale/incomplete snapshot here makes it compute the
    // WRONG barcode for the printed label (missing the "-A", say) even
    // though the backend correctly assigns the real one from the live
    // variant at submission — a label that then never matches the system's
    // record. Fetch each item's live variant (by articleId+variantId) and
    // use ITS current color/sizeRange/itemName/sku instead of the snapshot.
    const articleIds: string[] = [
      ...new Set<string>((poDoc.items || []).map((it: any) => String(it.articleId || "")).filter(Boolean)),
    ];
    const liveVariantById = new Map<string, { color: string; sizeRange: string; itemName: string; sku: string }>();
    await Promise.all(
      articleIds.map(async (articleId) => {
        try {
          const res = await masterCatalogService.getMasterItem(articleId);
          const catalog = res.data;
          (catalog?.variants || []).forEach((v: any) => {
            liveVariantById.set(String(v._id), {
              color: v.color || "",
              sizeRange: v.sizeRange || "",
              itemName: v.itemName || "",
              sku: v.sku || "",
            });
          });
        } catch {
          // Variant/article lookup failed (e.g. deleted since) — items for
          // it fall back to the PO's own snapshot fields below.
        }
      })
    );

    let totalQty = 0;
    const items: MockPOItem[] = (poDoc.items || []).map((it: any) => {
      const live = it.variantId ? liveVariantById.get(String(it.variantId)) : undefined;
      const rawSizeMap = it.sizeMap || {};
      const itemCartons = Math.max(1, Number(it.cartonCount || 0));

      // Detect if sizeMap.qty was stored as total (qty × cartonCount) vs per-carton.
      // Some POs were created via handleCartonCountChange which multiplied by cartonCount.
      // Standard per-carton assortment sums to 24; if sum > 24 with >1 carton, it's total.
      let rawSum = 0;
      if (typeof rawSizeMap === "object") {
        Object.values(rawSizeMap).forEach((v: any) => { rawSum += Number(v?.qty || 0); });
      }
      const isStoredAsTotal = rawSum > 24 && itemCartons > 1;
      const qtyDivisor = isStoredAsTotal ? itemCartons : 1;

      const sizeMap: Record<string, { qty: number; sku: string }> = {};
      let itemTotalQty = 0;
      if (typeof rawSizeMap === "object") {
        Object.entries(rawSizeMap).forEach(([sz, v]: [string, any]) => {
          const perCartonQty = Math.round(Number(v?.qty || 0) / qtyDivisor);
          sizeMap[sz] = { qty: perCartonQty, sku: fixPerPairSku(String(v?.sku || ""), sz) };
          itemTotalQty += perCartonQty;
        });
      }
      totalQty += itemTotalQty * itemCartons;

      return {
        itemName: live?.itemName || it.itemName || "",
        variantId: it.variantId || "",
        color: live?.color || it.color || "",
        sizeRange: live?.sizeRange || "Variable",
        cartonCount: itemCartons,
        sizeMap,
        sku: live?.sku || it.sku || "",
      };
    });

    const detail: MockPODetail = {
      id: poDoc._id,
      poNo: poDoc.poNumber,
      vendorName: poDoc.vendorName,
      vendorCode: "", 
      poDate: poDoc.date,
      deliveryDate: poDoc.deliveryDate,
      shipTo: poDoc.shipmentPreference || "",
      totalQty,
      items,
    };

    return { data: detail };
  },

  async history(params: Record<string, string> = {}) {
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) qp.append(k, v);
    });
    const query = qp.toString() ? `?${qp.toString()}` : "";
    return apiFetch(`/grn/history${query}`);
  },

  async exportHistory(params: Record<string, string> = {}) {
    const qp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) qp.append(k, v);
    });
    const query = qp.toString() ? `?${qp.toString()}` : "";
    return apiFetch(`/grn/history/export${query}`);
  },

  async getGRNDetail(grnId: string) {
    return apiFetch(`/grn/${grnId}`);
  },

  async getReceivedCartons(refId: string) {
    return apiFetch(`/grn/references/${refId}/received-cartons`);
  },

  async getVariantCartonCounter(variantId: string): Promise<number> {
    const res = await apiFetch(`/master-catalog/variants/${variantId}/carton-counter`);
    return res.nextSerial || 1;
  },

  async create(payload: any) {
    const { poId, linkedPoIds = [], poNos = [], form, scanState } = payload;

    // Load primary PO by MongoDB _id
    const primaryRes = await apiFetch(`/purchase-orders/${poId}`);
    if (!primaryRes.data) throw new Error("Purchase Order details not found");
    const primaryPODoc = primaryRes.data;

    // Build scanKey → poItem map (scanKeys mirror what GRN.tsx puts in scanState)
    // Primary items: scanKey = variantId || itemName (itemName alone collides
    // whenever a PO has multiple variants of the same article)
    // Linked items:  scanKey = "${linkedMongoId}::${variantId || itemName}"
    const allPOItems: Record<string, any> = {};
    (primaryPODoc.items || []).forEach((it: any) => {
      allPOItems[it.variantId || it.itemName] = it;
    });

    for (const linkedMongoId of linkedPoIds) {
      try {
        const lRes = await apiFetch(`/purchase-orders/${linkedMongoId}`);
        if (lRes.data) {
          (lRes.data.items || []).forEach((it: any) => {
            allPOItems[`${linkedMongoId}::${it.variantId || it.itemName}`] = it;
          });
        }
      } catch {}
    }

    const draftRes = await apiFetch("/grn/drafts", {
      method: "POST",
      body: JSON.stringify({ refType: "PO", refId: primaryPODoc.poNumber }),
    });
    if (!draftRes.data || !draftRes.data._id) throw new Error("Failed to create GRN Draft");
    const draftId = draftRes.data._id;

    const scannedCartons: { cartonIndex: number; itemName: string; variantId: string; cartonSku: string; pairBarcodes: string[] }[] = [];
    const scannedItemNames: string[] = [];

    Object.keys(scanState).forEach((scanKey) => {
      const cartons = scanState[scanKey];
      const poItem = allPOItems[scanKey];
      if (!poItem || !poItem.sizeMap) return;

      let itemHasScans = false;
      cartons.forEach((carton: any, cIdx: number) => {
        const cartonPairs: string[] = [];
        Object.keys(carton).forEach((size) => {
          const count = carton[size];
          const sku = poItem.sizeMap[size]?.sku;
          if (sku && count > 0) {
            itemHasScans = true;
            for (let i = 0; i < count; i++) cartonPairs.push(sku);
          }
        });
        if (cartonPairs.length > 0) {
          scannedCartons.push({
            cartonIndex: cIdx + 1,
            itemName: poItem.itemName,
            variantId: poItem.variantId,
            cartonSku: poItem.sku || poItem.itemName,
            pairBarcodes: cartonPairs,
          });
        }
      });
      if (itemHasScans && !scannedItemNames.includes(poItem.itemName)) {
        scannedItemNames.push(poItem.itemName);
      }
    });

    if (scannedCartons.length > 0) {
      await apiFetch(`/grn/drafts/${draftId}/bulk-scan`, {
        method: "POST",
        body: JSON.stringify({ cartons: scannedCartons }),
      });
    }

    // Submit with all form metadata
    const submitRes = await apiFetch(`/grn/drafts/${draftId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        scannedItemNames,
        poIds: poNos,                              // PO numbers for record
        grnDate: form?.grnDate,
        vendorInvoiceNos: form?.vendorInvoiceNos || [],
        vendorChallanNos: form?.vendorChallanNos || [],
        vehicleNo: form?.vehicleNo || "",
        eWayBillNo: form?.eWayBillNo || "",
        receivedBy: form?.receivedBy || "",
        receivedByMobile: form?.receivedByMobile || "",
        warehouse: form?.warehouse || "",
        remarks: form?.remarks || "",
      }),
    });

    if (submitRes.data) {
      submitRes.data._scannedItemNames = scannedItemNames;
    }
    return submitRes;
  },
};
