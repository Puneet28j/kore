import { apiFetch } from "./api";

export const masterCatalogService = {
  async listMasterItems(
    query: { q?: string; page?: number; limit?: number; filter?: string; gender?: string; sort?: string } = {}
  ) {
    const params = new URLSearchParams();
    if (query.q) params.append("q", query.q);
    if (query.page) params.append("page", query.page.toString());
    if (query.limit) params.append("limit", query.limit.toString());
    if (query.filter) params.append("filter", query.filter);
    if (query.gender) params.append("gender", query.gender);
    if (query.sort) params.append("sort", query.sort);

    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/master-catalog${queryString}`);
  },

  async getMasterItem(id: string) {
    return apiFetch(`/master-catalog/${id}`);
  },

  async getStockTotals(filter?: string) {
    const qs = filter ? `?filter=${filter}` : '';
    return apiFetch(`/master-catalog/stock-totals${qs}`);
  },

  // { variantId: totalBookedPairs } across all variants with a BOOKED/PENDING order.
  async getBookedMap(): Promise<{ data: Record<string, number> }> {
    return apiFetch(`/master-catalog/booked-map`);
  },

  async createMasterItem(formData: FormData) {
    const token = localStorage.getItem("kore_token");
    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";

    const response = await fetch(`${API_BASE_URL}/master-catalog`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Something went wrong");
    }
    return data;
  },

  async updateMasterItem(id: string, formData: FormData) {
    const token = localStorage.getItem("kore_token");
    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";

    const response = await fetch(`${API_BASE_URL}/master-catalog/${id}`, {
      method: "PUT",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Something went wrong");
    }
    return data;
  },

  async updateMasterItemFields(id: string, fields: Record<string, any>) {
    return apiFetch(`/master-catalog/${id}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    });
  },

  // Taxonomy Services
  async listCategories(query = "") {
    return apiFetch(`/categories${query}`);
  },

  async createCategory(name: string) {
    return apiFetch("/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteCategory(id: string) {
    return apiFetch(`/categories/${id}`, {
      method: "DELETE",
    });
  },

  async listBrands(categoryId?: string, extra = "") {
    const params = new URLSearchParams(extra.replace(/^\?/, ""));
    if (categoryId) params.set("categoryId", categoryId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/brands${qs}`);
  },

  async createBrand(name: string, categoryId?: string) {
    return apiFetch("/brands", {
      method: "POST",
      body: JSON.stringify({ name, categoryId }),
    });
  },

  async deleteBrand(id: string) {
    return apiFetch(`/brands/${id}`, {
      method: "DELETE",
    });
  },

  async listManufacturers(query = "") {
    return apiFetch(`/manufacturers${query}`);
  },

  async createManufacturer(name: string) {
    return apiFetch("/manufacturers", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteManufacturer(id: string) {
    return apiFetch(`/manufacturers/${id}`, {
      method: "DELETE",
    });
  },

  async listUnits(query = "") {
    return apiFetch(`/units${query}`);
  },

  async createUnit(name: string) {
    return apiFetch("/units", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteUnit(id: string) {
    return apiFetch(`/units/${id}`, {
      method: "DELETE",
    });
  },

  async deleteMasterItem(id: string) {
    return apiFetch(`/master-catalog/${id}`, {
      method: "DELETE",
    });
  },

  async stockMovement(variantId: string, payload: { type: 'INWARD' | 'OUTWARD'; cartons: number; reason: string; note?: string }) {
    return apiFetch(`/master-catalog/variants/${variantId}/stock-movement`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateVariantSku(variantId: string, sku: string) {
    return apiFetch(`/master-catalog/variants/${variantId}/sku`, {
      method: "PATCH",
      body: JSON.stringify({ sku }),
    });
  },

  async bulkStockMovementBySku(
    rows: { sku: string; type: "INWARD" | "OUTWARD"; cartons: number; reason?: string; note?: string }[]
  ) {
    return apiFetch(`/master-catalog/stock-movement/bulk-by-sku`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  },
};
