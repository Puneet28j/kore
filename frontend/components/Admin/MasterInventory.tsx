
import React, { useState } from 'react';
import { Search, Plus, Minus, Database, ArrowUpCircle, ArrowDownCircle, AlertTriangle, X } from 'lucide-react';
import { Inventory, Article } from '../../types';

interface MasterInventoryProps {
  inventory: Inventory[];
  articles: Article[];
  onInward: (articleId: string, cartons: number) => void;
  onOutward: (articleId: string, cartons: number) => void;
}

const MasterInventory: React.FC<MasterInventoryProps> = ({ inventory, articles, onInward, onOutward }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [movementType, setMovementType] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [qty, setQty] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  const filteredInventory = inventory.filter(inv => {
    const article = articles.find(a => a.id === inv.articleId);
    return article?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           article?.sku.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedArticleId && qty > 0) {
      if (movementType === 'INWARD') {
        onInward(selectedArticleId, qty);
      } else {
        onOutward(selectedArticleId, qty);
      }
      setShowModal(false);
      setQty(0);
    }
  };

  const openMovementModal = (type: 'INWARD' | 'OUTWARD', articleId: string = '') => {
    setMovementType(type);
    setSelectedArticleId(articleId);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="p-3 bg-indigo-50 rounded-xl">
             <Database className="text-indigo-600" size={24} />
           </div>
           <div>
             <h3 className="text-xl font-bold text-slate-900">Company Master Stock</h3>
             <p className="text-sm text-slate-500">Track total physical warehouse inventory (Cartons)</p>
           </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Alert Threshold:</span>
            <input 
              type="number" 
              className="w-12 bg-transparent font-bold text-indigo-600 outline-none"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="relative flex-1 md:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => openMovementModal('OUTWARD')}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-bold hover:bg-rose-100 transition-all"
            >
              <Minus size={18} />
              Stock Outward
            </button>
            <button 
              onClick={() => openMovementModal('INWARD')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Plus size={18} />
              Stock Inward
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredInventory.map(inv => {
            const article = articles.find(a => a.id === inv.articleId)!;
            const isLowStock = inv.availableStock < lowStockThreshold;

            return (
              <div key={inv.articleId} className="p-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <img src={article.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-100" />
                    {isLowStock && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 truncate">{article.name}</p>
                      {isLowStock && (
                        <span className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter">
                          <AlertTriangle size={10} /> Low
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono tracking-widest">{article.sku}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-3 px-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Physical Stock</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-lg font-black ${isLowStock ? 'text-red-600' : 'text-slate-900'}`}>{inv.actualStock}</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Ctns</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Total Pairs</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-900">{(inv.actualStock * 24).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Pairs</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => openMovementModal('OUTWARD', inv.articleId)}
                    className="flex-1 py-2.5 px-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl font-bold text-sm hover:bg-rose-100 transition-all"
                  >
                    Stock Outward
                  </button>
                  <button 
                    onClick={() => openMovementModal('INWARD', inv.articleId)}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Stock Inward
                  </button>
                </div>
              </div>
            );
          })}
          {filteredInventory.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic">No inventory records matching your search.</div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Article Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Actual Physical Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">In Pairs</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInventory.map(inv => {
                const article = articles.find(a => a.id === inv.articleId)!;
                const isLowStock = inv.availableStock < lowStockThreshold;

                return (
                  <tr key={inv.articleId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <img src={article.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100" />
                          {isLowStock && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900">{article.name}</p>
                            {isLowStock && (
                              <span className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                <AlertTriangle size={10} /> Low Avail
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono tracking-widest">{article.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xl font-black ${isLowStock ? 'text-red-600' : 'text-slate-800'}`}>
                        {inv.actualStock}
                      </span>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Cartons</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-semibold text-slate-500">{(inv.actualStock * 24).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <button 
                          onClick={() => openMovementModal('OUTWARD', inv.articleId)}
                          className="text-rose-600 hover:text-rose-800 font-bold text-sm"
                        >
                          Outward
                        </button>
                        <button 
                          onClick={() => openMovementModal('INWARD', inv.articleId)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold text-sm"
                        >
                          Inward
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${movementType === 'INWARD' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  {movementType === 'INWARD' ? (
                    <ArrowUpCircle className="text-emerald-600" size={32} />
                  ) : (
                    <ArrowDownCircle className="text-rose-600" size={32} />
                  )}
                </div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-2 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                Stock {movementType === 'INWARD' ? 'Inward' : 'Outward'} Movement
              </h3>
              <p className="text-slate-500 text-sm mb-6">
                {movementType === 'INWARD' 
                  ? 'Record new production or purchase arrivals to the master warehouse.' 
                  : 'Record stock deduction due to sample issues, returns, or other manual removals.'}
              </p>
              
              <form onSubmit={handleMovementSubmit} className="space-y-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Article</label>
                    <select 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={selectedArticleId}
                      onChange={(e) => setSelectedArticleId(e.target.value)}
                      required
                    >
                       <option value="">Choose an article...</option>
                       {articles.map(a => <option key={a.id} value={a.id}>{a.name} ({a.sku})</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Quantity (Cartons)</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={qty}
                      onChange={(e) => setQty(parseInt(e.target.value) || 0)}
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">Note: 1 Carton = 24 Pairs</p>
                 </div>
                 <button 
                   className={`w-full text-white py-4 rounded-xl font-bold transition-all shadow-lg mt-4 ${
                     movementType === 'INWARD' 
                       ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' 
                       : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                   }`}
                 >
                   Confirm Stock {movementType === 'INWARD' ? 'Inward' : 'Outward'}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default MasterInventory;
