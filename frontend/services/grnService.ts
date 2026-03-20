import { apiFetch } from "./api";

// ─── Mock PO Data for GRN (frontend-only until backend is ready) ───

export type MockPORef = {
  id: string;
  poNo: string;
  vendor: string;
  article: string;
  date: string;
  totalQty: number;
};

export type MockSizeData = {
  qty: number; // number of boxes for this size
  sku: string;
};

export type MockPOItem = {
  itemName: string; // e.g. "Urban-Red-5-7"
  variantId: string;
  color: string;
  sizeRange: string;
  cartonCount: number;
  sizeMap: Record<string, MockSizeData>;
};

export type MockPODetail = {
  id: string;
  poNo: string;
  vendorName: string;
  vendorCode: string;
  poDate: string;
  deliveryDate: string;
  shipTo: string;
  totalQty: number;
  items: MockPOItem[];
};

const MOCK_PO_LIST: MockPORef[] = [
  { id: "PO-00001", poNo: "PO-00001", vendor: "Zenith Footwear", article: "Urban", date: "2026-03-01", totalQty: 480 },
  { id: "PO-00002", poNo: "PO-00002", vendor: "Apex Traders", article: "Classic", date: "2026-03-05", totalQty: 360 },
  { id: "PO-00003", poNo: "PO-00003", vendor: "Nova Shoes Pvt Ltd", article: "Metro", date: "2026-03-10", totalQty: 240 },
];

const MOCK_PO_DETAILS: Record<string, MockPODetail> = {
  "PO-00001": {
    id: "PO-00001",
    poNo: "PO-00001",
    vendorName: "Zenith Footwear",
    vendorCode: "VND-001",
    poDate: "2026-03-01",
    deliveryDate: "2026-03-20",
    shipTo: "Warehouse A, Noida",
    totalQty: 72, // (20+15+10) * 24 = 45 * 24 = 1080
    items: [
      {
        itemName: "Urban-Red-5-7",
        variantId: "v1",
        color: "Red",
        sizeRange: "5-7",
        cartonCount: 1, // 480 total / 24 = 20 cartons (if single item)
        sizeMap: {
          "5": { qty: 8, sku: "URB-RED-5-001" },
          "6": { qty: 8, sku: "URB-RED-6-001" },
          "7": { qty: 8, sku: "URB-RED-7-001" },
        },
      },
      {
        itemName: "Urban-Black-4-6",
        variantId: "v2",
        color: "Black",
        sizeRange: "4-6",
        cartonCount: 1,
        sizeMap: {
          "4": { qty: 8, sku: "URB-BLK-4-001" },
          "5": { qty: 8, sku: "URB-BLK-5-001" },
          "6": { qty: 8, sku: "URB-BLK-6-001" },
        },
      },
      {
        itemName: "Urban-Blue-6-8",
        variantId: "v3",
        color: "Blue",
        sizeRange: "6-8",
        cartonCount: 1,
        sizeMap: {
          "6": { qty: 8, sku: "URB-BLU-6-001" },
          "7": { qty: 8, sku: "URB-BLU-7-001" },
          "8": { qty: 8, sku: "URB-BLU-8-001" },
        },
      },
    ],
  },
  "PO-00002": {
    id: "PO-00002",
    poNo: "PO-00002",
    vendorName: "Apex Traders",
    vendorCode: "VND-002",
    poDate: "2026-03-05",
    deliveryDate: "2026-03-25",
    shipTo: "Warehouse B, Greater Noida",
    totalQty: 72, // (10+5) * 24 = 15 * 24 = 360. Wait, already correct?
    items: [
      {
        itemName: "Classic-Brown-6-9",
        variantId: "v4",
        color: "Brown",
        sizeRange: "6-9",
        cartonCount: 2,
        sizeMap: {
          "6": { qty: 6, sku: "CLS-BRN-6-001" },
          "7": { qty: 6, sku: "CLS-BRN-7-001" },
          "8": { qty: 6, sku: "CLS-BRN-8-001" },
          "9": { qty: 6, sku: "CLS-BRN-9-001" },
        },
      },
      {
        itemName: "Classic-Tan-7-10",
        variantId: "v5",
        color: "Tan",
        sizeRange: "7-10",
        cartonCount: 1,
        sizeMap: {
          "7": { qty: 2, sku: "CLS-TAN-7-001" },
          "8": { qty: 8, sku: "CLS-TAN-8-001" },
          "9": { qty: 4, sku: "CLS-TAN-9-001" },
          "10": { qty: 10, sku: "CLS-TAN-10-001" },
        },
      },
    ],
  },
  "PO-00003": {
    id: "PO-00003",
    poNo: "PO-00003",
    vendorName: "Nova Shoes Pvt Ltd",
    vendorCode: "VND-003",
    poDate: "2026-03-10",
    deliveryDate: "2026-03-30",
    shipTo: "Warehouse A, Noida",
    totalQty: 96, // 10 * 24 = 240. Correct.
    items: [
      {
        itemName: "Metro-White-5-8",
        variantId: "v6",
        color: "White",
        sizeRange: "5-8",
        cartonCount: 4,
        sizeMap: {
          "5": { qty: 6, sku: "MET-WHT-5-001" },
          "6": { qty: 6, sku: "MET-WHT-6-001" },
          "7": { qty: 6, sku: "MET-WHT-7-001" },
          "8": { qty: 6, sku: "MET-WHT-8-001" },
        },
      },
    ],
  },
};

export const grnService = {
  async listReferences(search: string = "") {
    // Return mock data instead of API call
    const filtered = MOCK_PO_LIST.filter(
      (po) =>
        !search ||
        po.poNo.toLowerCase().includes(search.toLowerCase()) ||
        po.vendor.toLowerCase().includes(search.toLowerCase()) ||
        po.article.toLowerCase().includes(search.toLowerCase())
    );
    return { data: filtered };
  },

  async getReferenceDetail(poId: string) {
    // Return mock detail
    const detail = MOCK_PO_DETAILS[poId] || null;
    return { data: detail };
  },

  async history(search: string = "") {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/grn/history${query}`);
  },

  async create(payload: any) {
    // Mock create — just return success
    return {
      data: {
        grnNo: `GRN-${Date.now()}`,
        ...payload,
      },
    };
  },
};
