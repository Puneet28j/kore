import { apiFetch } from './api';

export const authService = {
  login: async (email: string, password: string) => {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return response.data; // { token, user }
  },

  getMe: async () => {
    const response = await apiFetch('/auth/me');
    return response.data; // user object
  },

  logout: async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed on server', error);
    } finally {
      localStorage.removeItem('kore_token');
      localStorage.removeItem('kore_user');
    }
  }
};
