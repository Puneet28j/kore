import { PurchaseOrder } from "../types";
import { apiFetch } from "./api";

export interface Bill extends PurchaseOrder {
  // Bill-specific fields are now part of PurchaseOrder
  // billStatus, billRemark, billApprovedAt, billRejectedAt are in PO
}

class BillService {
  // Get all bills
  async getBills(
    query: {
      page?: number;
      limit?: number;
      q?: string;
      billStatus?: string;
    } = {}
  ): Promise<{ data: Bill[]; meta?: any }> {
    const params = new URLSearchParams();
    if (query.page) params.append("page", query.page.toString());
    if (query.limit) params.append("limit", query.limit.toString());
    if (query.q) params.append("q", query.q);
    if (query.billStatus) params.append("billStatus", query.billStatus);

    const queryString = params.toString();
    const endpoint = `/purchase-orders/bills${
      queryString ? `?${queryString}` : ""
    }`;

    const response = await apiFetch(endpoint);

    // Transform _id to id for frontend compatibility
    const transformedData = response.data.map((bill: any) => {
      console.log("Transforming bill:", bill._id, "to id:", bill._id);
      return {
        ...bill,
        id: bill._id,
      };
    });

    console.log("Transformed bills:", transformedData);

    return {
      ...response,
      data: transformedData,
    };
  }

  // Get single bill by ID
  async getBill(id: string): Promise<{ data: Bill }> {
    const response = await apiFetch(`/purchase-orders/bills/${id}`);

    // Transform _id to id for frontend compatibility
    return {
      ...response,
      data: {
        ...response.data,
        id: response.data._id,
      },
    };
  }

  // Approve a bill
  async approveBill(id: string, remarks: string): Promise<void> {
    return apiFetch(`/purchase-orders/${id}/bill/approve`, {
      method: "PATCH",
      body: JSON.stringify({ remark: remarks }),
    });
  }

  // Reject a bill
  async rejectBill(id: string, remarks: string): Promise<void> {
    return apiFetch(`/purchase-orders/${id}/bill/reject`, {
      method: "PATCH",
      body: JSON.stringify({ remark: remarks }),
    });
  }

  // Legacy methods for backward compatibility (can be removed later)
  convertPOToBill(po: PurchaseOrder): Bill {
    return po as Bill;
  }

  addBill(bill: Bill): void {
    // This method is no longer needed with real API
    console.warn(
      "addBill is deprecated. Bills are now managed through the API."
    );
  }

  getBillsByStatus(
    status: "PENDING" | "APPROVED" | "REJECTED"
  ): Promise<Bill[]> {
    // This method is no longer needed with real API
    console.warn(
      "getBillsByStatus is deprecated. Use getBills with query parameters instead."
    );
    return this.getBills({ billStatus: status }).then((res) => res.data);
  }

  clearBills(): void {
    // This method is no longer needed with real API
    console.warn(
      "clearBills is deprecated. Bills are now managed through the API."
    );
  }
}

export const billService = new BillService();
