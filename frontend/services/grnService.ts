import { apiFetch } from "./api";

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

    let totalQty = 0;
    const items: MockPOItem[] = (poDoc.items || []).map((it: any) => {
      let itemTotalQty = 0;
      const sizeMapData = it.sizeMap || {};
      if (typeof sizeMapData === "object") {
        Object.values(sizeMapData).forEach((v: any) => {
          itemTotalQty += Number(v?.qty || 0);
        });
      }
      const itemCartons = Number(it.cartonCount || 0);
      totalQty += (itemTotalQty * (itemCartons > 0 ? itemCartons : 1));

      return {
        itemName: it.itemName || "",
        variantId: it.variantId || "",
        color: it.skuCompany || "",
        sizeRange: "Variable",
        cartonCount: itemCartons,
        sizeMap: sizeMapData,
        sku: it.sku || "",
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

  async create(payload: any) {
    const { poId, linkedPoIds = [], poNos = [], form, scanState } = payload;

    // Load primary PO by MongoDB _id
    const primaryRes = await apiFetch(`/purchase-orders/${poId}`);
    if (!primaryRes.data) throw new Error("Purchase Order details not found");
    const primaryPODoc = primaryRes.data;

    // Build scanKey → poItem map (scanKeys mirror what GRN.tsx puts in scanState)
    // Primary items: scanKey = itemName
    // Linked items:  scanKey = "${linkedMongoId}::itemName"
    const allPOItems: Record<string, any> = {};
    (primaryPODoc.items || []).forEach((it: any) => {
      allPOItems[it.itemName] = it;
    });

    for (const linkedMongoId of linkedPoIds) {
      try {
        const lRes = await apiFetch(`/purchase-orders/${linkedMongoId}`);
        if (lRes.data) {
          (lRes.data.items || []).forEach((it: any) => {
            allPOItems[`${linkedMongoId}::${it.itemName}`] = it;
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
