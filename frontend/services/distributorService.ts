import { apiFetch } from "./api";
import { User } from "../types";

export interface DistributorListResponse {
  items: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface DistributorResponse {
  data: User;
  message: string;
}

export const distributorService = {
  /**
   * Fetch all distributors with optional filters
   */
  async listDistributors(params?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }): Promise<DistributorListResponse> {
    const query = new URLSearchParams();

    if (params?.page) query.append("page", String(params.page));
    if (params?.limit) query.append("limit", String(params.limit));
    if (params?.search) query.append("search", params.search);
    if (params?.isActive !== undefined)
      query.append("isActive", String(params.isActive));

    const response = await apiFetch(`/distributors?${query.toString()}`);
    return {
      items: response.data,
      meta: response.meta,
    };
  },

  /**
   * Get a single distributor by ID
   */
  async getDistributorById(id: string): Promise<User> {
    const response = await apiFetch(`/distributors/${id}`);
    return response.data;
  },

  /**
   * Create a new distributor
   */
  async createDistributor(data: Partial<User>): Promise<User> {
    const response = await apiFetch("/distributors", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return response.data;
  },

  /**
   * Update an existing distributor
   */
  async updateDistributor(id: string, data: Partial<User>): Promise<User> {
    const response = await apiFetch(`/distributors/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return response.data;
  },

  /**
   * Toggle distributor status (activate/deactivate)
   */
  async toggleDistributorStatus(id: string): Promise<User> {
    const response = await apiFetch(`/distributors/${id}/toggle-status`, {
      method: "PATCH",
    });
    return response.data;
  },

  /**
   * Delete a distributor
   */
  async deleteDistributor(id: string): Promise<void> {
    await apiFetch(`/distributors/${id}`, {
      method: "DELETE",
    });
  },
};

export default distributorService;
