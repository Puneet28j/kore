import { PurchaseOrder } from "../types";

export interface Bill {
  id: string;
  purchaseOrder: PurchaseOrder;
  billStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvalRemarks: string;
  rejectionRemarks: string;
  approvedAt?: string;
  rejectedAt?: string;
}

class BillService {
  // Frontend-only storage for bills
  private bills: Bill[] = [];

  // In-memory storage - initialize from localStorage
  constructor() {
    const saved = localStorage.getItem("kore_bills");
    if (saved) {
      try {
        this.bills = JSON.parse(saved);
      } catch (e) {
        this.bills = [];
      }
    }
  }

  // Save bills to localStorage
  private saveBills() {
    localStorage.setItem("kore_bills", JSON.stringify(this.bills));
  }

  // Convert PO to Bill (PENDING status)
  convertPOToBill(po: PurchaseOrder): Bill {
    return {
      id: `bill-${po.id}`,
      purchaseOrder: po,
      billStatus: "PENDING",
      approvalRemarks: "",
      rejectionRemarks: "",
    };
  }

  // Add new bill (when PO is created/sent)
  addBill(bill: Bill): void {
    // Remove existing bill with same PO id if it exists (for updates)
    this.bills = this.bills.filter((b) => b.purchaseOrder.id !== bill.purchaseOrder.id);
    // Add new bill at the beginning
    this.bills.unshift(bill);
    this.saveBills();
  }

  // Get all bills
  async getBills(): Promise<{ data: Bill[] }> {
    // Simulated async call for consistency with backend integration
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ data: [...this.bills] });
      }, 100);
    });
  }

  // Get single bill by ID
  async getBill(id: string): Promise<{ data: Bill }> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const bill = this.bills.find((b) => b.id === id);
        if (bill) {
          resolve({ data: bill });
        } else {
          reject(new Error("Bill not found"));
        }
      }, 100);
    });
  }

  // Approve a bill
  async approveBill(id: string, remarks: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const bill = this.bills.find((b) => b.id === id);
        if (bill) {
          bill.billStatus = "APPROVED";
          bill.approvalRemarks = remarks;
          bill.approvedAt = new Date().toISOString();
          this.saveBills();
        }
        resolve();
      }, 300);
    });
  }

  // Reject a bill
  async rejectBill(id: string, remarks: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const bill = this.bills.find((b) => b.id === id);
        if (bill) {
          bill.billStatus = "REJECTED";
          bill.rejectionRemarks = remarks;
          bill.rejectedAt = new Date().toISOString();
          this.saveBills();
        }
        resolve();
      }, 300);
    });
  }

  // Get bills by status
  getBillsByStatus(status: "PENDING" | "APPROVED" | "REJECTED"): Bill[] {
    return this.bills.filter((b) => b.billStatus === status);
  }

  // Clear all bills (for testing)
  clearBills(): void {
    this.bills = [];
    localStorage.removeItem("kore_bills");
  }
}

export const billService = new BillService();