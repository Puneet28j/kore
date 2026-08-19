
import React, { useState } from "react";
import {
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
  AlertCircle,
  Info,
  CreditCard,
  Percent,
  FileText,
  Minus,
  Plus,
} from "lucide-react";
import TermsModal from "./TermsModal";
import { User, Article, Assortment } from "../../types";
import { getImageUrl } from "../../utils/imageUtils";

// utility to expand a range like "5-7" into ["5","6","7"]
const parseSizeRange = (range: string): string[] => {
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) return [range];
  const start = parseInt(match[1]);
  const end = parseInt(match[2]);
  const sizes: string[] = [];
  for (let i = start; i <= end; i++) sizes.push(String(i));
  return sizes;
};

// Mirrors Shop.tsx maxCartonsFromStock — computes the hard cap for both
// AVAILABLE (from live sizeMap stock) and PREORDER (from PO plannedPairs)
// variants. Returns 0 if no stock/PO data exists.
const getMaxCartonsForVariant = (variant: any): number => {
  if (!variant) return 0;
  const isPreOrder = variant.availability === "PREORDER";
  const breakdown = variant.sizeQuantities || {};
  const totalPairsPerCarton = Object.values(breakdown).reduce(
    (a: number, b: any) => a + (Number(b) || 0), 0
  );

  if (isPreOrder) {
    // Cap by PO planned qty minus what's already pre-booked by all distributors
    if (totalPairsPerCarton <= 0) return 0;
    const plannedPairs = Number(variant.plannedPairs) || 0;
    const preBookedPairs = Number(variant.preBookedPairs) || 0;
    const remaining = Math.max(0, plannedPairs - preBookedPairs);
    return Math.floor(remaining / totalPairsPerCarton);
  }

  // AVAILABLE: cap by live per-size stock in sizeMap
  const sizeMap = variant.sizeMap || {};
  const sizes = Object.keys(breakdown);
  if (sizes.length === 0) return Infinity; // no assortment data — no client cap
  let min = Infinity;
  for (const sz of sizes) {
    const assortQty = Number(breakdown[sz]) || 0;
    if (assortQty === 0) continue;
    const stockEntry = sizeMap[sz];
    const available = stockEntry ? Math.max(0, Number(stockEntry.qty ?? stockEntry) || 0) : 0;
    min = Math.min(min, Math.floor(available / assortQty));
  }
  return min === Infinity ? 0 : min;
};

interface CartProps {
  articles: Article[];
  cart: {
    articleId: string;
    variantId?: string;
    sizeQuantities?: Record<string, number>;
    cartonCount: number;
    pairCount: number;
    price: number;
  }[];
  // addToCart/removeFromCart not used in new UI, kept for compatibility
  addToCart?: (id: string) => void;
  removeFromCart?: (id: string, variantId?: string) => void;
  clearCartItem: (articleId: string, variantId?: string) => void;
  updateCartItem?: (articleId: string, variantId: string | undefined, newCartonCount: number) => void;
  onCheckout: (gstPercent: number) => void;
  total: number;
  assortments: Assortment[];
  user?: User;
}

// Format number: round to 2 decimal, show as Indian currency
const fmt = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Cart: React.FC<CartProps> = ({
  articles,
  cart,
  clearCartItem,
  updateCartItem,
  onCheckout,
  total,
  user,
}) => {
  const currentUser = user;
  const [gstPercent, setGstPercent] = useState<number>(5);
  const [gstError, setGstError] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const discountPercentage = currentUser?.discountPercentage || 0;
  const discountAmount     = Math.round((total * discountPercentage) / 100 * 100) / 100;
  const afterDiscount      = Math.round((total - discountAmount) * 100) / 100;
  const gstAmount          = Math.round((afterDiscount * gstPercent) / 100 * 100) / 100;
  const finalAmount        = Math.round((afterDiscount + gstAmount) * 100) / 100;

  const availableCredit = currentUser?.availableCredit ?? 0;

  // Effective stage for the SPECIFIC variant in the cart item, not just the
  // parent article — a variant can have arrived (its own GRN) while the
  // article as a whole is still PREORDER because a sibling variant hasn't.
  // Must match the same split App.tsx's placeOrder uses, otherwise this UI
  // can show/gate differently than what actually gets booked.
  const getItemStage = (item: typeof cart[0]) => {
    const art = articles.find(a => a.id === item.articleId);
    const variant = art?.variants?.find(
      v => v.id === item.variantId || (v as any)._id === item.variantId
    );
    return variant?.availability || "RFD";
  };

  const availableItems = cart.filter(i => getItemStage(i) === "RFD");
  const wishlistItems = cart.filter(i => getItemStage(i) === "PREORDER");

  // Credit limit only applies to REGULAR (available-stock) items — pre-orders
  // aren't a stock commitment yet, backend skips the credit check for them
  // too (see order.service.js createOrder). Checking against the combined
  // cart total would wrongly block a preorder-only or mixed checkout.
  const regularTotal = availableItems.reduce((s, i) => s + i.price, 0);
  const regularDiscountAmount = Math.round((regularTotal * discountPercentage) / 100 * 100) / 100;
  const regularAfterDiscount = Math.round((regularTotal - regularDiscountAmount) * 100) / 100;
  const regularGstAmount = Math.round((regularAfterDiscount * gstPercent) / 100 * 100) / 100;
  const regularFinalAmount = Math.round((regularAfterDiscount + regularGstAmount) * 100) / 100;
  const isCreditExceeded =
    availableItems.length > 0 &&
    (availableCredit === 0 || regularFinalAmount > availableCredit);

  const totalPairs = cart.reduce((sum, item) => sum + item.pairCount, 0);
  const totalCartons = cart.reduce((sum, item) => sum + item.cartonCount, 0);

  const renderItem = (item: typeof cart[0]) => {
    const article = articles.find((a) => a.id === item.articleId);
    if (!article) return null;
    const variant = article.variants?.find((v) => v.id === item.variantId);
    const sizes = variant
      ? parseSizeRange(variant.sizeRange || "")
      : Object.keys(item.sizeQuantities || {});

    // Stock cap — mirrors Shop.tsx logic
    const maxCartons = getMaxCartonsForVariant(variant);
    const atStockMax = isFinite(maxCartons) && item.cartonCount >= maxCartons;
    const isPreOrder = variant?.availability === "PREORDER";

    // Show discounted price per item (discount applied once in summary, so show it here too for clarity)
    const itemDiscountedPrice = item.price * (1 - discountPercentage / 100);

    return (
      <div
        key={`${item.articleId}-${item.variantId || ""}`}
        className="px-5 py-4 flex items-center gap-5 group hover:bg-slate-50 transition-colors"
      >
        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
          <img
            src={(() => {
              const colorMedia = (article as any).colorMedia || [];
              const variantColor = (variant?.color || "").toLowerCase().trim();
              const mediaMatch = colorMedia.find(
                (m: any) => (m.color || "").toLowerCase().trim() === variantColor
              );
              const imgData = mediaMatch?.images?.[0];
              const url =
                (typeof imgData === "object" ? (imgData as any)?.url : (imgData as string)) ||
                variant?.images?.[0] ||
                article.imageUrl ||
                "";
              return getImageUrl(url);
            })()}
            alt={article.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm text-slate-900 tracking-tight break-all">
            {article.name}{" "}
            <span className="text-slate-400 font-medium">({variant?.color || "N/A"})</span>
          </h4>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sizes.map((sz) => (
              <span
                key={sz}
                className="bg-white border border-slate-100 px-1.5 py-0.5 rounded text-[8px] font-bold text-slate-500"
              >
                {sz}: <span className="text-indigo-600">{item.sizeQuantities?.[sz] || 0}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right whitespace-nowrap">
            <p className="font-bold text-sm text-indigo-700 tracking-tight">
              ₹{Math.round(itemDiscountedPrice).toLocaleString()}
            </p>
            {discountPercentage > 0 && (
              <p className="text-[9px] font-bold text-slate-400 line-through">
                ₹{item.price.toLocaleString()}
              </p>
            )}
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
              {item.pairCount} Pairs · {item.cartonCount} Ctn
            </p>
          </div>
          {/* Carton stepper */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
              <button
                onClick={() => updateCartItem?.(item.articleId, item.variantId, item.cartonCount - 1)}
                disabled={item.cartonCount <= 1}
                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Minus size={12} />
              </button>
              <span className="px-2 min-w-[28px] text-center text-xs font-bold text-slate-800">
                {item.cartonCount}
              </span>
              <button
                onClick={() => updateCartItem?.(item.articleId, item.variantId, item.cartonCount + 1)}
                disabled={atStockMax}
                title={atStockMax ? `Max stock: ${maxCartons} carton(s)` : undefined}
                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {atStockMax && (
              <span className="text-[8px] font-bold text-red-500 uppercase tracking-tight leading-none">
                {isPreOrder ? "Max pre-book" : "Max stock"}
              </span>
            )}
          </div>
          {/* Delete button */}
          <button
            onClick={() => clearCartItem(item.articleId, item.variantId)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {cart.length === 0 ? (
        /* Empty cart state */
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <ShoppingCart size={28} className="text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Your cart is empty</h3>
          <p className="text-slate-400 text-xs text-center mb-6 max-w-[240px]">
            Add some items from the shop to start your booking process.
          </p>
          <button
            onClick={() => (window.location.hash = "#shop")}
            className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            Browse Catalogue
          </button>
        </div>
      ) : (
        /* Cart tab — items + summary */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-6">
            {/* Available for Booking */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Package size={14} className="text-indigo-600" />
                  Ready for Booking
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Standard: 24 Pairs / Ctn
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {availableItems.length > 0 ? (
                  availableItems.map(renderItem)
                ) : (
                  <div className="px-5 py-10 text-center text-slate-400 text-xs italic">
                    No items ready for immediate booking.
                  </div>
                )}
              </div>
            </div>

            {/* Pre-Order items */}
            {wishlistItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm border-dashed">
                <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/30 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={14} className="text-amber-600" />
                    Pre-Order Items
                  </h3>
                  <span className="text-[10px] font-bold text-amber-600/60 uppercase tracking-widest">
                    Booked against incoming stock
                  </span>
                </div>
                <div className="divide-y divide-amber-50">
                  {wishlistItems.map(renderItem)}
                </div>
                <div className="px-5 py-2.5 bg-amber-50/50 border-t border-amber-100">
                  <p className="text-[10px] text-amber-700/70 font-medium italic flex items-center gap-2">
                    <Info size={12} />
                    Placed as a Pre-Order on confirm — no credit or stock check, capped by the Purchase Order raised for it.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl flex gap-3">
              <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                Standard Assortment Rule applies: Each carton contains a fixed mix of sizes. Individual pair selection within a carton is for tracking only.
              </p>
            </div>
          </div>

          {/* Summary - Compact Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white px-6 py-8 rounded-2xl shadow-lg">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 border-b border-white/10 pb-4 text-slate-400">
                Booking Summary
              </h3>

              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>Cartons</span>
                  <span className="font-bold text-white">{totalCartons}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>Pairs</span>
                  <span className="font-bold text-white">{totalPairs}</span>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-400">Subtotal</span>
                    <span className="text-sm font-bold text-slate-300">₹{fmt(total)}</span>
                  </div>

                  {discountPercentage > 0 && (
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-emerald-400">Discount ({discountPercentage}%)</span>
                      <span className="text-sm font-bold text-emerald-400">-₹{fmt(discountAmount)}</span>
                    </div>
                  )}

                  {discountPercentage > 0 && (
                    <div className="flex justify-between items-end text-slate-400/70">
                      <span className="text-[10px]">After discount</span>
                      <span className="text-xs font-bold">₹{fmt(afterDiscount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1">
                    <div className="flex items-center gap-1.5">
                      <Percent size={11} className="text-amber-400" />
                      <span className="text-xs font-bold text-amber-400">GST</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={28}
                          step={0.5}
                          required
                          value={gstPercent}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            setGstError(isNaN(v) || v < 0);
                            setGstPercent(isNaN(v) ? 0 : v);
                          }}
                          className={`w-14 text-center bg-white/10 text-amber-300 text-xs font-bold rounded-lg px-1.5 py-0.5 border outline-none focus:ring-1 focus:ring-amber-400 ${gstError ? 'border-red-400' : 'border-white/20'}`}
                        />
                        <span className="text-[10px] text-amber-400/70">%</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-400">+₹{fmt(gstAmount)}</span>
                  </div>
                  {gstError && <p className="text-[9px] text-red-400">GST % is required (0–28)</p>}

                  <div className="flex justify-between items-end pt-2 border-t border-white/10">
                    <div>
                      <span className="text-xs font-bold text-slate-300">Total Payable</span>
                      <p className="text-[9px] text-slate-500">incl. GST @ {gstPercent}%</p>
                    </div>
                    <span className={`text-2xl font-black tracking-tight ${isCreditExceeded ? 'text-red-400' : 'text-white'}`}>
                      ₹{fmt(finalAmount)}
                    </span>
                  </div>
                </div>

                <div className={`mt-4 p-3 rounded-xl border ${isCreditExceeded ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Available Credit</span>
                    <span className={`font-bold ${isCreditExceeded ? 'text-red-400' : 'text-emerald-400'}`}>
                      ₹{availableCredit.toLocaleString()}
                    </span>
                  </div>
                  {isCreditExceeded && (
                    <p className="text-[10px] text-red-400/90 mt-2 font-medium flex items-center gap-1.5">
                      <AlertCircle size={12} />
                      {availableCredit === 0 ? "You have no credit limit available." : "Exceeds available credit limit."}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                  />
                  <span className="text-[10px] text-slate-300 leading-relaxed">
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="underline text-indigo-300 hover:text-white font-bold"
                    >
                      Terms & Conditions
                    </button>
                    ,{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="underline text-indigo-300 hover:text-white font-bold"
                    >
                      Disclaimer
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="underline text-indigo-300 hover:text-white font-bold"
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
                {!termsAccepted && cart.length > 0 && (
                  <p className="text-[9px] text-amber-400 mt-1 ml-6">Required to place order</p>
                )}
              </div>

              <button
                onClick={() => onCheckout(gstPercent)}
                disabled={cart.length === 0 || isCreditExceeded || gstError || gstPercent < 0 || !termsAccepted}
                className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Order
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>

              {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <AlertCircle size={14} />
                <p className="text-[9px] font-bold uppercase tracking-widest">Reserved Policy</p>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Inventory is held for 48 hours. Please process dispatch before expiration.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;
