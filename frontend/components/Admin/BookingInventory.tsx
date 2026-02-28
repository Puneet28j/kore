
import React, { useState } from 'react';
import { Search, ClipboardList, Package, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { Inventory, Article, Order, OrderStatus } from '../../types';

interface BookingInventoryProps {
  inventory: Inventory[];
  articles: Article[];
  orders: Order[];
}

const BookingInventory: React.FC<BookingInventoryProps> = ({ inventory, articles, orders }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredInventory = inventory.filter(inv => {
    const article = articles.find(a => a.id === inv.articleId);
    return article?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           article?.sku.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getPendingAllocations = (articleId: string) => {
    return orders
      .filter(o => o.status === OrderStatus.BOOKED || o.status === OrderStatus.PENDING)
      .reduce((sum, o) => {
        const item = o.items.find(i => i.articleId === articleId);
        return sum + (item?.cartonCount || 0);
      }, 0);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-amber-50 rounded-xl">
             <ClipboardList className="text-amber-600" size={24} />
           </div>
           <div>
             <h3 className="text-xl font-bold text-slate-900">Booking & Reservation Manager</h3>
             <p className="text-sm text-slate-500">View what is available for Parties vs Reserved for pending POs</p>
           </div>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search SKU..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <SummaryCard 
            label="Total Reserved" 
            value={inventory.reduce((sum, i) => sum + i.reservedStock, 0)} 
            icon={<Clock className="text-amber-600" />} 
            color="bg-amber-50"
         />
         <SummaryCard 
            label="Free to Book" 
            value={inventory.reduce((sum, i) => sum + i.availableStock, 0)} 
            icon={<ShieldCheck className="text-emerald-600" />} 
            color="bg-emerald-50"
         />
         <SummaryCard 
            label="Shortfall Risk" 
            value={inventory.filter(i => i.availableStock < 0).length} 
            icon={<AlertCircle className="text-red-600" />} 
            color="bg-red-50"
         />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredInventory.map(inv => {
            const article = articles.find(a => a.id === inv.articleId)!;
            const demand = getPendingAllocations(inv.articleId);
            
            return (
              <div key={inv.articleId} className="p-4 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">IMG</div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{article.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono tracking-widest">{article.sku}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Actual Master</p>
                    <p className="font-bold text-slate-700">{inv.actualStock} <span className="text-[8px] uppercase">Ctns</span></p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <p className="text-[10px] text-amber-400 uppercase font-black tracking-widest mb-1">Reserved</p>
                    <p className="font-bold text-amber-600">{inv.reservedStock} <span className="text-[8px] uppercase">Ctns</span></p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-indigo-50/30 rounded-xl border border-indigo-50">
                  <div className="flex flex-col">
                    <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest">Available to Book</p>
                    <span className={`text-xl font-black ${inv.availableStock < 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {inv.availableStock}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Current Demand</p>
                    <div className="flex flex-col items-end mt-1">
                      <span className="text-sm font-bold text-slate-700">{demand} CTN</span>
                      <div className="w-16 h-1 bg-slate-200 rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500" 
                          style={{ width: `${Math.min(100, (demand / (inv.actualStock || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredInventory.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic">No articles matching your search.</div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Article</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Actual Master</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Party Reserved</th>
                <th className="px-6 py-4 text-xs text-slate-500 uppercase text-center font-black">Available for Booking</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Current Demand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInventory.map(inv => {
                const article = articles.find(a => a.id === inv.articleId)!;
                const demand = getPendingAllocations(inv.articleId);
                
                return (
                  <tr key={inv.articleId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">IMG</div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{article.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{article.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-slate-400 text-sm">{inv.actualStock}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{inv.reservedStock}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-black ${inv.availableStock < 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {inv.availableStock}
                      </span>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Free Cartons</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                       <div className="flex flex-col items-center">
                          <span className="text-sm font-bold text-slate-700">{demand} CTN</span>
                          <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                             <div 
                               className="h-full bg-indigo-500" 
                               style={{ width: `${Math.min(100, (demand / (inv.actualStock || 1)) * 100)}%` }}
                             ></div>
                          </div>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
  </div>
  );
};

const SummaryCard: React.FC<{ label: string, value: number, icon: React.ReactNode, color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
     <div>
       <p className="text-slate-500 text-sm font-medium">{label}</p>
       <p className="text-3xl font-black mt-1 text-slate-900">{value.toLocaleString()}</p>
     </div>
     <div className={`p-4 ${color} rounded-2xl`}>
       {icon}
     </div>
  </div>
);

export default BookingInventory;
