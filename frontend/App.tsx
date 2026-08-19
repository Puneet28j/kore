import React, { useState, useEffect, useMemo } from "react";
import { useSocket } from "./context/SocketContext";
import SocketStatusBadge from "./components/ui/SocketStatusBadge";
import {
  ShoppingBag,
  Package,
  Truck,
  ShoppingCart,
  Clock,
  Loader2,
  IndianRupee,
  TrendingUp,
  Star,
  CheckCircle,
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
import Wishlist from "./components/Distributor/Wishlist";
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
import Returns from "./components/Admin/Returns";
import ActivityLogPage from "./components/Admin/ActivityLogPage";
import StockReport from "./components/Admin/StockReport";
import DispatchReport from "./components/Admin/DispatchReport";
import DispatchOrderBreakdown from "./components/Admin/DispatchOrderBreakdown";
import ReturnReport from "./components/Admin/ReturnReport";
import AccountantPage from "./components/Admin/AccountantPage";
import TermsPage from "./components/Admin/TermsPage";
import NotificationSettings from "./components/Admin/NotificationSettings";
import IntegrationsPage from "./components/Admin/IntegrationsPage";
import { masterCatalogService } from "./services/masterCatalogService";
import OverduePayments from "./components/shared/OverduePayments";

// ✅ NEW: Sidebar component (create this file separately)
import Sidebar from "./components/Layout/Sidebar";
import { useKoreStore } from "./store";
import { Toaster, toast } from "sonner";
import Bill from "./components/Admin/Bill";
import { distributorOrderService } from "./services/distributorOrderService";

const App: React.FC = () => {
  const store = useKoreStore();
  const { currentUser: user, checkAuth, isLoadingAuth } = store;
  const socket = useSocket();

  useEffect(() => {
    checkAuth();
  }, []);

  // Use URL hash for reliable tab persistence
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return hash || localStorage.getItem("kore_activeTab") || "dashboard";
  });
  const [dispatchBreakdownOrder, setDispatchBreakdownOrder] = useState<Order | null>(null);
  const [distributorOrderToOpen, setDistributorOrderToOpen] = useState<Order | null>(null);

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
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [returnToArticleId, setReturnToArticleId] = useState<string | null>(null);
  const [catalogueActiveTab, setCatalogueActiveTab] = useState<"AVAILABLE" | "PREORDER">("AVAILABLE");

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
    setDispatchBreakdownOrder(null);
    setShowMasterForm(false);
    setEditingArticleId(null);
    setViewingVariant(null);
    setCatalogueExpandedIds(new Set());
    localStorage.removeItem("kore_app_draft");
    localStorage.removeItem("kore_po_draft");
    setActiveTab(tab);
  };

  const handleOpenOrderFromReport = (order: Order) => {
    setDispatchBreakdownOrder(order);
    setActiveTab("dispatch_breakdown");
  };

  const handleViewVariant = (articleId: string, variantId: string) => {
    setPreviousTab("catalogue");
    setViewingVariant({ articleId, variantId });
    setActiveTab("variant_details");
  };

  const handleEditArticle = (id: string) => {
    setReturnToArticleId(id);
    setPreviousTab(activeTab);
    setEditingArticleId(id);
    setShowMasterForm(true);
    setActiveTab("catalogue");
  };

  const handleAddNewMaster = () => {
    setPreviousTab("catalogue");
    setEditingArticleId(null);
    setShowMasterForm(true);
    setActiveTab("catalogue");
  };

  const fetchArticles = async () => {
    try {
      setLoadingArticles(true);
      const res = await masterCatalogService.listMasterItems({ limit: 1000 });
      const mapped = res.data.map((item: any) => {
        // Normalize variants: convert sizeMap -> sizeSkus/sizeQuantities
        const normalizedVariants = (item.variants || []).map((v: any) => {
          const sizeSkus: Record<string, string> = v.sizeSkus || {};
          const sizeQuantities: Record<string, number> = v.sizeQuantities || {};

          // Legacy Fallback: If new dedicated fields are missing, try to restore from sizeMap
          if (Object.keys(sizeQuantities).length === 0 && v.sizeMap) {
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
          assortmentId: item.assortmentId || "",
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
    fetchArticlesRef.current = fetchArticles;
  }, []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [distributorDashStats, setDistributorDashStats] = useState<any>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // ── Refs to avoid stale closures inside socket handlers ──
  const userRef = React.useRef(user);
  userRef.current = user; // always the latest user

  const checkAuthRef = React.useRef(checkAuth);
  checkAuthRef.current = checkAuth;

  // Fetch orders (defined outside useEffect so it can be referenced)
  const fetchOrdersRef = React.useRef<
    ((silent?: boolean) => Promise<void>) | undefined
  >(undefined);
  const fetchArticlesRef = React.useRef<(() => Promise<void>) | undefined>(
    undefined
  );

  // Fetch orders with socket.io for real-time updates
  useEffect(() => {
    if (!user) return;

    const fetchOrders = async (silent = false) => {
      if (!silent) setLoadingOrders(true);
      try {
        let items: Order[] = [];
        if (user.role === UserRole.DISTRIBUTOR) {
          const res = await distributorOrderService.getOrdersByDistributor(
            user.id,
            // The dashboard Recent Orders card must include regular orders
            // as well as PRE_BOOKED/CONFIRMED preorder orders.
            { limit: 100, orderType: "ALL" }
          );
          items = res.items;
          if (res.meta?.stats) setDistributorDashStats(res.meta.stats);
        } else {
          const res = await distributorOrderService.getAllOrders({
            limit: 1000,
          });
          items = res.items;
        }
        setOrders(items);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Failed to fetch orders", err);
      } finally {
        if (!silent) setLoadingOrders(false);
      }
    };

    fetchOrdersRef.current = fetchOrders;

    // Initial fetch
    fetchOrders();
  }, [user?.id, user?.role]);

  // ── Socket event handlers (shared socket from SocketContext) ──
  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      console.log("🔌 Socket connected");
      // Re-authenticate on every connect/reconnect so server assigns correct rooms
      const token = localStorage.getItem("kore_token");
      if (token) socket.emit("authenticate", token);
    };

    const onConnectError = (err: Error) => {
      console.warn("⚠️ Socket connect error:", err.message);
    };

    const onOrderUpdated = (data: any) => {
      const u = userRef.current;
      if (!u) return;

      const isDistributor = u.role === UserRole.DISTRIBUTOR;
      const orderId = String(data.orderId);
      const distributorId = String(data.distributorId);
      const isMyOrder =
        distributorId === String(u.id) ||
        distributorId === String(u.distributorId);

      if (isDistributor && !isMyOrder) return;

      const isPriceOnly = data.status === "PENDING" && !isDistributor;
      if (!isPriceOnly) {
        toast.success(`Order Update: ${orderId.slice(-6).toUpperCase()}`, {
          description: `Status changed to ${
            data.status?.replace(/_/g, " ") || "updated"
          }`,
          duration: 3000,
        });
      }

      if (fetchOrdersRef.current) fetchOrdersRef.current(true);
      if (isDistributor) checkAuthRef.current?.(true);

      // Notify open OrderDetail to refresh itself
      window.dispatchEvent(
        new CustomEvent("orderUpdatedSocket", { detail: data })
      );
    };

    const onDistributorUpdated = (data: any) => {
      const u = userRef.current;
      if (!u) return;

      if (u.role === UserRole.DISTRIBUTOR) {
        if (
          String(data.distributorId) === String(u.distributorId) ||
          String(data.distributorId) === String(u.id)
        ) {
          checkAuthRef.current?.(true);
        }
      } else {
        // Admin: refresh distributor list
        window.dispatchEvent(new CustomEvent("distributorRefetch"));
      }
    };

    const onActivityLog = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;

      // A blocked variant deletion already shows the initiating admin a clear
      // request-error toast. Keep its audit record, but don't add a second
      // generic activity notification on top of it.
      const isBlockedVariantRemoval =
        String(data.description || "").startsWith("Variant removal blocked:") ||
        String(data.description || "").startsWith("Catalog update blocked because referenced variants cannot be removed");
      if (!isBlockedVariantRemoval) {
        const label = (data.action as string).replace(/_/g, " ");
        toast.info(label, { description: data.description, duration: 4000 });
      }
      // Refresh activity log page if open
      window.dispatchEvent(new CustomEvent("activityLogRefetch"));
    };

    const onGrnSubmitted = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.info(`GRN #${data.grnNumber} submitted`, {
        description: `Vendor: ${data.vendorName || ""} · ${
          data.totalPairs || ""
        } pairs`,
        duration: 4000,
      });
      if (fetchArticlesRef.current) fetchArticlesRef.current();
      window.dispatchEvent(new CustomEvent("grnRefetch"));
    };

    const onPoCreated = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.info(`PO #${data.poNumber} created`, {
        description: `Vendor: ${data.vendorName}`,
        duration: 4000,
      });
      window.dispatchEvent(new CustomEvent("poRefetch"));
    };

    const onPoUpdated = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.info(`PO #${data.poNumber} updated`, { duration: 3000 });
      window.dispatchEvent(new CustomEvent("poRefetch"));
    };

    const onPoDeleted = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.warning(`PO #${data.poNumber || ""} deleted`, { duration: 3000 });
      window.dispatchEvent(new CustomEvent("poRefetch"));
    };

    const onBillApproved = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.success(`Bill Approved: PO #${data.poNumber}`, {
        description: data.vendorName,
        duration: 4000,
      });
      window.dispatchEvent(new CustomEvent("billRefetch"));
    };

    const onBillRejected = (data: any) => {
      const u = userRef.current;
      if (!u || u.role === UserRole.DISTRIBUTOR) return;
      toast.error(`Bill Rejected: PO #${data.poNumber}`, {
        description: data.reason || "",
        duration: 4000,
      });
      window.dispatchEvent(new CustomEvent("billRefetch"));
    };

    const onCatalogUpdated = () => {
      if (fetchArticlesRef.current) fetchArticlesRef.current();
      if (fetchOrdersRef.current) fetchOrdersRef.current(true);
      window.dispatchEvent(new CustomEvent("catalogRefetch"));
    };

    const onUserUpdated = () => {
      window.dispatchEvent(new CustomEvent("userRefetch"));
    };

    const onUserProfileUpdated = (data: any) => {
      const u = userRef.current;
      if (!u) return;
      if (String(data.userId) === String(u.id)) {
        // Sync store so Sidebar/ProfilePage reflect updated name/email instantly
        if (data.name || data.email || data.phone) {
          store.setCurrentUser({ ...u, ...data });
        }
        window.dispatchEvent(
          new CustomEvent("userProfileRefetch", { detail: data })
        );
      }
    };

    const onVendorUpdated = () => {
      window.dispatchEvent(new CustomEvent("vendorRefetch"));
    };

    const onReturnCreated = (data: any) => {
      const u = userRef.current;
      if (!u) return;
      if (u.role === UserRole.DISTRIBUTOR) {
        const isMyReturn =
          String(data.distributorId) === String(u.id) ||
          String(data.distributorId) === String(u.distributorId);
        if (!isMyReturn) return;
        toast.info(`Return #${data.returnNumber} submitted`, {
          description: `${data.totalPairs} pairs — Order #${data.orderNumber}`,
          duration: 4000,
        });
      } else {
        toast.info(`New Return: #${data.returnNumber}`, {
          description: `${data.distributorName} · ${data.totalPairs} pairs`,
          duration: 5000,
        });
        if (fetchOrdersRef.current) fetchOrdersRef.current(true);
        window.dispatchEvent(new CustomEvent("returnRefetch"));
      }
    };

    const onSessionInvalidated = (data: any) => {
      const u = userRef.current;
      if (!u) return;
      if (String(data.userId) !== String(u.id)) return;
      store.logout();
      toast.error("Session expired", {
        description:
          "Admin ne aapka password change kar diya. Please login karein.",
        duration: 6000,
      });
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("orderUpdated", onOrderUpdated);
    socket.on("distributorUpdated", onDistributorUpdated);
    socket.on("activityLog", onActivityLog);
    socket.on("grnSubmitted", onGrnSubmitted);
    socket.on("poCreated", onPoCreated);
    socket.on("poUpdated", onPoUpdated);
    socket.on("poDeleted", onPoDeleted);
    socket.on("billApproved", onBillApproved);
    socket.on("billRejected", onBillRejected);
    socket.on("catalogUpdated", onCatalogUpdated);
    socket.on("returnCreated", onReturnCreated);
    socket.on("sessionInvalidated", onSessionInvalidated);
    socket.on("userUpdated", onUserUpdated);
    socket.on("userProfileUpdated", onUserProfileUpdated);
    socket.on("vendorUpdated", onVendorUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("orderUpdated", onOrderUpdated);
      socket.off("distributorUpdated", onDistributorUpdated);
      socket.off("activityLog", onActivityLog);
      socket.off("grnSubmitted", onGrnSubmitted);
      socket.off("poCreated", onPoCreated);
      socket.off("poUpdated", onPoUpdated);
      socket.off("poDeleted", onPoDeleted);
      socket.off("billApproved", onBillApproved);
      socket.off("billRejected", onBillRejected);
      socket.off("catalogUpdated", onCatalogUpdated);
      socket.off("returnCreated", onReturnCreated);
      socket.off("sessionInvalidated", onSessionInvalidated);
      socket.off("userUpdated", onUserUpdated);
      socket.off("userProfileUpdated", onUserProfileUpdated);
      socket.off("vendorUpdated", onVendorUpdated);
    };
  }, [socket]); // Re-bind only if socket instance changes

  // ── Periodic credit refresh when distributor is on the cart tab ──
  useEffect(() => {
    if (!user || user.role !== UserRole.DISTRIBUTOR) return;
    if (activeTab !== "cart") return;

    // Refresh credit immediately when entering cart
    checkAuth(true);

    // Then poll every 10 seconds as a reliable fallback
    const interval = setInterval(() => {
      checkAuthRef.current?.(true);
    }, 10_000);

    return () => clearInterval(interval);
  }, [activeTab, user?.id]);

  // Initialize inventory based on articles
  const [inventory, setInventory] = useState<Inventory[]>(() => {
    const saved = localStorage.getItem("kore_inventory");
    if (saved) return JSON.parse(saved);

    return articles.map((a) => ({
      articleId: a.id,
      actualStock: 100,
      reservedStock: 0,
      blockedStock: 0,
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

  // Prefer user.id (string), fall back to _id for older stored user objects
  const getUserId = (u: any): string | undefined =>
    u?.id || (u as any)?._id?.toString?.() || (u as any)?._id;

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const savedUser = localStorage.getItem("kore_user");
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        const uid = parsedUser?.id || parsedUser?._id;
        const savedCart = uid ? localStorage.getItem(`kore_cart_${uid}`) : null;
        return savedCart ? JSON.parse(savedCart) : [];
      }
    } catch {}
    return [];
  });

  // Restore user-specific cart on login; clear it on logout
  const currentUserId = getUserId(user);
  useEffect(() => {
    if (currentUserId) {
      const savedCart = localStorage.getItem(`kore_cart_${currentUserId}`);
      setCart(savedCart ? JSON.parse(savedCart) : []);
    } else {
      setCart([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    const uid = getUserId(user);
    if (uid) {
      localStorage.setItem(`kore_cart_${uid}`, JSON.stringify(cart));
    }
  }, [cart]);

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
        blockedStock: 0,
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

  const handleReturnSuccess = async () => {
    // Refresh articles (for stock updates)
    await fetchArticles();
    // Refresh orders (to reflect the new return records and order status changes)
    await fetchOrdersRef.current?.(true);
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

  // update the carton count for an existing cart item (min 1, max = live stock or PO cap)
  const updateCartItem = (
    articleId: string,
    variantId: string | undefined,
    newCartonCount: number
  ) => {
    if (newCartonCount < 1) return;

    const art = articles.find((a) => a.id === articleId);
    const variant = art?.variants?.find(
      (v) => v.id === variantId || (v as any)._id === variantId
    );
    const isPreOrder = (variant?.stage || art?.status) === "PREORDER";

    if (variant) {
      const breakdown = variant.sizeQuantities || {};
      const totalPairsPerCarton = Object.values(breakdown).reduce(
        (a: number, b: any) => a + (Number(b) || 0), 0
      );

      if (isPreOrder) {
        // Cap by PO planned quantity minus what's already pre-booked
        if (totalPairsPerCarton > 0) {
          const plannedPairs = Number((variant as any).plannedPairs) || 0;
          const preBookedPairs = Number((variant as any).preBookedPairs) || 0;
          const remaining = Math.max(0, plannedPairs - preBookedPairs);
          const maxCartons = Math.floor(remaining / totalPairsPerCarton);
          if (newCartonCount > maxCartons) {
            toast.error(
              maxCartons === 0
                ? "This variant is fully pre-booked"
                : `Only ${maxCartons} carton(s) can be pre-booked for this variant`
            );
            newCartonCount = maxCartons;
            if (newCartonCount < 1) return;
          }
        }
      } else {
        // Cap by live sizeMap stock
        const sizeMap = (variant as any).sizeMap || {};
        const sizes = Object.keys(breakdown);
        if (sizes.length > 0) {
          let min = Infinity;
          for (const sz of sizes) {
            const assortQty = Number(breakdown[sz]) || 0;
            if (assortQty === 0) continue;
            const stockEntry = sizeMap[sz];
            const available = stockEntry
              ? Math.max(0, Number(stockEntry.qty ?? stockEntry) || 0)
              : 0;
            min = Math.min(min, Math.floor(available / assortQty));
          }
          const maxCartons = min === Infinity ? 0 : min;
          if (newCartonCount > maxCartons) {
            toast.error(`Only ${maxCartons} carton(s) available in stock`);
            newCartonCount = maxCartons;
            if (newCartonCount < 1) return;
          }
        }
      }
    }

    setCart((prev) =>
      prev.map((i) => {
        if (i.articleId !== articleId || i.variantId !== variantId) return i;
        const pairsPerCarton = i.cartonCount > 0 ? i.pairCount / i.cartonCount : 24;
        const newPairCount = Math.round(pairsPerCarton * newCartonCount);
        const pricePerPair = articles.find((a) => a.id === articleId)?.pricePerPair || 0;
        // Scale sizeQuantities proportionally
        const scale = newCartonCount / i.cartonCount;
        const newSizeQty: Record<string, number> = {};
        Object.entries(i.sizeQuantities || {}).forEach(([sz, qty]) => {
          newSizeQty[sz] = Math.round(qty * scale);
        });
        return {
          ...i,
          cartonCount: newCartonCount,
          pairCount: newPairCount,
          price: newPairCount * pricePerPair,
          sizeQuantities: newSizeQty,
        };
      })
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

  const handlePlacePreOrder = async (
    articleId: string,
    variantId: string,
    sizeQuantities: Record<string, number>,
    cartonCount: number,
    pairCount: number,
    price: number
  ) => {
    if (!user) return;
    const payload = {
      distributorId: user.id,
      distributorName: user.name,
      date: new Date().toISOString().split("T")[0],
      orderType: "PREORDER",
      items: [
        {
          articleId,
          variantId,
          sizeQuantities,
          cartonCount,
          pairCount: pairCount,
          price,
        },
      ],
      totalAmount: price,
      totalCartons: cartonCount,
      totalPairs: pairCount,
      gstRate: 5,
    };
    const res = await distributorOrderService.placeOrder(payload as any);
    setOrders((prev) => [{ ...res, id: (res as any)._id || res.id }, ...prev]);
    setLastUpdated(new Date());
    toast.success("Pre-Order placed!", {
      description: "Check 'My Orders' tab to track it.",
      duration: 4000,
    });
  };

  const placeOrder = async (gstPercent: number = 5) => {
    if (!user || cart.length === 0) return;

    // Effective stage for the SPECIFIC variant in the cart, not just the
    // parent article — a variant can have arrived (its own GRN) while the
    // article as a whole is still PREORDER because a sibling variant
    // hasn't. Used here only for the client-side credit-limit UX check;
    // the backend independently (and authoritatively) resolves each item's
    // bookingType server-side and merges everything into ONE order — RFD
    // items dispatchable immediately, pre-order items held until their GRN
    // lands, all inside that same order (see Order Breakdown).
    const getCartItemStage = (item: { articleId: string; variantId?: string }) => {
      const art = articles.find((a) => a.id === item.articleId);
      const variant = art?.variants?.find(
        (v) => v.id === item.variantId || v._id === item.variantId
      );
      return variant?.stage || art?.status;
    };

    const availableItems = cart.filter((i) => getCartItemStage(i) === "AVAILABLE");

    const placePromise = async () => {
      await checkAuth(true);
      const freshUser = store.currentUser;

      // ── Credit check (only for AVAILABLE items) ──
      if (
        freshUser?.role === UserRole.DISTRIBUTOR &&
        availableItems.length > 0
      ) {
        const availCredit = freshUser.availableCredit ?? 0;
        const discPct = freshUser.discountPercentage || 0;
        const orderTotal = availableItems.reduce((sum, i) => sum + i.price, 0);
        const finalAmt = orderTotal - (orderTotal * discPct) / 100;

        if (availCredit === 0)
          throw new Error("No credit limit available. Contact administrator.");
        if (finalAmt > availCredit)
          throw new Error(
            `Credit limit exceeded. Available: ₹${availCredit.toLocaleString()}, Required: ₹${finalAmt.toLocaleString()}`
          );
      }

      const payload: Partial<Order> = {
        distributorId: user.id,
        distributorName: user.name,
        date: new Date().toISOString().split("T")[0],
        items: cart.map((item) => ({
          articleId: item.articleId,
          variantId: item.variantId,
          sizeQuantities: item.sizeQuantities,
          cartonCount: item.cartonCount,
          pairCount: item.pairCount,
          price: item.price,
        })),
        totalAmount: cart.reduce((s, i) => s + i.price, 0),
        totalCartons: cart.reduce((s, i) => s + i.cartonCount, 0),
        totalPairs: cart.reduce((s, i) => s + i.pairCount, 0),
        gstRate: gstPercent,
      };
      const res = await distributorOrderService.placeOrder(payload);
      const placedOrder = { ...res, id: (res as any)._id || res.id };

      setOrders((prev) => [placedOrder, ...prev]);
      setCart([]);
      setActiveTab("orders");
      await checkAuth(true);

      return "Order placed";
    };

    toast.promise(placePromise(), {
      loading: "Placing order...",
      success: (msg) => msg as string,
      error: (err: any) =>
        err?.response?.data?.message || err?.message || "Failed to place order",
    });
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const updatePromise = async () => {
      const updatedOrder = await distributorOrderService.updateOrderStatus(
        orderId,
        status
      );

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === orderId || (o as any)._id === orderId) {
            // dispatch: deduct actual + release reserved (only once)
            if (status === OrderStatus.PFD && o.status !== OrderStatus.PFD) {
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
            return updatedOrder || { ...o, status };
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
            {/* <p className="text-slate-500 text-sm">
              Kore Kollective Distribution Portal
            </p> */}
          </div>
        </header>

        {/* Content Router */}
        {activeTab === "dashboard" &&
          (user.role !== UserRole.DISTRIBUTOR ? (
            <div className="space-y-6">
              <AdminDashboard
                orders={orders}
                inventory={inventory}
                articles={articles}
                updateStatus={updateOrderStatus}
                loadingOrders={loadingOrders}
                lastUpdated={lastUpdated}
                onSeeAllOverdue={() => handleTabChange("accounts")}
              />
            </div>
          ) : (
            <DistributorDashboard
              user={user}
              orders={orders}
              dashboardStats={distributorDashStats}
              cartCount={cartItemsCount}
              goToCart={() => setActiveTab("cart")}
              goToOrders={() => setActiveTab("orders")}
              onOpenOrder={(order) => {
                setDistributorOrderToOpen(order);
                setActiveTab("orders");
              }}
            />
          ))}

        {activeTab === "catalogue" &&
          user.role !== UserRole.DISTRIBUTOR &&
          (showMasterForm ? (
            <ProductMaster
              addArticle={addArticle}
              updateArticle={updateArticle}
              editingId={editingArticleId}
              initialArticle={articles.find((a) => a.id === editingArticleId)}
              onSuccess={() => {
                fetchArticles();
                if (!editingArticleId) setShowMasterForm(false);
              }}
              onCancelEdit={() => {
                setEditingArticleId(null);
                setShowMasterForm(false);
                if (previousTab === "variant_details")
                  setActiveTab("variant_details");
              }}
            />
          ) : (
            <CatalogueManager
              articles={articles}
              addArticle={addArticle}
              updateArticle={updateArticle}
              deleteArticle={deleteArticle}
              onEditArticle={handleEditArticle}
              onViewVariant={handleViewVariant}
              expandedIds={catalogueExpandedIds}
              setExpandedIds={setCatalogueExpandedIds}
              onSuccess={fetchArticles}
              onAddNewMaster={handleAddNewMaster}
              scrollToArticleId={returnToArticleId}
              onScrollRestored={() => setReturnToArticleId(null)}
              initialActiveTab={catalogueActiveTab}
              onActiveTabChange={setCatalogueActiveTab}
            />
          ))}

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
        {user.role !== UserRole.DISTRIBUTOR && (
          <div style={{ display: activeTab === "po" ? undefined : "none" }}>
            <POPage articles={articles} onSyncSuccess={fetchArticles} />
          </div>
        )}
        {activeTab === "grn" && user.role !== UserRole.DISTRIBUTOR && <GRN />}
        {activeTab === "accounts" && user.role !== UserRole.DISTRIBUTOR && (
          <AccountantPage />
        )}

        {/* Legacy redirect — bills tab still works */}
        {activeTab === "bills" && user.role !== UserRole.DISTRIBUTOR && (
          <AccountantPage />
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
              onRefresh={fetchArticles}
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
              updateStatus={updateOrderStatus}
              articles={articles}
              inventory={inventory}
              isLoading={loadingOrders}
              lastUpdated={lastUpdated}
            />
          ) : (
            <MyOrders
              userId={user.id}
              articles={articles}
              inventory={inventory}
              isLoading={loadingOrders}
              lastUpdated={lastUpdated}
              initialOrder={distributorOrderToOpen}
              onInitialOrderHandled={() => setDistributorOrderToOpen(null)}
            />
          ))}

        {activeTab === "dispatch_breakdown" && user.role !== UserRole.DISTRIBUTOR && (
          dispatchBreakdownOrder ? (
            <DispatchOrderBreakdown
              order={dispatchBreakdownOrder}
              articles={articles}
              inventory={inventory}
              onBack={() => {
                setDispatchBreakdownOrder(null);
                setActiveTab("report_dispatch");
              }}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <p className="text-sm font-bold text-slate-500">No dispatch order selected</p>
              <p className="text-xs text-slate-400 mt-1">Open an order from the Dispatch Report to view its breakdown.</p>
            </div>
          )
        )}

        {activeTab === "returns" && user.role !== UserRole.DISTRIBUTOR && (
          <Returns
            orders={orders}
            articles={articles}
            onSuccess={handleReturnSuccess}
            onInward={handleInwardStock}
          />
        )}

        {activeTab === "shop" && user.role === UserRole.DISTRIBUTOR && (
          <Shop
            articles={articles}
            inventory={inventory}
            cart={cart}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            goToCart={() => setActiveTab("cart")}
            user={user}
          />
        )}

        {activeTab === "preorder" && user.role === UserRole.DISTRIBUTOR && (
          <Wishlist articles={articles} onPlacePreOrder={handlePlacePreOrder} />
        )}

        {activeTab === "cart" && user.role === UserRole.DISTRIBUTOR && (
          <Cart
            articles={articles}
            cart={cart}
            clearCartItem={clearCartItem}
            updateCartItem={updateCartItem}
            onCheckout={(gst) => placeOrder(gst)}
            total={cartTotal}
            assortments={ASSORTMENTS as Assortment[]}
            user={user}
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

        {activeTab === "activity_log" && user.role !== UserRole.DISTRIBUTOR && (
          <ActivityLogPage />
        )}

        {activeTab === "report_stock" && user.role !== UserRole.DISTRIBUTOR && (
          <StockReport />
        )}
        {activeTab === "report_dispatch" &&
          user.role !== UserRole.DISTRIBUTOR && <DispatchReport onOpenOrder={handleOpenOrderFromReport} />}
        {activeTab === "report_return" &&
          user.role !== UserRole.DISTRIBUTOR && <ReturnReport />}

        {activeTab === "overdue_payments" &&
          user.role !== UserRole.DISTRIBUTOR && <AccountantPage />}

        {activeTab === "terms_page" && user.role !== UserRole.DISTRIBUTOR && (
          <TermsPage />
        )}

        {activeTab === "notification_settings" &&
          user.role === UserRole.SUPERADMIN && <NotificationSettings />}

        {activeTab === "integrations" && user.role === UserRole.SUPERADMIN && (
          <IntegrationsPage />
        )}
      </main>
      <Toaster
        position="top-right"
        richColors
        expand
        visibleToasts={6}
        closeButton
      />
      <SocketStatusBadge />
    </div>
  );
};

/* ---------------- DistributorDashboard + StatCard (same file) ---------------- */

const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  PRE_BOOKED: { label: "Pre-Booked", color: "bg-violet-100 text-violet-700" },
  CONFIRMED: { label: "Confirmed", color: "bg-blue-100 text-blue-700" },
  PENDING: { label: "Pending", color: "bg-slate-100 text-slate-600" },
  BOOKED: { label: "Booked", color: "bg-indigo-100 text-indigo-700" },
  PFD: { label: "Dispatched", color: "bg-purple-100 text-purple-700" },
  RFD: { label: "In Transit", color: "bg-sky-100 text-sky-700" },
  RECEIVED: { label: "Received", color: "bg-emerald-100 text-emerald-700" },
  PARTIAL: { label: "Partial", color: "bg-orange-100 text-orange-700" },
  CANCELLED: { label: "Cancelled", color: "bg-rose-100 text-rose-700" },
};

const DistributorDashboard: React.FC<{
  user: User;
  orders: Order[];
  dashboardStats: any;
  cartCount: number;
  goToCart: () => void;
  goToOrders: () => void;
  onOpenOrder: (order: Order) => void;
}> = ({ user, orders, dashboardStats, cartCount, goToCart, goToOrders, onOpenOrder }) => {
  const userOrders = orders.filter((o) => {
    const distributorId =
      typeof o.distributorId === "object"
        ? o.distributorId.id || (o.distributorId as any)._id
        : o.distributorId;
    return String(distributorId) === String(user.id);
  });

  // Use server-side aggregated stats when available (avoids limit-cap undercount)
  const sc: Record<string, number> = dashboardStats?.statusCounts || {};
  const totalValue =
    dashboardStats?.totalSpent ??
    userOrders.reduce((s, o) => s + (o.finalAmount || o.totalAmount || 0), 0);
  const fallbackOperationalOrders = userOrders.filter(
    (order) =>
      ![
        OrderStatus.PRE_BOOKED,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ].includes(order.status)
  );
  const fallbackDispatchedCartons = fallbackOperationalOrders.reduce((sum, order) => {
    const orderedCartons = Number(order.totalCartons) || 0;
    const fulfilledCartons = (order.items || []).reduce(
      (itemSum, item) => itemSum + (Number(item.fulfilledCartonCount) || 0),
      0
    );

    // Fulfilled cartons represent partial dispatches. For older orders without
    // item-level fulfillment data, use their lifecycle status as the fallback.
    if (fulfilledCartons > 0) {
      return sum + Math.min(orderedCartons, fulfilledCartons);
    }
    return sum +
      ([OrderStatus.PFD, OrderStatus.RFD, OrderStatus.RECEIVED].includes(
        order.status
      )
        ? orderedCartons
        : 0);
  }, 0);
  const fallbackTotalCartons = fallbackOperationalOrders.reduce(
    (sum, order) => sum + (Number(order.totalCartons) || 0),
    0
  );
  const dispatchedCartons =
    dashboardStats?.dispatchedCartons ?? fallbackDispatchedCartons;
  const remainingCartons =
    dashboardStats?.remainingCartons ??
    Math.max(0, fallbackTotalCartons - fallbackDispatchedCartons);
  const totalOrders = dashboardStats ? sc.total || 0 : userOrders.length;
  const activeCount =
    dashboardStats?.activeOrders ??
    userOrders.filter(
      (o) =>
        o.status === OrderStatus.BOOKED ||
        o.status === OrderStatus.PFD ||
        o.status === OrderStatus.RFD
    ).length;
  const preOrderCount =
    dashboardStats?.preOrderCount ??
    userOrders.filter(
      (o) =>
        o.status === OrderStatus.PRE_BOOKED ||
        (o as any).orderType === "PREORDER"
    ).length;
  const statusCounts: Record<string, number> = dashboardStats
    ? sc
    : (() => {
        const counts: Record<string, number> = {};
        userOrders.forEach((o) => {
          counts[o.status] = (counts[o.status] || 0) + 1;
        });
        return counts;
      })();

  const paidAmount =
    dashboardStats?.totalPaid ??
    userOrders
      .filter((o) => (o as any).paymentStatus === "PAID")
      .reduce((s, o) => s + (o.finalAmount || o.totalAmount || 0), 0);
  const pendingPayment = totalValue - paidAmount;

  const recentOrders = [...userOrders]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total Orders",
            value: totalOrders.toLocaleString(),
            icon: <ShoppingBag size={16} />,
            color: "text-indigo-600",
            bg: "bg-indigo-50",
          },
          {
            label: "Total Value",
            value: `₹${totalValue.toLocaleString()}`,
            icon: <IndianRupee size={16} />,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "Dispatched Cartons",
            value: dispatchedCartons.toLocaleString(),
            icon: <Truck size={16} />,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            label: "Remaining",
            value: remainingCartons.toLocaleString(),
            icon: <Package size={16} />,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
            <div className={`${s.color} mb-1.5`}>{s.icon}</div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Activity Overview card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <TrendingUp size={15} className="text-indigo-500" /> Activity Overview
        </h3>

        {/* Payment split */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium">Paid</p>
              <p className="text-sm font-black text-emerald-700">
                ₹{paidAmount.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-rose-50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium">
                Pending Payment
              </p>
              <p className="text-sm font-black text-rose-700">
                ₹{pendingPayment.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={goToOrders}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToOrders();
              }
            }}
            className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors group"
          >
            <div className="p-1.5 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
              <Clock size={13} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">
                Active Orders
              </p>
              <p className="text-sm font-black text-slate-800">{activeCount}</p>
            </div>
          </div>
          <div
            onClick={goToCart}
            className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors group"
          >
            <div className="p-1.5 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
              <ShoppingCart size={13} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Cart Items</p>
              <p className="text-sm font-black text-indigo-700">{cartCount}</p>
            </div>
          </div>
        </div>

        {/* Status chips */}
        {Object.keys(statusCounts).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {Object.entries(statusCounts)
              .filter(([s]) => s !== "total")
              .map(([status, count]) => {
                const meta = STATUS_CHIP[status] || {
                  label: status,
                  color: "bg-slate-100 text-slate-600",
                };
                return (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${meta.color}`}
                  >
                    {meta.label} <span className="opacity-70">× {count}</span>
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {/* Recent Orders + Overdue side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Clock size={13} className="text-slate-400" />
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Recent Orders
            </h4>
            <span className="ml-auto text-[10px] text-slate-400">Last 5</span>
          </div>
          {recentOrders.length === 0 ? (
            <div className="py-10 text-center">
              <Package className="text-slate-200 mx-auto mb-2" size={32} />
              <p className="text-slate-400 text-sm">No orders yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentOrders.map((order) => {
                const isTransit =
                  order.status === OrderStatus.RFD ||
                  order.status === OrderStatus.RECEIVED;
                const chip = STATUS_CHIP[order.status];
                return (
                  <div
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenOrder(order)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenOrder(order);
                      }
                    }}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-xl ${
                          isTransit
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-indigo-100 text-indigo-600"
                        }`}
                      >
                        {isTransit ? <Truck size={14} /> : <Clock size={14} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {order.orderNumber ||
                            `#${order.id.slice(-6).toUpperCase()}`}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {order.date}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-800">
                        ₹
                        {(
                          order.finalAmount ||
                          order.totalAmount ||
                          0
                        ).toLocaleString()}
                      </p>
                      {chip && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${chip.color}`}
                        >
                          {chip.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <OverduePayments isAdmin={false} />
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
