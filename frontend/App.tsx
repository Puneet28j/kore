import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingBag,
  Package,
  Truck,
  ShoppingCart,
  Clock,
  Loader2,
} from "lucide-react";

import {
  User,
  UserRole,
  Article,
  Order,
  Inventory,
  OrderStatus,
  Assortment,
} from "./types";

import { INITIAL_ARTICLES, MOCK_DISTRIBUTORS, ASSORTMENTS } from "./constants";

import AdminDashboard from "./components/Admin/AdminDashboard";
import MasterInventory from "./components/Admin/MasterInventory";
import BookingInventory from "./components/Admin/BookingInventory";
import OrderProcessor from "./components/Admin/OrderProcessor";
import CatalogueManager from "./components/Admin/CatalogueManager";
import Shop from "./components/Distributor/Shop";
import MyOrders from "./components/Distributor/MyOrders";
import Cart from "./components/Distributor/Cart";
import Auth from "./components/Auth";
import POPage from "./components/Admin/POPage";
import GRN from "./components/Admin/GRN";
import ProductMaster from "./components/Admin/ProductMaster";
import VendorManager from "./components/Admin/VendorManager";
import VariantDetailsPage from "./components/Admin/VariantDetailsPage";
import UserManager from "./components/Admin/UserManager";
import DistributorManager from "./components/Admin/DistributorManager";
import ProfilePage from "./components/Admin/ProfilePage";
import { masterCatalogService } from "./services/masterCatalogService";

// ✅ NEW: Sidebar component (create this file separately)
import Sidebar from "./components/Layout/Sidebar";
import { useKoreStore } from "./store";
import { Toaster, toast } from "sonner";
import Bill from "./components/Admin/Bill";
import { distributorOrderService } from "./services/distributorOrderService";

const App: React.FC = () => {
  const store = useKoreStore();
  const { currentUser: user, checkAuth, isLoadingAuth } = store;

  useEffect(() => {
    checkAuth();
  }, []);

  // Use URL hash for reliable tab persistence
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return hash || localStorage.getItem("kore_activeTab") || "dashboard";
  });

  useEffect(() => {
    localStorage.setItem("kore_activeTab", activeTab);
    window.location.hash = activeTab;

    // Listen for hash changes so browser back/forward buttons work
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && hash !== activeTab) {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [activeTab]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Articles state from API
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  // --- Deep Link Draft Persistence ---
  const savedAppDraftStr = localStorage.getItem("kore_app_draft");
  const savedAppDraft = savedAppDraftStr ? JSON.parse(savedAppDraftStr) : null;

  const [editingArticleId, setEditingArticleId] = useState<string | null>(
    savedAppDraft?.editingArticleId || null
  );
  const [viewingVariant, setViewingVariant] = useState<{
    articleId: string;
    variantId: string;
  } | null>(savedAppDraft?.viewingVariant || null);
  const [catalogueExpandedIds, setCatalogueExpandedIds] = useState<Set<string>>(
    new Set(savedAppDraft?.catalogueExpandedIds || [])
  );
  const [previousTab, setPreviousTab] = useState<string>(
    savedAppDraft?.previousTab || "catalogue"
  );

  useEffect(() => {
    localStorage.setItem(
      "kore_app_draft",
      JSON.stringify({
        editingArticleId,
        viewingVariant,
        catalogueExpandedIds: Array.from(catalogueExpandedIds),
        previousTab,
      })
    );
  }, [editingArticleId, viewingVariant, catalogueExpandedIds, previousTab]);

  const handleTabChange = (tab: string) => {
    // Reset sub-view states when user explicitly navigates via sidebar
    setEditingArticleId(null);
    setViewingVariant(null);
    setCatalogueExpandedIds(new Set());
    
    // Clear major drafts from localStorage
    localStorage.removeItem("kore_app_draft");
    localStorage.removeItem("kore_po_draft");
    
    setActiveTab(tab);
  };

  const handleViewVariant = (articleId: string, variantId: string) => {
    setPreviousTab("catalogue");
    setViewingVariant({ articleId, variantId });
    setActiveTab("variant_details");
  };

  const handleEditArticle = (id: string) => {
    setPreviousTab(activeTab);
    setEditingArticleId(id);
    setActiveTab("master");
  };

  const fetchArticles = async () => {
    try {
      setLoadingArticles(true);
      const res = await masterCatalogService.listMasterItems();
      const mapped = res.data.map((item: any) => {
        // Normalize variants: convert sizeMap -> sizeSkus/sizeQuantities
        const normalizedVariants = (item.variants || []).map((v: any) => {
          const sizeSkus: Record<string, string> = {};
          const sizeQuantities: Record<string, number> = {};
          if (v.sizeMap) {
            Object.entries(v.sizeMap).forEach(([sz, cell]: [string, any]) => {
              sizeSkus[sz] = cell.sku || "";
              sizeQuantities[sz] = cell.qty || 0;
            });
          }
          return {
            ...v,
            id: v._id || Math.random().toString(36).substr(2, 9),
            sizeSkus,
            sizeQuantities,
          };
        });

        // Use Article's own SKU if available (from backend or master creation)
        const topSku = item.sku || "";

        return {
          id: item._id,
          sku: topSku,
          name: item.articleName,
          category: item.gender,
          productCategory: item.categoryId?.name,
          brand: item.brandId?.name,
          pricePerPair: item.variants?.[0]?.sellingPrice || item.mrp,
          mrp: item.mrp,
          soleColor: item.soleColor,
          manufacturer: item.manufacturerCompanyId?.name,
          unit: item.unitId?.name,
          status: item.stage,
          expectedDate: item.expectedAvailableDate
            ? new Date(item.expectedAvailableDate).toISOString().split("T")[0]
            : "",
          imageUrl: item.primaryImage?.url,
          secondaryImages: item.secondaryImages || [],
          selectedSizes: item.sizeRanges || [],
          selectedColors: item.productColors || [],
          colorMedia: item.colorMedia || [],
          variants: normalizedVariants,
          isActive: item.isActive !== false,
        };
      });
      setArticles(mapped);
    } catch (err) {
      console.error("Failed to fetch articles", err);
    } finally {
      setLoadingArticles(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Fetch orders
  useEffect(() => {
    if (user) {
      const fetchOrders = async () => {
        setLoadingOrders(true);
        try {
          if (user.role === UserRole.DISTRIBUTOR) {
            const data = await distributorOrderService.getOrdersByDistributor(user.id);
            setOrders(data);
          } else {
            // Admins/Managers see all orders
            const data = await distributorOrderService.getAllOrders();
            setOrders(data);
          }
        } catch (err) {
          console.error("Failed to fetch orders", err);
        } finally {
          setLoadingOrders(false);
        }
      };
      fetchOrders();
    }
  }, [user]);

  // Initialize inventory based on articles
  const [inventory, setInventory] = useState<Inventory[]>(() => {
    const saved = localStorage.getItem("kore_inventory");
    if (saved) return JSON.parse(saved);

    return articles.map((a) => ({
      articleId: a.id,
      actualStock: 100,
      reservedStock: 0,
      availableStock: 100,
    }));
  });

  // Cart items now track variants and size breakdowns instead of simple carton counts
  type CartItem = {
    articleId: string;
    variantId?: string;
    sizeQuantities?: Record<string, number>;
    cartonCount: number;
    pairCount: number;
    price: number;
  };

  const [cart, setCart] = useState<CartItem[]>([]);

  // PERSISTENCE
  useEffect(() => {
    if (user) {
      localStorage.setItem("kore_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("kore_user");
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("kore_articles", JSON.stringify(articles));
  }, [articles]);

  useEffect(() => {
    localStorage.setItem("kore_inventory", JSON.stringify(inventory));
  }, [inventory]);

  // Ensure inventory exists for all articles (useful when adding new articles)
  useEffect(() => {
    setInventory((prev) => {
      const existingIds = prev.map((i) => i.articleId);
      const newArticles = articles.filter((a) => !existingIds.includes(a.id));
      if (newArticles.length === 0) return prev;

      const newInventoryItems = newArticles.map((a) => ({
        articleId: a.id,
        actualStock: 0,
        reservedStock: 0,
        availableStock: 0,
      }));
      return [...prev, ...newInventoryItems];
    });
  }, [articles]);

  // DERIVED STATE
  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.price, 0);
  }, [cart]);

  const cartItemsCount = useMemo(() => {
    // show total cartons in cart for badge/checkout button
    return cart.reduce((sum, item) => sum + item.cartonCount, 0);
  }, [cart]);

  // ACTIONS
  const handleLogin = async (email: string, password: string) => {
    await store.login(email, password);
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    store.logout();
    setCart([]);
  };

  // Catalogue Actions
  const addArticle = (article: Article) => {
    setArticles((prev) => [article, ...prev]);
  };

  const updateArticle = (article: Article) => {
    setArticles((prev) => prev.map((a) => (a.id === article.id ? article : a)));
  };

  const deleteArticle = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this master article?"))
      return;

    const deletePromise = async () => {
      await masterCatalogService.deleteMasterItem(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setInventory((prev) => prev.filter((i) => i.articleId !== id));
      setCart((prev) => prev.filter((i) => i.articleId !== id));
    };

    toast.promise(deletePromise(), {
      loading: "Deleting article...",
      success: "Article deleted successfully",
      error: (err: any) => err.message || "Failed to delete article",
    });
  };

  // add given sizeQuantities for a particular variant
  const addToCart = (
    articleId: string,
    variantId: string | undefined,
    sizeQuantities: Record<string, number>
  ) => {
    const pairCount = Object.values(sizeQuantities).reduce(
      (s, v) => s + Number(v || 0),
      0
    );
    if (pairCount === 0 || pairCount % 24 !== 0) {
      toast.error("Total pairs must be a positive multiple of 24");
      return;
    }
    const cartonCount = pairCount / 24;

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.articleId === articleId && i.variantId === variantId
      );
      if (existing) {
        const newPairs = existing.pairCount + pairCount;
        return prev.map((i) =>
          i.articleId === articleId && i.variantId === variantId
            ? {
                ...i,
                cartonCount: i.cartonCount + cartonCount,
                pairCount: newPairs,
                price:
                  newPairs *
                  (articles.find((a) => a.id === articleId)?.pricePerPair || 0),
                sizeQuantities: {
                  ...(existing.sizeQuantities || {}),
                  ...sizeQuantities,
                },
              }
            : i
        );
      }
      return [
        ...prev,
        {
          articleId,
          variantId,
          sizeQuantities,
          cartonCount,
          pairCount,
          price:
            pairCount *
            (articles.find((a) => a.id === articleId)?.pricePerPair || 0),
        },
      ];
    });
  };

  // remove an entire variant entry from cart
  const removeFromCart = (articleId: string, variantId?: string) => {
    setCart((prev) =>
      prev.filter(
        (i) => !(i.articleId === articleId && i.variantId === variantId)
      )
    );
  };

  const clearCartItem = (articleId: string, variantId?: string) => {
    setCart((prev) =>
      prev.filter(
        (i) => !(i.articleId === articleId && i.variantId === variantId)
      )
    );
  };

  const handleInwardStock = (articleId: string, cartons: number) => {
    setInventory((prev) =>
      prev.map((inv) => {
        if (inv.articleId === articleId) {
          const newActual = inv.actualStock + cartons;
          return {
            ...inv,
            actualStock: newActual,
            availableStock: newActual - inv.reservedStock,
          };
        }
        return inv;
      })
    );
  };

  const handleOutwardStock = (articleId: string, cartons: number) => {
    setInventory((prev) =>
      prev.map((inv) => {
        if (inv.articleId === articleId) {
          const newActual = Math.max(0, inv.actualStock - cartons);
          return {
            ...inv,
            actualStock: newActual,
            availableStock: newActual - inv.reservedStock,
          };
        }
        return inv;
      })
    );
  };

  const placeOrder = async () => {
    if (!user || cart.length === 0) return;

    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      distributorId: user.id,
      distributorName: user.name,
      date: new Date().toISOString().split("T")[0],
      status: OrderStatus.BOOKED,
      items: cart.map((item) => {
        const article = articles.find((a) => a.id === item.articleId)!;
        return {
          articleId: item.articleId,
          variantId: item.variantId,
          cartonCount: item.cartonCount,
          pairCount: item.pairCount,
          price: item.price,
        };
      }),
      totalAmount: cartTotal,
      totalCartons: cart.reduce((sum, i) => sum + i.cartonCount, 0),
      totalPairs: cart.reduce((sum, i) => sum + i.pairCount, 0),
    };

    const placePromise = async () => {
      const response = await distributorOrderService.placeOrder(newOrder);
      setOrders((prev) => [response, ...prev]);

      // reserve stock
      setInventory((prev) =>
        prev.map((inv) => {
          const cartItem = cart.find((ci) => ci.articleId === inv.articleId);
          if (cartItem) {
            const newReserved = inv.reservedStock + cartItem.cartonCount;
            return {
              ...inv,
              reservedStock: newReserved,
              availableStock: inv.actualStock - newReserved,
            };
          }
          return inv;
        })
      );

      setCart([]);
      setActiveTab("orders");
    };

    toast.promise(placePromise(), {
      loading: "Placing your order...",
      success: "Order placed successfully!",
      error: "Failed to place order",
    });
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const updatePromise = async () => {
      await distributorOrderService.updateOrderStatus(orderId, status);

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === orderId) {
            // dispatch: deduct actual + release reserved (only once)
            if (
              status === OrderStatus.DISPATCHED &&
              o.status !== OrderStatus.DISPATCHED
            ) {
              setInventory((invs) =>
                invs.map((inv) => {
                  const item = o.items.find(
                    (i) => i.articleId === inv.articleId
                  );
                  if (item) {
                    const newActual = inv.actualStock - item.cartonCount;
                    const newReserved = inv.reservedStock - item.cartonCount;
                    return {
                      ...inv,
                      actualStock: newActual,
                      reservedStock: newReserved,
                      availableStock: newActual - newReserved,
                    };
                  }
                  return inv;
                })
              );
            }
            return { ...o, status };
          }
          return o;
        })
      );
    };

    toast.promise(updatePromise(), {
      loading: "Updating order status...",
      success: `Order ${orderId} marked as ${status.replace(/_/g, " ")}`,
      error: "Failed to update order status",
    });
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 relative overflow-x-hidden">
      {/* ✅ Sidebar extracted */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        cartItemsCount={cartItemsCount}
        onLogout={handleLogout}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      {/* Main Content */}
      <main
        className={`flex-1 p-4 md:p-8 pt-20 md:pt-8 transition-all duration-300
  ${isCollapsed ? "md:ml-20" : "md:ml-64"}
`}
      >
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold capitalize text-slate-900">
              {activeTab.replace(/_/g, " ")}
            </h2>
            <p className="text-slate-500 text-sm">
              Kore Kollective Distribution Portal
            </p>
          </div>
        </header>

        {/* Content Router */}
        {activeTab === "dashboard" &&
          (user.role !== UserRole.DISTRIBUTOR ? (
            <AdminDashboard
              orders={orders}
              inventory={inventory}
              articles={articles}
            />
          ) : (
            <DistributorDashboard
              user={user}
              orders={orders}
              cartCount={cartItemsCount}
              goToCart={() => setActiveTab("cart")}
            />
          ))}

        {activeTab === "master" &&
          (user.role === UserRole.ADMIN ||
            user.role === UserRole.SUPERADMIN ||
            user.role === UserRole.MANAGER) && (
            <ProductMaster
              addArticle={addArticle}
              editingId={editingArticleId}
              onSuccess={fetchArticles}
              onCancelEdit={() => {
                setEditingArticleId(null);
                setActiveTab(
                  previousTab === "variant_details"
                    ? "variant_details"
                    : "catalogue"
                );
              }}
            />
          )}

        {activeTab === "catalogue" && user.role !== UserRole.DISTRIBUTOR && (
          <CatalogueManager
            articles={articles}
            addArticle={addArticle}
            updateArticle={updateArticle}
            deleteArticle={deleteArticle}
            onEditArticle={handleEditArticle}
            onViewVariant={handleViewVariant}
            expandedIds={catalogueExpandedIds}
            setExpandedIds={setCatalogueExpandedIds}
          />
        )}

        {activeTab === "variant_details" &&
          viewingVariant &&
          user.role !== UserRole.DISTRIBUTOR &&
          (() => {
            const art = articles.find((a) => a.id === viewingVariant.articleId);
            const vari = art?.variants?.find(
              (v) => v.id === viewingVariant.variantId
            );
            if (!art || !vari)
              return (
                <div className="text-center text-slate-400 py-12">
                  Variant not found.
                </div>
              );
            return (
              <VariantDetailsPage
                article={art}
                variant={vari}
                onBack={() => {
                  setViewingVariant(null);
                  setActiveTab("catalogue");
                }}
                onEditArticle={handleEditArticle}
                onDelete={(id) => {
                  deleteArticle(id);
                  setViewingVariant(null);
                  setActiveTab("catalogue");
                }}
              />
            );
          })()}
        {activeTab === "po" && user.role !== UserRole.DISTRIBUTOR && (
          <POPage articles={articles} onSyncSuccess={fetchArticles} />
        )}
        {activeTab === "grn" && user.role !== UserRole.DISTRIBUTOR && <GRN />}
        {activeTab === "bills" && user.role !== UserRole.DISTRIBUTOR && (
          <Bill />
        )}
        {activeTab === "vendors" && user.role !== UserRole.DISTRIBUTOR && (
          <VendorManager />
        )}
        {activeTab === "users" && user.role === UserRole.SUPERADMIN && (
          <UserManager />
        )}
        {activeTab === "master_inventory" &&
          user.role !== UserRole.DISTRIBUTOR && (
            <MasterInventory
              inventory={inventory}
              articles={articles}
              onInward={handleInwardStock}
              onOutward={handleOutwardStock}
            />
          )}

        {activeTab === "booking_inventory" &&
          user.role !== UserRole.DISTRIBUTOR && (
            <BookingInventory
              inventory={inventory}
              articles={articles}
              orders={orders}
            />
          )}

        {activeTab === "orders" &&
          (user.role !== UserRole.DISTRIBUTOR ? (
            <OrderProcessor
              orders={orders}
              updateStatus={updateOrderStatus}
              articles={articles}
              isLoading={loadingOrders}
            />
          ) : (
            <MyOrders
              orders={orders.filter((o) => o.distributorId === user.id)}
              articles={articles}
              isLoading={loadingOrders}
            />
          ))}

        {activeTab === "shop" && user.role === UserRole.DISTRIBUTOR && (
          <Shop
            articles={articles}
            inventory={inventory}
            cart={cart}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            goToCart={() => setActiveTab("cart")}
          />
        )}

        {activeTab === "cart" && user.role === UserRole.DISTRIBUTOR && (
          <Cart
            articles={articles}
            cart={cart}
            clearCartItem={clearCartItem}
            onCheckout={placeOrder}
            total={cartTotal}
            assortments={ASSORTMENTS as Assortment[]}
          />
        )}

        {activeTab === "distributors" && user.role !== UserRole.DISTRIBUTOR && (
          <DistributorManager orders={orders} />
        )}

        {activeTab === "profile" && user && (
          <ProfilePage
            user={user}
            onProfileUpdate={(updatedUser) => {
              store.setCurrentUser(updatedUser);
            }}
          />
        )}
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
};

/* ---------------- DistributorDashboard + StatCard (same file) ---------------- */

const DistributorDashboard: React.FC<{
  user: User;
  orders: Order[];
  cartCount: number;
  goToCart: () => void;
}> = ({ user, orders, cartCount, goToCart }) => {
  const userOrders = orders.filter((o) => o.distributorId === user.id);
  const pending = userOrders.filter(
    (o) => o.status === OrderStatus.BOOKED || o.status === OrderStatus.PENDING
  ).length;
  const dispatched = userOrders.filter(
    (o) => o.status === OrderStatus.DISPATCHED
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="My Orders"
          value={userOrders.length}
          icon={<ShoppingBag className="text-indigo-600" />}
        />
        <StatCard
          label="Pending"
          value={pending}
          icon={<Clock className="text-amber-600" />}
        />
        <StatCard
          label="In Transit"
          value={dispatched}
          icon={<Truck className="text-emerald-600" />}
        />
        <div
          onClick={goToCart}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
        >
          <div>
            <p className="text-slate-500 text-sm font-medium">Cart Balance</p>
            <p className="text-3xl font-bold mt-1 text-slate-900 group-hover:text-indigo-600 transition-colors">
              {cartCount}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-100">
            <ShoppingCart className="text-indigo-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">
              Recent Shipments
            </h3>
            <button className="text-indigo-600 font-bold text-sm">
              View All
            </button>
          </div>

          {userOrders.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <Package className="text-slate-200 mb-2" size={40} />
              <p className="text-slate-400 text-sm">
                No recent bookings found.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {userOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-indigo-50/20 transition-colors border border-transparent hover:border-indigo-100"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2.5 rounded-xl ${
                        order.status === OrderStatus.DISPATCHED
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-indigo-100 text-indigo-600"
                      }`}
                    >
                      {order.status === OrderStatus.DISPATCHED ? (
                        <Truck size={20} />
                      ) : (
                        <Clock size={20} />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{order.id}</p>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        {order.date}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-slate-900">
                      ₹{order.totalAmount.toLocaleString()}
                    </p>
                    <p
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        order.status === OrderStatus.DISPATCHED
                          ? "text-emerald-600"
                          : "text-indigo-600"
                      }`}
                    >
                      {order.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-indigo-600 text-white p-8 rounded-3xl shadow-xl shadow-indigo-100 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl font-bold mb-2">Grow Your Distribution</h3>
            <p className="text-indigo-100 text-sm max-w-xs leading-relaxed">
              Book more than 50 cartons this month and unlock a 5% early-bird
              discount on your next purchase.
            </p>
          </div>

          <div className="mt-8 relative z-10">
            <div className="flex justify-between items-end mb-2">
              <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest">
                Monthly Target
              </p>
              <p className="text-lg font-bold">
                14 / 50 <span className="text-sm font-normal">Cartons</span>
              </p>
            </div>
            <div className="w-full bg-indigo-500 h-2.5 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full w-[28%]" />
            </div>
          </div>

          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-indigo-400/20 rounded-full blur-2xl" />
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
    <div>
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1 text-slate-900">{value}</p>
    </div>
    <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
  </div>
);

export default App;
