
import { useState, useEffect } from 'react';
import { 
  User, UserRole, Article, AssortmentType, Assortment, 
  Inventory, Order, OrderStatus, OrderItem 
} from './types';

// Initial Mock Data
const MOCK_ASSORTMENTS: Assortment[] = [
  {
    id: 'as-women-01',
    name: "Women's Standard",
    type: AssortmentType.WOMEN,
    totalPairsPerCarton: 24,
    // Fix: breakdown renamed to breakup and converted to array of SizeBreakup
    breakup: [
      { size: '4', pairs: 3 },
      { size: '5', pairs: 6 },
      { size: '6', pairs: 6 },
      { size: '7', pairs: 6 },
      { size: '8', pairs: 3 }
    ]
  },
  {
    id: 'as-men-01',
    name: "Men's Standard",
    type: AssortmentType.MEN,
    totalPairsPerCarton: 24,
    // Fix: breakdown renamed to breakup and converted to array of SizeBreakup
    breakup: [
      { size: '7', pairs: 4 },
      { size: '8', pairs: 6 },
      { size: '9', pairs: 6 },
      { size: '10', pairs: 5 },
      { size: '11', pairs: 3 }
    ]
  }
];

const MOCK_ARTICLES: Article[] = [
  // Fix: code renamed to sku and Category renamed to AssortmentType
  { id: 'art-01', sku: 'KK-101', name: 'Cloud Runner Z', category: AssortmentType.WOMEN, pricePerPair: 45, assortmentId: 'as-women-01', imageUrl: 'https://picsum.photos/seed/kk101/400/300' },
  { id: 'art-02', sku: 'KK-102', name: 'Urban Flex', category: AssortmentType.MEN, pricePerPair: 55, assortmentId: 'as-men-01', imageUrl: 'https://picsum.photos/seed/kk102/400/300' },
  { id: 'art-03', sku: 'KK-103', name: 'Sky Walker', category: AssortmentType.WOMEN, pricePerPair: 40, assortmentId: 'as-women-01', imageUrl: 'https://picsum.photos/seed/kk103/400/300' },
  { id: 'art-04', sku: 'KK-104', name: 'Terra Trek', category: AssortmentType.MEN, pricePerPair: 65, assortmentId: 'as-men-01', imageUrl: 'https://picsum.photos/seed/kk104/400/300' },
];

const MOCK_USERS: User[] = [
  { id: 'admin-1', name: 'Super Admin', email: 'admin@kore.com', role: UserRole.ADMIN },
  { 
    id: 'dist-1', 
    name: 'Metropolitan Footwear', 
    email: 'metro@dist.com', 
    role: UserRole.DISTRIBUTOR,
    // Fix: location changed from object to string
    location: 'New Delhi, India'
  },
  { 
    id: 'dist-2', 
    name: 'Coastal Steps', 
    email: 'coastal@dist.com', 
    role: UserRole.DISTRIBUTOR,
    // Fix: location changed from object to string
    location: 'Mumbai, India'
  }
];

export const useKoreStore = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('kore_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [articles] = useState<Article[]>(MOCK_ARTICLES);
  const [assortments] = useState<Assortment[]>(MOCK_ASSORTMENTS);
  const [inventory, setInventory] = useState<Inventory[]>(() => {
    const saved = localStorage.getItem('kore_inventory');
    // Fix: Inventory initialization updated to include availableStock and match interface (units in cartons)
    return saved ? JSON.parse(saved) : MOCK_ARTICLES.map(a => ({
      articleId: a.id,
      actualStock: 20, // 20 cartons initial
      reservedStock: 0,
      availableStock: 20
    }));
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('kore_orders');
    return saved ? JSON.parse(saved) : [];
  });

  const [cart, setCart] = useState<OrderItem[]>([]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('kore_inventory', JSON.stringify(inventory));
    localStorage.setItem('kore_orders', JSON.stringify(orders));
    if (currentUser) localStorage.setItem('kore_user', JSON.stringify(currentUser));
  }, [inventory, orders, currentUser]);

  const login = (email: string) => {
    const user = MOCK_USERS.find(u => u.email === email);
    if (user) {
      setCurrentUser(user);
    } else {
      alert('Invalid credentials (Try: admin@kore.com or metro@dist.com)');
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('kore_user');
  };

  const addToCart = (articleId: string, cartons: number) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    setCart(prev => {
      const existing = prev.find(item => item.articleId === articleId);
      if (existing) {
        return prev.map(item => item.articleId === articleId ? {
          ...item,
          cartonCount: item.cartonCount + cartons,
          // Fix: totalPairs renamed to pairCount
          pairCount: (item.cartonCount + cartons) * 24,
          price: (item.cartonCount + cartons) * 24 * article.pricePerPair
        } : item);
      }
      return [...prev, {
        articleId,
        cartonCount: cartons,
        // Fix: totalPairs renamed to pairCount
        pairCount: cartons * 24,
        price: cartons * 24 * article.pricePerPair
      }];
    });
  };

  const placeOrder = () => {
    if (!currentUser || cart.length === 0) return;

    const totalCartons = cart.reduce((acc, item) => acc + item.cartonCount, 0);
    const totalPairs = cart.reduce((acc, item) => acc + item.pairCount, 0);
    const totalAmount = cart.reduce((acc, item) => acc + item.price, 0);

    const newOrder: Order = {
      id: `ORD-${Date.now()}`,
      distributorId: currentUser.id,
      // Fix: added required distributorName
      distributorName: currentUser.name,
      items: [...cart],
      status: OrderStatus.BOOKED,
      date: new Date().toISOString(),
      totalCartons,
      totalPairs,
      totalAmount
    };

    // Check stock for status
    let isPending = false;
    const updatedInventory = [...inventory];
    
    cart.forEach(item => {
      const invItem = updatedInventory.find(i => i.articleId === item.articleId);
      if (invItem) {
        const available = invItem.actualStock - invItem.reservedStock;
        // Fix: logic updated to use cartonCount (units in cartons)
        if (available < item.cartonCount) {
          isPending = true;
        }
        invItem.reservedStock += item.cartonCount;
        invItem.availableStock = invItem.actualStock - invItem.reservedStock;
      }
    });

    if (isPending) newOrder.status = OrderStatus.PENDING;

    setOrders(prev => [newOrder, ...prev]);
    setInventory(updatedInventory);
    setCart([]);
    alert(isPending ? 'Order placed! Some items are pending stock.' : 'Order confirmed and inventory reserved!');
  };

  const updateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        // If transitioning to Dispatched, deduct from actual stock
        if (newStatus === OrderStatus.DISPATCHED && o.status !== OrderStatus.DISPATCHED) {
          setInventory(inv => inv.map(i => {
            const orderItem = o.items.find(item => item.articleId === i.articleId);
            if (orderItem) {
              // Fix: logic updated to use cartonCount (units in cartons)
              const newActual = i.actualStock - orderItem.cartonCount;
              const newReserved = i.reservedStock - orderItem.cartonCount;
              return {
                ...i,
                actualStock: newActual,
                reservedStock: newReserved,
                availableStock: newActual - newReserved
              };
            }
            return i;
          }));
        }
        return { ...o, status: newStatus };
      }
      return o;
    }));
  };

  const addInventory = (articleId: string, cartons: number) => {
    // Fix: logic updated to maintain availableStock consistency
    setInventory(prev => prev.map(i => i.articleId === articleId ? { 
      ...i, 
      actualStock: i.actualStock + cartons,
      availableStock: (i.actualStock + cartons) - i.reservedStock
    } : i));
    // Auto-fulfill check could go here
  };

  return {
    currentUser, login, logout,
    articles, assortments, inventory, orders, cart,
    addToCart, placeOrder, updateOrderStatus, addInventory,
    distributors: MOCK_USERS.filter(u => u.role === UserRole.DISTRIBUTOR)
  };
};
