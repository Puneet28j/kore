import { apiFetch } from "./api";

export const masterCatalogService = {
  async listMasterItems(query: { q?: string; page?: number; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (query.q) params.append("q", query.q);
    if (query.page) params.append("page", query.page.toString());
    if (query.limit) params.append("limit", query.limit.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/master-catalog${queryString}`);
  },

  async getMasterItem(id: string) {
    return apiFetch(`/master-catalog/${id}`);
  },

  async createMasterItem(formData: FormData) {
    const token = localStorage.getItem('kore_token');
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api';
    
    const response = await fetch(`${API_BASE_URL}/master-catalog`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  },

  async updateMasterItem(id: string, formData: FormData) {
    const token = localStorage.getItem('kore_token');
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api';
    
    const response = await fetch(`${API_BASE_URL}/master-catalog/${id}`, {
      method: "PUT",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  },

  // Taxonomy Services
  async listCategories() {
    return apiFetch("/categories");
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

  async listBrands() {
    return apiFetch("/brands");
  },

  async createBrand(name: string) {
    return apiFetch("/brands", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteBrand(id: string) {
    return apiFetch(`/brands/${id}`, {
      method: "DELETE",
    });
  },

  async listManufacturers() {
    return apiFetch("/manufacturers");
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

  async listUnits() {
    return apiFetch("/units");
  },
};
