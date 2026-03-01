import { apiFetch } from "./api";
import { PurchaseOrder } from "../types";

export const poService = {
  async listPOs(query: { q?: string; page?: number; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (query.q) params.append("q", query.q);
    if (query.page) params.append("page", query.page.toString());
    if (query.limit) params.append("limit", query.limit.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/purchase-orders${queryString}`);
  },

  async getNextPONumber() {
    return apiFetch("/purchase-orders/next-po-number");
  },

  async createPO(data: Partial<PurchaseOrder>) {
    return apiFetch("/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getPOById(id: string) {
    return apiFetch(`/purchase-orders/${id}`);
  },

  async updatePO(id: string, data: Partial<PurchaseOrder>) {
    return apiFetch(`/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};
