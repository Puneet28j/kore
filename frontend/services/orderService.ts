import axios from "axios";
import { Order, OrderStatus } from "../types"; // Using types from the main file

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";
const API_URL = `${API_BASE_URL}/orders`;

const getAuthHeaders = () => {
  const token = localStorage.getItem("kore_token");
  if (!token) throw new Error("No token found");
  return { Authorization: `Bearer ${token}` };
};

export const orderService = {
  createOrder: async (orderData: Partial<Order>) => {
    return axios.post(API_URL, orderData, {
      headers: getAuthHeaders(),
    });
  },

  getMyOrders: async () => {
    return axios.get(`${API_URL}/my-orders`, {
      headers: getAuthHeaders(),
    });
  },

  getAllOrders: async () => {
    return axios.get(API_URL, {
      headers: getAuthHeaders(),
    });
  },

  updateOrderStatus: async (id: string, status: OrderStatus) => {
    return axios.patch(
      `${API_URL}/${id}/status`,
      { status },
      { headers: getAuthHeaders() }
    );
  },

  getOverdueOrders: async () => {
    return axios.get(`${API_URL}/overdue`, { headers: getAuthHeaders() });
  },

  recordPayment: async (id: string, amount: number, note?: string) => {
    return axios.post(`${API_URL}/${id}/record-payment`, { amount, note }, { headers: getAuthHeaders() });
  },
};
