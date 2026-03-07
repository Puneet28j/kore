import { apiFetch } from "./api";

export const grnService = {
  async listReferences(search: string = "") {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/grn/references${query}`);
  },

  async history(search: string = "") {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/grn/history${query}`);
  },

  // other methods (draft, scan, submit) can be added later if needed
};
