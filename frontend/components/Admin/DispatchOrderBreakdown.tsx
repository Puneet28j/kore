import React from "react";
import OrderDetail from "../Distributor/OrderDetail";
import { Article, Inventory, Order } from "../../types";

interface DispatchOrderBreakdownProps {
  order: Order;
  articles: Article[];
  inventory: Inventory[];
  onBack: () => void;
}

const DispatchOrderBreakdown: React.FC<DispatchOrderBreakdownProps> = ({ order, articles, inventory, onBack }) => (
  <OrderDetail
    order={order}
    articles={articles}
    inventory={inventory}
    onBack={onBack}
    breakdownOnly
  />
);

export default DispatchOrderBreakdown;
