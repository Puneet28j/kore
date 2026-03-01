import { apiFetch } from './api';
import { User } from '../types';

export const userService = {
  createUser: async (userData: { name: string; email: string; password: string; role: string }) => {
    const response = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return response.data;
  },

  listUsers: async (params: { page?: number; limit?: number; search?: string; role?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.search) query.append('search', params.search);
    if (params.role) query.append('role', params.role);

    const response = await apiFetch(`/users?${query.toString()}`);
    return response; // { data: items[], meta: {} }
  },

  updateUser: async (userId: string, userData: Partial<{ name: string; email: string; role: string }>) => {
    const response = await apiFetch(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(userData),
    });
    return response.data;
  },

  deleteUser: async (userId: string) => {
    await apiFetch(`/users/${userId}`, {
      method: 'DELETE',
    });
  }
};
