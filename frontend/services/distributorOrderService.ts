import axios from "axios";
import { Order, OrderStatus } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";
const API_URL = `${API_BASE_URL}/orders`;

const getAuthHeaders = () => {
  const token = localStorage.getItem("kore_token");
  if (!token) throw new Error("No token found");
  return { Authorization: `Bearer ${token}` };
};

class DistributorOrderService {
  private mapOrder(o: any): Order {
    return { ...o, id: o._id || o.id };
  }

  async getOrdersByDistributor(
    distributorId: string,
    params: { page?: number; limit?: number; q?: string; status?: string } = {}
  ): Promise<{ items: Order[]; meta: any }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.q) query.append("q", params.q);
    if (params.status) query.append("status", params.status);

    const res = await axios.get(`${API_URL}/my-orders?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return {
      items: (res.data.data || []).map((o: any) => this.mapOrder(o)),
      meta: res.data.meta,
    };
  }

  async getAllOrders(
    params: { page?: number; limit?: number; q?: string; status?: string } = {}
  ): Promise<{ items: Order[]; meta: any }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.q) query.append("q", params.q);
    if (params.status) query.append("status", params.status);

    const res = await axios.get(`${API_URL}?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return {
      items: (res.data.data || []).map((o: any) => this.mapOrder(o)),
      meta: res.data.meta,
    };
  }

  async placeOrder(order: Partial<Order>): Promise<Order> {
    const res = await axios.post(API_URL, order, {
      headers: getAuthHeaders(),
    });
    return this.mapOrder(res.data.data);
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    const res = await this.getAllOrders({ limit: 1000 }); // Fetch a large batch or implement single fetch
    return res.items.find((o) => o.id === orderId);
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus
  ): Promise<Order | undefined> {
    const res = await axios.patch(
      `${API_URL}/${orderId}/status`,
      { status },
      { headers: getAuthHeaders() }
    );
    return this.mapOrder(res.data.data);
  }
}

export const distributorOrderService = new DistributorOrderService();
