import { apiFetch } from "./api";
import { Vendor } from "../types";

export const vendorService = {
  async listVendors(query: { q?: string; page?: number; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (query.q) params.append("q", query.q);
    if (query.page) params.append("page", query.page.toString());
    if (query.limit) params.append("limit", query.limit.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/vendors${queryString}`);
  },

  async getVendor(id: string) {
    return apiFetch(`/vendors/${id}`);
  },

  async createVendor(data: Partial<Vendor>) {
    return apiFetch("/vendors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateVendor(id: string, data: Partial<Vendor>) {
    return apiFetch(`/vendors/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteVendor(id: string) {
    return apiFetch(`/vendors/${id}`, {
      method: "DELETE",
    });
  },
};
