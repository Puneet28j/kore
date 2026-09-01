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
    params: { page?: number; limit?: number; q?: string; status?: string; startDate?: string; endDate?: string; sortBy?: string; sortDesc?: boolean; orderType?: string } = {}
  ): Promise<{ items: Order[]; meta: any }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.q) query.append("q", params.q);
    if (params.status) query.append("status", params.status);
    if (params.startDate) query.append("startDate", params.startDate);
    if (params.endDate) query.append("endDate", params.endDate);
    if (params.sortBy) query.append("sortBy", params.sortBy);
    if (params.sortDesc !== undefined) query.append("sortDesc", params.sortDesc.toString());
    if (params.orderType) query.append("orderType", params.orderType);
    query.append("_t", Date.now().toString()); // Cache buster for real-time sync

    const res = await axios.get(`${API_URL}/my-orders?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return {
      items: (res.data.data || []).map((o: any) => this.mapOrder(o)),
      meta: res.data.meta,
    };
  }

  async getAllOrders(
    params: { page?: number; limit?: number; q?: string; status?: string; lifecycle?: 'DISPATCHED' | 'IN_TRANSIT' | 'RECEIVED'; startDate?: string; endDate?: string; sortBy?: string; sortDesc?: boolean; orderType?: string } = {}
  ): Promise<{ items: Order[]; meta: any }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.q) query.append("q", params.q);
    if (params.status) query.append("status", params.status);
    if (params.lifecycle) query.append("lifecycle", params.lifecycle);
    if (params.startDate) query.append("startDate", params.startDate);
    if (params.endDate) query.append("endDate", params.endDate);
    if (params.sortBy) query.append("sortBy", params.sortBy);
    if (params.sortDesc !== undefined) query.append("sortDesc", params.sortDesc.toString());
    if (params.orderType) query.append("orderType", params.orderType);
    query.append("_t", Date.now().toString()); // Cache buster for real-time sync

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
    try {
      const res = await axios.get(`${API_URL}/${orderId}`, {
        headers: getAuthHeaders(),
        params: { _t: Date.now() },
      });
      return this.mapOrder(res.data.data);
    } catch {
      return undefined;
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    options: {
      allocatedItems?: any[];
      blockedItems?: any[];
      files?: Record<string, File>;
      receiverName?: string;
      receiverMobile?: string;
      deliveryAgentName?: string;
      deliveryAgentMobile?: string;
      deliveryNote?: string;
      // Booking commitment
      expectedDispatchDate?: string;
      bookingPriority?: 'NORMAL' | 'URGENT';
      adminNote?: string;
      stockStatus?: 'DISPATCH_READY' | 'BLOCK_HOLD' | 'NO_STOCK';
      blockReason?: string;
      // Dispatch details (BOOKED → PFD)
      vehicleNo?: string;
      lrNo?: string;
      transporterName?: string;
      eWayBillNo?: string;
      driverName?: string;
      driverMobile?: string;
      grossWeightKg?: number;
      outScannedCartons?: string[];
      itemDispatchCounts?: Record<string, number>;
    } = {}
  ): Promise<Order | undefined> {
    const formData = new FormData();
    formData.append("status", status);

    if (options.allocatedItems)    formData.append("allocatedItems", JSON.stringify(options.allocatedItems));
    if (options.blockedItems)      formData.append("blockedItems",   JSON.stringify(options.blockedItems));
    if (options.receiverName)      formData.append("receiverName",      options.receiverName);
    if (options.receiverMobile)    formData.append("receiverMobile",    options.receiverMobile);
    if (options.deliveryAgentName)   formData.append("deliveryAgentName",   options.deliveryAgentName);
    if (options.deliveryAgentMobile) formData.append("deliveryAgentMobile", options.deliveryAgentMobile);
    if (options.deliveryNote)        formData.append("deliveryNote",        options.deliveryNote);
    if (options.expectedDispatchDate) formData.append("expectedDispatchDate", options.expectedDispatchDate);
    if (options.bookingPriority)      formData.append("bookingPriority",      options.bookingPriority);
    if (options.adminNote !== undefined) formData.append("adminNote", options.adminNote ?? "");
    if (options.stockStatus)          formData.append("stockStatus",          options.stockStatus);
    if (options.blockReason !== undefined) formData.append("blockReason", options.blockReason ?? "");
    // Dispatch fields
    if (options.vehicleNo)       formData.append("vehicleNo",       options.vehicleNo);
    if (options.lrNo)            formData.append("lrNo",            options.lrNo);
    if (options.transporterName) formData.append("transporterName", options.transporterName);
    if (options.eWayBillNo)      formData.append("eWayBillNo",      options.eWayBillNo);
    if (options.driverName)      formData.append("driverName",      options.driverName);
    if (options.driverMobile)    formData.append("driverMobile",    options.driverMobile);
    if (options.grossWeightKg)   formData.append("grossWeightKg",   String(options.grossWeightKg));
    if (options.outScannedCartons) formData.append("outScannedCartons", JSON.stringify(options.outScannedCartons));
    if (options.itemDispatchCounts) formData.append("itemDispatchCounts", JSON.stringify(options.itemDispatchCounts));

    if (options.files) {
      Object.entries(options.files).forEach(([key, file]) => {
        formData.append(key, file);
      });
    }

    const res = await axios.patch(
      `${API_URL}/${orderId}/status`,
      formData,
      {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return this.mapOrder(res.data.data);
  }

  // ── Per-carton dispatch lifecycle (Scan / Transport / Receive tabs) ─────

  async getVariantAvailableCartons(variantId: string): Promise<string[]> {
    const CATALOG_URL = `${API_BASE_URL}/master-catalog`;
    const res = await axios.get(
      `${CATALOG_URL}/variants/${variantId}/available-cartons`,
      { headers: getAuthHeaders() }
    );
    return res.data.availableCartons || [];
  }

  async scanCarton(orderId: string, cartonCode: string, itemKey: string): Promise<Order | undefined> {
    const res = await axios.post(
      `${API_URL}/${orderId}/scan`,
      { cartonCode, itemKey },
      { headers: getAuthHeaders() }
    );
    return this.mapOrder(res.data.data);
  }

  async submitTransit(
    orderId: string,
    cartonCodes: string[],
    fields: {
      vehicleNo: string; lrNo?: string; transporterName: string; eWayBillNo?: string;
      driverName?: string; driverMobile?: string; grossWeightKg?: number;
      files?: { invoice?: File; ewayBill?: File; transportBill?: File };
    }
  ): Promise<Order | undefined> {
    const formData = new FormData();
    formData.append("cartonCodes", JSON.stringify(cartonCodes));
    formData.append("vehicleNo", fields.vehicleNo);
    formData.append("transporterName", fields.transporterName);
    if (fields.lrNo)         formData.append("lrNo", fields.lrNo);
    if (fields.eWayBillNo)   formData.append("eWayBillNo", fields.eWayBillNo);
    if (fields.driverName)   formData.append("driverName", fields.driverName);
    if (fields.driverMobile) formData.append("driverMobile", fields.driverMobile);
    if (fields.grossWeightKg) formData.append("grossWeightKg", String(fields.grossWeightKg));
    if (fields.files) {
      Object.entries(fields.files).forEach(([key, file]) => { if (file) formData.append(key, file); });
    }

    const res = await axios.post(
      `${API_URL}/${orderId}/transit`,
      formData,
      { headers: { ...getAuthHeaders(), "Content-Type": "multipart/form-data" } }
    );
    return this.mapOrder(res.data.data);
  }

  async receiveCartons(
    orderId: string,
    cartonCodes: string[],
    fields: { receiverName: string; receiverMobile: string; receivingNote?: File }
  ): Promise<Order | undefined> {
    const formData = new FormData();
    formData.append("cartonCodes", JSON.stringify(cartonCodes));
    formData.append("receiverName", fields.receiverName);
    formData.append("receiverMobile", fields.receiverMobile);
    if (fields.receivingNote) formData.append("receivingNote", fields.receivingNote);

    const res = await axios.post(
      `${API_URL}/${orderId}/receive`,
      formData,
      { headers: { ...getAuthHeaders(), "Content-Type": "multipart/form-data" } }
    );
    return this.mapOrder(res.data.data);
  }

  async markAsReceived(
    orderId: string,
    data: { receivingNote: File, receiverName: string, receiverMobile: string }
  ): Promise<Order | undefined> {
    const formData = new FormData();
    formData.append("status", OrderStatus.RECEIVED);
    formData.append("receivingNote", data.receivingNote);
    formData.append("receiverName", data.receiverName);
    formData.append("receiverMobile", data.receiverMobile);

    const res = await axios.patch(
      `${API_URL}/${orderId}/status`,
      formData,
      {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return this.mapOrder(res.data.data);
  }

  async processReturn(orderId: string, items: { variantId: string; cartons: number }[], reason?: string, batchNumber?: number): Promise<any> {
    const res = await axios.post(
      `${API_URL}/return`,
      { orderId, items, reason, batchNumber },
      { headers: getAuthHeaders() }
    );
    return res.data.data;
  }

  async deleteOrder(orderId: string): Promise<void> {
    await axios.delete(`${API_URL}/${orderId}`, { headers: getAuthHeaders() });
  }

  async editOrder(orderId: string, items: any[]): Promise<Order | undefined> {
    const res = await axios.patch(`${API_URL}/${orderId}/edit`, { items }, { headers: getAuthHeaders() });
    return this.mapOrder(res.data.data);
  }

  async getOrderStats(): Promise<Record<string, number>> {
    const res = await axios.get(`${API_URL}/stats`, { headers: getAuthHeaders() });
    return res.data.data || {};
  }

  async getDashboardMetrics(params: { startDate?: string; endDate?: string } = {}): Promise<{
    totalRevenue: number;
    ordersPlaced: number;
    orderedCartons: number;
    dispatchedCartons: number;
  }> {
    const query = new URLSearchParams();
    if (params.startDate) query.append("startDate", params.startDate);
    if (params.endDate) query.append("endDate", params.endDate);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await axios.get(`${API_URL}/dashboard-metrics${qs}`, { headers: getAuthHeaders() });
    return res.data.data || { totalRevenue: 0, ordersPlaced: 0, orderedCartons: 0, dispatchedCartons: 0 };
  }

  async getReturnHistory(params: { page?: number; limit?: number; q?: string } = {}): Promise<{ items: any[]; meta: any }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.q) query.append("q", params.q);

    const res = await axios.get(`${API_URL}/returns?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return {
      items: res.data.data || [],
      meta: res.data.meta,
    };
  }
}

export const distributorOrderService = new DistributorOrderService();
