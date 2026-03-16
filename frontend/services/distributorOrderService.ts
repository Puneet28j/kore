
import { Order, OrderStatus } from "../types";

/**
 * Service to handle distributor orders.
 * Currently uses mock data, but is designed with async interface 
 * for easy backend integration in the future.
 */
class DistributorOrderService {
  // Mock data stored in memory for the session
  private mockOrders: Order[] = [
    {
      id: "ORD-982104",
      distributorId: "dist-1",
      distributorName: "Global Shoes Pvt Ltd",
      date: "2026-03-10",
      status: OrderStatus.DELIVERED,
      items: [
        { articleId: "art-1", cartonCount: 5, pairCount: 120, price: 45000 },
        { articleId: "art-2", cartonCount: 10, pairCount: 240, price: 96000 }
      ],
      totalAmount: 141000,
      totalCartons: 15,
      totalPairs: 360
    },
    {
      id: "ORD-982156",
      distributorId: "dist-1",
      distributorName: "Global Shoes Pvt Ltd",
      date: "2026-03-14",
      status: OrderStatus.DISPATCHED,
      items: [
        { articleId: "art-3", cartonCount: 8, pairCount: 192, price: 72000 }
      ],
      totalAmount: 72000,
      totalCartons: 8,
      totalPairs: 192
    },
    {
      id: "ORD-982201",
      distributorId: "dist-1",
      distributorName: "Global Shoes Pvt Ltd",
      date: "2026-03-16",
      status: OrderStatus.PENDING,
      items: [
        { articleId: "art-1", cartonCount: 3, pairCount: 72, price: 27000 },
        { articleId: "art-4", cartonCount: 5, pairCount: 120, price: 54000 }
      ],
      totalAmount: 81000,
      totalCartons: 8,
      totalPairs: 192
    }
  ];

  async getOrdersByDistributor(distributorId: string): Promise<Order[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // In a real app, we filter by distributorId.
    // For the dummy/demo phase, we'll return all mock orders 
    // but tag them with the current distributorId if they don't match.
    return this.mockOrders.map(order => ({
      ...order,
      distributorId: order.distributorId || distributorId
    }));
  }

  async getAllOrders(): Promise<Order[]> {
    await new Promise(resolve => setTimeout(resolve, 800));
    return this.mockOrders;
  }

  async placeOrder(order: Order): Promise<Order> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.mockOrders = [order, ...this.mockOrders];
    return order;
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    await new Promise(resolve => setTimeout(resolve, 400));
    return this.mockOrders.find(o => o.id === orderId);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | undefined> {
    await new Promise(resolve => setTimeout(resolve, 600));
    const order = this.mockOrders.find(o => o.id === orderId);
    if (order) {
      order.status = status;
    }
    return order;
  }
}

export const distributorOrderService = new DistributorOrderService();
