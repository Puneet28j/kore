
import React from "react";
import {
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
  AlertCircle,
  Info,
  CreditCard,
} from "lucide-react";
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
  onCheckout: () => void;
  total: number;
  assortments: Assortment[];
  user?: User;
}

const Cart: React.FC<CartProps> = ({
  articles,
  cart,
  clearCartItem,
  onCheckout,
  total,
  user,
}) => {
  const currentUser = user;

  const discountPercentage = currentUser?.discountPercentage || 0;
  const discountAmount = (total * discountPercentage) / 100;
  const finalAmount = total - discountAmount;
  
  const availableCredit = currentUser?.availableCredit ?? 0;
  // Based on strict 0 requirements from backend:
  // If credit is exactly 0, they cannot order at all.
  // If credit < required, they cannot order.
  const isCreditExceeded = availableCredit === 0 || finalAmount > availableCredit;

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
          <ShoppingCart size={28} className="text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          Your cart is empty
        </h3>
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
    );
  }

  const availableItems = cart.filter(i => {
    const art = articles.find(a => a.id === i.articleId);
    return art?.status === "AVAILABLE";
  });

  const wishlistItems = cart.filter(i => {
    const art = articles.find(a => a.id === i.articleId);
    return art?.status !== "AVAILABLE";
  });

  const totalPairs = cart.reduce((sum, item) => sum + item.pairCount, 0);
  const totalCartons = cart.reduce((sum, item) => sum + item.cartonCount, 0);

  const renderItem = (item: typeof cart[0]) => {
    const article = articles.find((a) => a.id === item.articleId);
    if (!article) return null;
    const variant = article.variants?.find((v) => v.id === item.variantId);
    const sizes = variant
      ? parseSizeRange(variant.sizeRange || "")
      : Object.keys(item.sizeQuantities || {});

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
              const url = (typeof imgData === "object" ? (imgData as any)?.url : (imgData as string)) || variant?.images?.[0] || article.imageUrl || "";
              return getImageUrl(url);
            })()}
            alt={article.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm text-slate-900 tracking-tight break-all">
            {article.name} <span className="text-slate-400 font-medium">({variant?.color || "N/A"})</span>
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
        <div className="flex items-center gap-8">
          <div className="text-right whitespace-nowrap">
            <p className="font-bold text-sm text-slate-900 tracking-tight">
              ₹{item.price.toLocaleString()}
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
              {item.pairCount} Pairs · {item.cartonCount} Ctn
            </p>
          </div>
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
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in duration-500">
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

        {/* Wishlist Pre-launch */}
        {wishlistItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm border-dashed">
            <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/30 flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600" />
                Wishlist Pre-bookings
              </h3>
              <span className="text-[10px] font-bold text-amber-600/60 uppercase tracking-widest">
                Will be available on expected dates
              </span>
            </div>
            <div className="divide-y divide-amber-50">
              {wishlistItems.map(renderItem)}
            </div>
            <div className="px-5 py-2.5 bg-amber-50/50 border-t border-amber-100">
              <p className="text-[10px] text-amber-700/70 font-medium italic flex items-center gap-2">
                <Info size={12} />
                These items will stay in your cart and can be booked once they become available.
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
                <span className="text-sm font-bold text-slate-300">
                  ₹{total.toLocaleString()}
                </span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-emerald-400">Discount ({discountPercentage}%)</span>
                  <span className="text-sm font-bold text-emerald-400">
                    -₹{discountAmount.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-end pt-2 border-t border-white/5">
                <span className="text-xs font-bold text-slate-300">Final Amount</span>
                <span className={`text-xl font-black tracking-tight ${isCreditExceeded ? 'text-red-400' : 'text-indigo-400'}`}>
                  ₹{finalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Credit Status Box */}
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

          <button
            onClick={onCheckout}
            disabled={availableItems.length === 0 || isCreditExceeded}
            className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Order
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
          
          {availableItems.length === 0 && cart.length > 0 && (
            <p className="text-[9px] text-slate-400 mt-3 text-center italic">
              Add available items to confirm order.
            </p>
          )}
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
  );
};

export default Cart;
