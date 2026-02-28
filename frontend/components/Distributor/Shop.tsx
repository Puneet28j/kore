
import React from 'react';
import { ShoppingCart, Plus, Minus, Info, Search, Filter, ArrowRight } from 'lucide-react';
import { Article, Inventory } from '../../types';

interface ShopProps {
  articles: Article[];
  inventory: Inventory[];
  cart: { articleId: string; cartons: number }[];
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  goToCart: () => void;
}

const Shop: React.FC<ShopProps> = ({ articles, inventory, cart, addToCart, removeFromCart, goToCart }) => {
  const cartItemsCount = cart.reduce((sum, item) => sum + item.cartons, 0);

  return (
    <div className="space-y-8 pb-20">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
           <input 
             type="text" 
             placeholder="Search by article name or SKU..." 
             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
           />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all">
             <Filter size={18} />
             Filter
           </button>
           {cartItemsCount > 0 && (
              <button 
                onClick={goToCart}
                className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
              >
                <ShoppingCart size={18} />
                Checkout ({cartItemsCount})
              </button>
           )}
        </div>
      </div>

      {/* Article Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {articles.map(article => {
          const inv = inventory.find(i => i.articleId === article.id);
          const inCart = cart.find(c => c.articleId === article.id)?.cartons || 0;
          const isOutOfStock = (inv?.availableStock || 0) <= 0;

          return (
            <div key={article.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
              <div className="relative aspect-square overflow-hidden">
                <img 
                  src={article.imageUrl} 
                  alt={article.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                />
                
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-50">
                    {article.category}
                  </div>
                </div>

                {isOutOfStock && (
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-6 text-center">
                    <div className="bg-white text-slate-900 px-4 py-2 rounded-xl font-black text-sm shadow-xl">OUT OF STOCK</div>
                  </div>
                )}
                
                <div className="absolute bottom-4 right-4">
                   <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2">
                      <p className="text-[10px] font-bold text-slate-400">STOCK</p>
                      <p className={`font-black text-sm ${inv && inv.availableStock < 10 ? 'text-red-500' : 'text-slate-900'}`}>
                         {inv?.availableStock || 0} CTN
                      </p>
                   </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <h4 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{article.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">{article.sku}</p>
                </div>

                <div className="flex items-center justify-between mb-6">
                   <div className="space-y-0.5">
                      <p className="text-2xl font-black text-slate-900">₹{article.pricePerPair.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Per Pair (24/Ctn)</p>
                   </div>
                   <div className="bg-indigo-50 p-2 rounded-lg" title="Assortment Based Booking">
                      <Info size={16} className="text-indigo-600" />
                   </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`flex flex-1 items-center justify-between bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 p-1 transition-all ${inCart > 0 ? 'ring-2 ring-indigo-500/20' : ''}`}>
                    <button 
                      disabled={inCart === 0}
                      onClick={() => removeFromCart(article.id)}
                      className="p-3 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-xl transition-all disabled:opacity-30"
                    >
                      <Minus size={20} />
                    </button>
                    <div className="text-center flex flex-col items-center">
                      <span className="font-black text-lg text-slate-900">{inCart}</span>
                      <p className="text-[8px] text-slate-400 uppercase font-bold leading-none">Cartons</p>
                    </div>
                    <button 
                      disabled={isOutOfStock}
                      onClick={() => addToCart(article.id)}
                      className="p-3 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-xl transition-all disabled:opacity-30"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Persistent Cart Bar (Mobile) */}
      {cartItemsCount > 0 && (
         <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-30 sm:hidden">
            <button 
              onClick={goToCart}
              className="w-full bg-indigo-600 text-white p-5 rounded-2xl shadow-2xl flex items-center justify-between font-bold"
            >
               <div className="flex items-center gap-3">
                  <ShoppingCart size={24} />
                  <span>View Booking Cart</span>
               </div>
               <div className="flex items-center gap-2">
                  <span className="bg-white text-indigo-600 px-3 py-1 rounded-lg text-sm">{cartItemsCount}</span>
                  <ArrowRight size={20} />
               </div>
            </button>
         </div>
      )}
    </div>
  );
};

export default Shop;
