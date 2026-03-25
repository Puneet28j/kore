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

  async history(search: string = "") {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/grn/history${query}`);
  },

  async getGRNDetail(grnId: string) {
    return apiFetch(`/grn/${grnId}`);
  },

  async create(payload: any) {
    const { poId, scanState } = payload;
    const listRes = await apiFetch(`/purchase-orders/${poId}`);
    if (!listRes.data) throw new Error("Purchase Order details not found");
    const poDoc = listRes.data;
    
    const draftRes = await apiFetch("/grn/drafts", {
      method: "POST",
      body: JSON.stringify({ refType: "PO", refId: poDoc.poNumber })
    });
    if (!draftRes.data || !draftRes.data._id) throw new Error("Failed to create GRN Draft");
    const draftId = draftRes.data._id;
    
    const scannedCartons: { cartonIndex: number; itemName: string; pairBarcodes: string[] }[] = [];
    const scannedItemNames: string[] = [];
    
    Object.keys(scanState).forEach((itemName) => {
      const cartons = scanState[itemName];
      const poItem = poDoc.items.find((it: any) => it.itemName === itemName);
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
            itemName: itemName, // NEW: Include itemName
            pairBarcodes: cartonPairs 
          });
        }
      });
      if (itemHasScans) scannedItemNames.push(itemName);
    });
    
    if (scannedCartons.length > 0) {
      await apiFetch(`/grn/drafts/${draftId}/bulk-scan`, {
        method: "POST",
        body: JSON.stringify({ cartons: scannedCartons })
      });
    }
    
    // Pass the actual scanned article names so backend stores the correct one
    const submitRes = await apiFetch(`/grn/drafts/${draftId}/submit`, {
      method: "POST",
      body: JSON.stringify({ scannedItemNames })
    });
    
    // Attach scanned item names to the response for the frontend history entry
    if (submitRes.data) {
      submitRes.data._scannedItemNames = scannedItemNames;
    }
    return submitRes;
  },
};
