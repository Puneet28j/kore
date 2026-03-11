import React from "react";
import {
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
  AlertCircle,
  Info,
} from "lucide-react";
import { Article, Assortment } from "../../types";

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
}

const Cart: React.FC<CartProps> = ({
  articles,
  cart,
  addToCart,
  removeFromCart,
  clearCartItem,
  onCheckout,
  total,
  assortments,
}) => {
  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
          <ShoppingCart size={40} className="text-slate-300" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">
          The party cart is empty
        </h3>
        <p className="text-slate-500 max-w-xs text-center mb-8">
          You haven't selected any articles for booking yet. Head over to the
          catalogue to start your order.
        </p>
        <button
          onClick={() => (window.location.hash = "#shop")} // Simple hack or use a passed prop
          className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          View Catalogue
        </button>
      </div>
    );
  }

  const totalPairs = cart.reduce((sum, item) => sum + item.pairCount, 0);
  const totalCartons = cart.reduce((sum, item) => sum + item.cartonCount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Items List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Package size={18} className="text-indigo-600" />
              Booking Details
            </h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Carton Size: 24 Pairs
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {cart.map((item) => {
              const article = articles.find((a) => a.id === item.articleId)!;
              const variant = article.variants?.find(
                (v) => v.id === item.variantId
              );
              const sizes = variant
                ? parseSizeRange(variant.sizeRange || "")
                : Object.keys(item.sizeQuantities || {});

              return (
                <div
                  key={`${item.articleId}-${item.variantId || ""}`}
                  className="p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 group hover:bg-indigo-50/10 transition-colors relative"
                >
                  <div className="relative w-24 h-24 shrink-0">
                    <img
                      src={variant?.images?.[0] || article.imageUrl}
                      alt={article.name}
                      className="w-full h-full object-cover rounded-xl border border-slate-200 shadow-sm"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="font-bold text-lg text-slate-900">
                      {article.name} <span className="text-slate-400 font-medium">({variant?.color || "N/A"})</span>
                    </h4>
                    {variant && (
                      <p className="text-xs text-slate-500 font-mono mb-2 uppercase tracking-tight">
                        {variant.color} · {variant.sizeRange}
                      </p>
                    )}

                    {/* show entered sizes */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {sizes.map((sz) => (
                        <div
                          key={sz}
                          className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[10px] text-slate-600"
                        >
                          Sz {sz}:{" "}
                          <span className="font-bold">
                            {item.sizeQuantities?.[sz] || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-center sm:items-end gap-3">
                    <div className="text-right">
                      <p className="font-bold text-slate-900">
                        ₹{item.price.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {item.pairCount} Pairs total
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      clearCartItem(item.articleId, item.variantId)
                    }
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors sm:ml-4"
                    title="Remove item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex gap-4">
          <Info size={24} className="text-indigo-600 shrink-0" />
          <div className="text-xs text-indigo-700 leading-relaxed">
            <p className="font-bold mb-1">Carton Assortment Rule</p>
            Your current selection adheres to the Kore Kollective standard
            assortment. Every 1 carton contains a pre-defined mix of sizes (4-8
            for Women, 7-11 for Men). You cannot customize individual pairs
            within a carton.
          </div>
        </div>
      </div>

      {/* Summary Sidebar */}
      <div className="space-y-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 sticky top-8">
          <h3 className="text-xl font-bold text-slate-900 mb-8 border-b border-slate-100 pb-4">
            Booking Summary
          </h3>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center text-slate-600">
              <span className="text-sm font-medium">Total Cartons</span>
              <span className="font-bold text-slate-900">{totalCartons}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="text-sm font-medium">Total Pairs</span>
              <span className="font-bold text-slate-900">{totalPairs}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="text-sm font-medium">Subtotal</span>
              <span className="font-bold text-slate-900">
                ₹{total.toLocaleString()}
              </span>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-slate-900">
                  Grand Total
                </span>
                <span className="text-2xl font-black text-indigo-600">
                  ₹{total.toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">
                Inclusive of all distribution taxes
              </p>
            </div>
          </div>

          <button
            onClick={onCheckout}
            className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 group"
          >
            Confirm & Book Order
            <ArrowRight
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
          </button>

          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle size={20} />
              <p className="text-[11px] font-bold uppercase tracking-wide">
                Reserved Inventory Policy
              </p>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              By confirming, inventory will be moved to "Reserved" status for 48
              hours. Orders not processed by dispatch team within this window
              may be flagged for cancellation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
