
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Plus, Minus, Database, ArrowUpCircle, ArrowDownCircle, AlertTriangle, X, ChevronDown, ImageIcon, Package, TrendingUp, Lock, ShoppingCart, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { Inventory, Article } from '../../types';
import { getImageUrl } from '../../utils/imageUtils';
import { formatAssortment } from '../../utils/assortmentUtils';
import { apiFetch } from '../../services/api';
import { masterCatalogService } from '../../services/masterCatalogService';
import { toast } from 'sonner';
import Pagination from '../ui/Pagination';
import { usePageSize } from '../../utils/usePageSize';
import { Article as ArticleType } from '../../types';

interface MasterInventoryProps {
  inventory: Inventory[];
  articles: Article[];
  onInward: (articleId: string, cartons: number) => void;
  onOutward: (articleId: string, cartons: number) => void;
  onRefresh?: () => void;
}

const INWARD_REASONS = ['Purchase / GRN', 'Returned Stock', 'Stock Transfer In', 'Manual Correction', 'Other'];
const OUTWARD_REASONS = ['Damage / Defect', 'Sample Issue', 'Lost / Missing', 'Stock Transfer Out', 'Manual Correction', 'Other'];

const MasterInventory: React.FC<MasterInventoryProps> = ({ inventory, articles, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  // Multi-step stock movement
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [movementType, setMovementType] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [modalArticleSearch, setModalArticleSearch] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [cartons, setCartons] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [totalPOPairs, setTotalPOPairs] = useState(0);
  const [poPairsPerArticle, setPoPairsPerArticle] = useState<Record<string, number>>({});
  const [poPairsPerVariant, setPoPairsPerVariant]  = useState<Record<string, number>>({});
  // Secondary lookup by SKU — used when PO item has no variantId (older POs)
  const [poPairsByVariantSku, setPoPairsByVariantSku] = useState<Record<string, number>>({});

  // ── Backend pagination state ─────────────────────────────────────────────
  const [localArticles, setLocalArticles] = useState<ArticleType[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageSize, setPageSize] = usePageSize('master_inventory', 20);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useRef('');

  // Company-wide Available / Blocked (not page-scoped)
  const [totalLivePairs, setTotalLivePairs] = useState(0);
  const [totalBlockedPairs, setTotalBlockedPairs] = useState(0);

  const fetchStockTotals = useCallback(async () => {
    try {
      const res = await masterCatalogService.getStockTotals();
      const data = res?.data || res || {};
      setTotalLivePairs(Number(data.totalLivePairs) || 0);
      setTotalBlockedPairs(Number(data.totalBlockedPairs) || 0);
    } catch {
      /* silent — keep last known totals */
    }
  }, []);

  // PO Pending = all active POs (SENT, not deleted) that have NOT yet been received via GRN
  const fetchPOPairs = async () => {
    try {
      const [poRes, grnRes] = await Promise.all([
        apiFetch("/purchase-orders?limit=1000&status=SENT"),
        apiFetch("/grn/history?limit=2000"),
      ]);

      const grns: any[] = (grnRes.data || grnRes) as any[];

      // Build set of received PO numbers from TWO sources:
      // 1. poIds field (explicitly set on GRN submit)
      // 2. refId field (GRN linked to PO via refId = poNumber)
      const receivedPONos = new Set<string>();
      grns.forEach((g: any) => {
        // refId for PO-linked GRNs is the PO number itself
        if (g.refId) receivedPONos.add(String(g.refId));
        (g.poIds || []).forEach((p: string) => receivedPONos.add(String(p)));
      });

      const pos: any[] = poRes.data || poRes || [];
      let total = 0;
      const perArticle: Record<string, number> = {};
      const perVariant: Record<string, number> = {};

      const perSku: Record<string, number> = {};

      pos.forEach((po: any) => {
        if (po.isDeleted) return;
        if (receivedPONos.has(String(po.poNumber))) return; // already GRN'd
        (po.items || []).forEach((item: any) => {
          // quantity = total pairs (always = cartonCount * 24, set by POPage)
          const qty = Number(item.quantity || 0) || Number(item.cartonCount || 0) * 24;
          if (!qty) return;
          total += qty;
          const aid = String(item.articleId || "");
          const vid = String(item.variantId  || "");
          const sku = String(item.sku || "").trim().toUpperCase();
          if (aid) perArticle[aid] = (perArticle[aid] || 0) + qty;
          if (vid) perVariant[vid]  = (perVariant[vid]  || 0) + qty;
          // SKU fallback for PO items where variantId wasn't set (older POs)
          if (sku) perSku[sku] = (perSku[sku] || 0) + qty;
        });
      });

      setTotalPOPairs(total);
      setPoPairsPerArticle(perArticle);
      setPoPairsPerVariant(perVariant);
      setPoPairsByVariantSku(perSku);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchPOPairs(); fetchStockTotals(); }, [fetchStockTotals]);

  // Real-time: re-fetch when PO/GRN/catalog changes affect pending stock
  useEffect(() => {
    const handler = () => {
      fetchPOPairs();
      fetchStockTotals();
    };
    window.addEventListener("billRefetch",   handler);
    window.addEventListener("grnRefetch",    handler);
    window.addEventListener("catalogRefetch", handler);
    window.addEventListener("poRefetch",     handler);
    return () => {
      window.removeEventListener("billRefetch",   handler);
      window.removeEventListener("grnRefetch",    handler);
      window.removeEventListener("catalogRefetch", handler);
      window.removeEventListener("poRefetch",     handler);
    };
  }, [fetchStockTotals]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Backend-paginated inventory fetch ──────────────────────────────────
  const fetchLocalInventory = useCallback(async (page: number, limit: number, q: string) => {
    setPageLoading(true);
    try {
      const res = await masterCatalogService.listMasterItems({ page, limit, q: q || undefined });
      const mapped: ArticleType[] = (res.data || []).map((item: any) => {
        const normalizedVariants = (item.variants || []).map((v: any) => {
          const sizeSkus: Record<string, string> = v.sizeSkus || {};
          const sizeQuantities: Record<string, number> = v.sizeQuantities || {};
          if (Object.keys(sizeQuantities).length === 0 && v.sizeMap) {
            Object.entries(v.sizeMap).forEach(([sz, cell]: [string, any]) => {
              sizeSkus[sz] = cell.sku || '';
              sizeQuantities[sz] = cell.qty || 0;
            });
          }
          return { ...v, id: v._id || Math.random().toString(36).substr(2, 9), sizeSkus, sizeQuantities };
        });
        return {
          id: item._id,
          sku: item.sku || '',
          name: item.articleName,
          category: item.gender,
          assortmentId: item.assortmentId || '',
          productCategory: item.categoryId?.name,
          brand: item.brandId?.name,
          pricePerPair: item.variants?.[0]?.sellingPrice || item.mrp,
          mrp: item.mrp,
          soleColor: item.soleColor,
          status: item.stage,
          imageUrl: item.primaryImage?.url,
          colorMedia: item.colorMedia || [],
          variants: normalizedVariants,
          isActive: item.isActive !== false,
        } as ArticleType;
      });
      setLocalArticles(mapped);
      setTotalItems(res.meta?.total ?? res.data?.length ?? 0);
      setTotalPages(res.meta?.totalPages ?? 1);
    } catch (err) {
      console.error('Failed to fetch inventory page', err);
    } finally {
      setPageLoading(false);
    }
  }, []);

  // Fetch on page/pageSize change
  useEffect(() => {
    fetchLocalInventory(currentPage, pageSize, debouncedSearch.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  // Debounced search resets to page 1
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      debouncedSearch.current = searchTerm.trim();
      setCurrentPage(1);
      fetchLocalInventory(1, pageSize, searchTerm.trim());
    }, 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Real-time refresh inventory on catalog / grn changes
  useEffect(() => {
    const handler = () => fetchLocalInventory(currentPage, pageSize, debouncedSearch.current);
    window.addEventListener('catalogRefetch', handler);
    window.addEventListener('grnRefetch', handler);
    return () => {
      window.removeEventListener('catalogRefetch', handler);
      window.removeEventListener('grnRefetch', handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  const filteredInventory = localArticles.map(a => ({ articleId: a.id, ...inventory.find(i => i.articleId === a.id) }));


  const openMovementModal = (type: 'INWARD' | 'OUTWARD', articleId = '', variantId = '') => {
    setMovementType(type);
    setSelectedArticleId(articleId);
    setSelectedVariantId(variantId);
    setModalArticleSearch('');
    setCartons('');
    setReason('');
    setNote('');
    setStep(articleId ? 1 : 0);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setStep(0); };

  const handleMovementSubmit = async () => {
    if (!selectedVariantId || !cartons || !reason) return;
    setSubmitting(true);
    try {
      await masterCatalogService.stockMovement(selectedVariantId, {
        type: movementType,
        cartons: Number(cartons),
        reason,
        note,
      });
      toast.success(`Stock ${movementType === 'INWARD' ? 'inward' : 'outward'} recorded (${cartons} carton(s))`);
      closeModal();
      fetchLocalInventory(currentPage, pageSize, debouncedSearch.current);
      fetchStockTotals();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record stock movement');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedArticle = articles.find(a => a.id === selectedArticleId) || localArticles.find(a => a.id === selectedArticleId);
  const selectedVariant = selectedArticle?.variants?.find(v => v.id === selectedVariantId);
  const variantLive = selectedVariant ? Object.values(selectedVariant.sizeMap || {}).reduce((s, c: any) => s + (c?.qty || 0), 0) : 0;
  const reasonOptions = movementType === 'INWARD' ? INWARD_REASONS : OUTWARD_REASONS;

  const allAvailableArticles = useMemo(() => {
    const map = new Map<string, ArticleType>();
    articles.forEach(a => map.set(a.id, a));
    localArticles.forEach(a => { if (!map.has(a.id)) map.set(a.id, a); });
    return Array.from(map.values());
  }, [articles, localArticles]);

  const filteredModalArticles = allAvailableArticles.filter(a =>
    (a.name || '').toLowerCase().includes(modalArticleSearch.toLowerCase()) ||
    (a.sku || '').toLowerCase().includes(modalArticleSearch.toLowerCase())
  );

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
            <span className="text-[10px] font-bold text-slate-400 uppercase">Alert:</span>
            <input
              type="number"
              className="w-12 bg-transparent font-bold text-indigo-600 outline-none"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => openMovementModal('INWARD')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100"
          >
            <ArrowUpCircle size={16} /> Stock Movement
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-2.5 bg-emerald-50 rounded-xl">
            <TrendingUp size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Available</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{Math.floor(totalLivePairs / 24).toLocaleString()}</span>
              <span className="text-xs font-bold text-slate-400">Ctns</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{totalLivePairs.toLocaleString()} free pairs</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-2.5 bg-indigo-50 rounded-xl">
            <ShoppingCart size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">PO Pending</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{Math.floor(totalPOPairs / 24).toLocaleString()}</span>
              <span className="text-xs font-bold text-slate-400">Ctns</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{totalPOPairs.toLocaleString()} pairs incoming</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-2.5 bg-amber-50 rounded-xl">
            <Lock size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Blocked</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{Math.floor(totalBlockedPairs / 24).toLocaleString()}</span>
              <span className="text-xs font-bold text-slate-400">Ctns</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{totalBlockedPairs.toLocaleString()} pairs</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {pageLoading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Loader2 className="mx-auto text-indigo-400 mb-3 animate-spin" size={36} />
            <p className="text-slate-400 font-medium font-mono uppercase tracking-widest text-xs italic">Loading stock records…</p>
          </div>
        )}
        {!pageLoading && filteredInventory.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Package className="mx-auto text-slate-200 mb-3" size={48} />
            <p className="text-slate-400 font-medium font-mono uppercase tracking-widest text-xs italic">No matching stock records</p>
          </div>
        )}

        {!pageLoading && filteredInventory.map(inv => {
          const article = localArticles.find(a => a.id === inv.articleId);
          if (!article) return null;
          const isExpanded = expandedIds.has(article.id);
          const variantCount = article.variants?.length || 0;

          // Compute pair totals from variants (same logic as expanded table)
          const articleLivePairs = (article.variants || []).reduce((sum, v) =>
            sum + Object.values(v.sizeMap || {}).reduce((s, c: any) => s + (Number(c?.qty) || 0), 0), 0);
          const articleBlockedPairs = (article.variants || []).reduce((sum, v) =>
            sum + Object.values(v.sizeMap || {}).reduce((s, c: any) => s + (Number(c?.blockedQty) || 0), 0), 0);
          const articlePOPairs = poPairsPerArticle[article.id] || 0;

          const isLowStock = articleLivePairs < lowStockThreshold * 24;

          return (
            <div key={inv.articleId} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all hover:border-indigo-200">
              {/* Parent Article Row */}
              <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => toggleExpand(article.id)}
              >
                <div className="relative shrink-0">
                  <img src={getImageUrl(article?.imageUrl)} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-100" />
                  {isLowStock && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse shadow-sm"></div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{article.name}</h4>
                    {isLowStock && (
                      <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-black uppercase tracking-tighter flex items-center gap-1">
                        <AlertTriangle size={8} /> Low Stock
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">{article.sku}</p>
                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                      {variantCount} Variants
                    </span>
                  </div>
                </div>

                {/* Stock Summary Columns */}
                <div className="hidden lg:flex items-center gap-6 mr-4">
                  <div className="text-center w-24 border-l border-slate-100 pl-4">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-0.5">Available</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-xl font-black text-slate-900">{Math.floor(articleLivePairs / 24)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Ctns</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5">{articleLivePairs} prs</p>
                  </div>
                  <div className="text-center w-24 border-l border-slate-100 pl-4">
                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">PO Pending</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-xl font-black text-slate-900">{Math.floor(articlePOPairs / 24)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Ctns</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5">{articlePOPairs} prs</p>
                  </div>
                  <div className="text-center w-24 border-l border-slate-100 pl-4">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Blocked</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-xl font-black text-slate-900">{Math.floor(articleBlockedPairs / 24)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Ctns</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5">{articleBlockedPairs} prs</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                   <div className="lg:w-32"></div>
                   <ChevronDown 
                     size={20} 
                     className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                   />
                </div>
              </div>

              {/* Mobile Stats Row */}
              <div className="lg:hidden grid grid-cols-3 gap-1.5 px-4 pb-4">
                <div className="bg-emerald-50/50 p-2 rounded-xl text-center border border-emerald-100">
                  <p className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter mb-0.5">Avail</p>
                  <p className="text-sm font-black text-slate-900">{Math.floor(articleLivePairs / 24)} <span className="text-[8px] text-slate-400">C</span></p>
                  <p className="text-[8px] text-slate-400">{articleLivePairs} prs</p>
                </div>
                <div className="bg-indigo-50/50 p-2 rounded-xl text-center border border-indigo-100">
                  <p className="text-[8px] font-black text-indigo-600 uppercase tracking-tighter mb-0.5">PO</p>
                  <p className="text-sm font-black text-slate-900">{Math.floor(articlePOPairs / 24)} <span className="text-[8px] text-slate-400">C</span></p>
                  <p className="text-[8px] text-slate-400">{articlePOPairs} prs</p>
                </div>
                <div className="bg-amber-50/50 p-2 rounded-xl text-center border border-amber-100">
                  <p className="text-[8px] font-black text-amber-600 uppercase tracking-tighter mb-0.5">Blocked</p>
                  <p className="text-sm font-black text-slate-900">{Math.floor(articleBlockedPairs / 24)} <span className="text-[8px] text-slate-400">C</span></p>
                  <p className="text-[8px] text-slate-400">{articleBlockedPairs} prs</p>
                </div>
              </div>

              {/* Variant Dropdown Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-2 duration-300">
                   {variantCount === 0 ? (
                     <div className="p-8 text-center text-slate-400 italic text-xs font-medium">
                       No variants registered for this article.
                     </div>
                   ) : (
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-100/50 border-b border-slate-100">
                             <tr>
                               <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Variant Details</th>
                               <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Color</th>
                               <th className="px-6 py-3 text-[9px] font-black text-emerald-500 uppercase tracking-widest text-center">Available</th>
                               <th className="px-6 py-3 text-[9px] font-black text-indigo-500 uppercase tracking-widest text-center">PO Pending</th>
                               <th className="px-6 py-3 text-[9px] font-black text-amber-500 uppercase tracking-widest text-center">Blocked</th>
                               <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                             {article.variants?.map(variant => {
                               // live = available (sizeMap.qty), blocked = reserved for booked orders
                               const livePairs    = Object.values(variant.sizeMap || {}).reduce((sum, s) => sum + (s.qty        || 0), 0);
                               const blockedPairs = Object.values(variant.sizeMap || {}).reduce((sum, s) => sum + (s.blockedQty || 0), 0);
                               const liveCtns    = Math.floor(livePairs    / 24);
                               const blockedCtns = Math.floor(blockedPairs / 24);
                               // Try by variantId first, then fall back to SKU (older POs may lack variantId)
                               const variantSkuKey = (variant.sku || "").trim().toUpperCase();
                               const poPairs = poPairsPerVariant[variant.id]
                                 ?? poPairsPerVariant[(variant as any)._id]
                                 ?? (variantSkuKey ? poPairsByVariantSku[variantSkuKey] : undefined)
                                 ?? 0;
                               const poCtns      = Math.floor(poPairs / 24);

                                 return (
                                 <tr key={variant.id} className="hover:bg-white transition-colors group">
                                   <td className="px-6 py-3">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-0.5 shadow-sm group-hover:border-indigo-200 transition-colors">
                                           {(() => {
                                             const colorMedia = article.colorMedia || [];
                                             const matched = colorMedia.find(cm => cm.color.toLowerCase() === variant.color.toLowerCase());
                                             const vImg = (matched && matched.images && matched.images.length > 0)
                                               ? matched.images[0].url
                                               : (variant.images && variant.images.length > 0 ? variant.images[0] : article?.imageUrl);
                                             return vImg ? (
                                               <img src={getImageUrl(vImg)} alt={variant.color} className="w-full h-full object-cover rounded-md" />
                                             ) : (
                                               <div className="w-full h-full rounded-md bg-slate-50 flex items-center justify-center">
                                                 <ImageIcon size={14} className="text-slate-300" />
                                               </div>
                                             );
                                           })()}
                                        </div>
                                        <div>
                                          <p className="text-xs font-bold text-slate-800">{variant.itemName || `${article.name} - ${variant.color} - ${variant.sizeRange}`}</p>
                                          <p className="text-[9px] font-mono text-slate-400 tracking-wider">
                                            SKU: {variant.sku || article.sku} · {formatAssortment(variant.sizeQuantities)}
                                          </p>
                                        </div>
                                      </div>
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-100 shadow-sm">
                                         <span className="text-[10px] font-bold text-slate-600 uppercase">{variant.color}</span>
                                      </div>
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                     <span className="text-sm font-black text-emerald-600">{liveCtns}</span>
                                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Cartons</p>
                                     <p className="text-[8px] text-slate-300">{livePairs} prs</p>
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                     <span className="text-sm font-black text-indigo-600">{poCtns}</span>
                                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Cartons</p>
                                     <p className="text-[8px] text-slate-300">{poPairs} prs</p>
                                   </td>
                                   <td className="px-6 py-3 text-center">
                                     <span className="text-sm font-black text-amber-500">{blockedCtns}</span>
                                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Cartons</p>
                                     <p className="text-[8px] text-slate-300">{blockedPairs} prs</p>
                                   </td>
                                   <td className="px-6 py-3">
                                      <div className="flex justify-end items-center gap-2">
                                        <button
                                          onClick={() => openMovementModal('OUTWARD', article.id, variant.id)}
                                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-bold hover:bg-rose-100 transition-all border border-rose-100"
                                        >
                                          <Minus size={12} /> Outward
                                        </button>
                                        <button
                                          onClick={() => openMovementModal('INWARD', article.id, variant.id)}
                                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold hover:bg-emerald-100 transition-all border border-emerald-100"
                                        >
                                          <Plus size={12} /> Inward
                                        </button>
                                      </div>
                                   </td>
                                 </tr>
                               );
                             })}
                          </tbody>
                        </table>
                     </div>
                   )}
                </div>
              )}
            </div>
          );
        })}

        {/* Pagination */}
        {!pageLoading && totalPages >= 1 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      {/* Multi-Step Stock Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${movementType === 'INWARD' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  {movementType === 'INWARD'
                    ? <ArrowUpCircle size={22} className="text-emerald-600" />
                    : <ArrowDownCircle size={22} className="text-rose-600" />}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Movement</p>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    {step === 0 ? 'Choose Type' : step === 1 ? 'Select Variant' : step === 2 ? 'Quantity & Reason' : 'Confirm'}
                  </h3>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center gap-1.5 px-6 pt-4 pb-2 shrink-0">
              {[0, 1, 2, 3].map(s => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-300 ${s <= step ? (movementType === 'INWARD' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-100'}`} />
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

              {/* Step 0: Type selection */}
              {step === 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => { setMovementType('INWARD'); setStep(1); }}
                    className="flex flex-col items-center gap-3 p-5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-100 transition-all group"
                  >
                    <div className="p-3 bg-emerald-100 rounded-xl group-hover:bg-emerald-200 transition-colors">
                      <ArrowUpCircle size={28} className="text-emerald-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-emerald-700 text-sm">Stock Inward</p>
                      <p className="text-[10px] text-emerald-500 mt-0.5">Add stock to warehouse</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setMovementType('OUTWARD'); setStep(1); }}
                    className="flex flex-col items-center gap-3 p-5 bg-rose-50 border-2 border-rose-200 rounded-2xl hover:border-rose-400 hover:bg-rose-100 transition-all group"
                  >
                    <div className="p-3 bg-rose-100 rounded-xl group-hover:bg-rose-200 transition-colors">
                      <ArrowDownCircle size={28} className="text-rose-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-rose-700 text-sm">Stock Outward</p>
                      <p className="text-[10px] text-rose-500 mt-0.5">Remove stock from warehouse</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Step 1: Article → Variant select */}
              {step === 1 && (
                <div className="space-y-3">
                  {/* Article picker */}
                  {!selectedArticleId ? (
                    <div>
                      <div className="relative mb-2">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search article..."
                          autoFocus
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={modalArticleSearch}
                          onChange={e => setModalArticleSearch(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {filteredModalArticles.map(a => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedArticleId(a.id)}
                            className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all text-left"
                          >
                            <img src={getImageUrl(a.imageUrl)} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{a.name}</p>
                              <p className="text-[10px] font-mono text-slate-400">{a.sku}</p>
                            </div>
                            <ChevronRight size={14} className="text-slate-300 shrink-0" />
                          </button>
                        ))}
                        {filteredModalArticles.length === 0 && (
                          <p className="text-center text-sm text-slate-400 py-6 italic">No articles found</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Selected article chip */}
                      <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-3">
                        <img src={getImageUrl(selectedArticle?.imageUrl)} alt="" className="w-8 h-8 rounded-lg object-cover border border-indigo-100" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-indigo-800 truncate">{selectedArticle?.name || "Selected Article"}</p>
                          <p className="text-[9px] font-mono text-indigo-400">{selectedArticle?.sku}</p>
                        </div>
                        <button onClick={() => { setSelectedArticleId(''); setSelectedVariantId(''); }} className="text-indigo-300 hover:text-indigo-600 p-1 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                      {/* Variant list */}
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Variant</p>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {(selectedArticle?.variants || []).map(v => {
                          const livePairs = Object.values(v.sizeMap || {}).reduce((s, c: any) => s + (c?.qty || 0), 0);
                          return (
                            <button
                              key={v.id}
                              onClick={() => { setSelectedVariantId(v.id); setStep(2); }}
                              className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl transition-all text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{v.itemName || `${v.color} · ${v.sizeRange}`}</p>
                                <p className="text-[9px] text-slate-400 font-mono">{formatAssortment(v.sizeQuantities)}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black text-emerald-600">{Math.floor(livePairs / 24)} Ctns</p>
                                <p className="text-[9px] text-slate-400">{livePairs} prs</p>
                              </div>
                              <ChevronRight size={14} className="text-slate-300 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Qty + Reason */}
              {step === 2 && selectedVariant && (
                <div className="space-y-4">
                  {/* Variant summary chip */}
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${movementType === 'INWARD' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{selectedVariant.itemName || selectedVariant.color}</p>
                      <p className="text-[9px] text-slate-500">{selectedArticle?.name} · {formatAssortment(selectedVariant.sizeQuantities)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">{Math.floor(variantLive / 24)} Ctns live</p>
                    </div>
                  </div>

                  {/* Carton count */}
                  {(() => {
                    const reqCtns = Number(cartons) || 0;
                    const availCtns = Math.floor(variantLive / 24);
                    const overStock = movementType === 'OUTWARD' && reqCtns > availCtns && reqCtns > 0;
                    return (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Cartons to {movementType === 'INWARD' ? 'Add' : 'Remove'}</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            autoFocus
                            placeholder="0"
                            className={`flex-1 p-3 bg-slate-50 border rounded-xl text-lg font-bold outline-none focus:ring-2 placeholder:text-slate-300 transition-colors ${overStock ? 'border-rose-400 bg-rose-50 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-indigo-500/20'}`}
                            value={cartons}
                            onChange={e => setCartons(e.target.value)}
                          />
                          <div className="text-right shrink-0">
                            <p className={`text-lg font-black ${overStock ? 'text-rose-500' : 'text-slate-400'}`}>{cartons ? Number(cartons) * 24 : 0}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Pairs</p>
                          </div>
                        </div>
                        {overStock ? (
                          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
                            <AlertTriangle size={13} className="text-rose-500 shrink-0" />
                            <p className="text-xs font-bold text-rose-600">Only {availCtns} carton{availCtns !== 1 ? 's' : ''} available ({variantLive} pairs)</p>
                          </div>
                        ) : (
                          <p className="text-[9px] text-slate-400 mt-1 font-medium">Available: {availCtns} Ctns · 1 Carton = 24 Pairs</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Reason</label>
                    <div className="flex flex-wrap gap-2">
                      {reasonOptions.map(r => (
                        <button
                          key={r}
                          onClick={() => setReason(r)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${reason === r
                            ? (movementType === 'INWARD' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600')
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Note <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      placeholder="Add details..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Confirmation */}
              {step === 3 && selectedVariant && (
                <div className="space-y-4">
                  <div className={`rounded-2xl border-2 p-5 ${movementType === 'INWARD' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      {movementType === 'INWARD'
                        ? <ArrowUpCircle size={28} className="text-emerald-600 shrink-0" />
                        : <ArrowDownCircle size={28} className="text-rose-600 shrink-0" />}
                      <div>
                        <p className={`text-sm font-black uppercase tracking-wider ${movementType === 'INWARD' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          Stock {movementType === 'INWARD' ? 'Inward' : 'Outward'}
                        </p>
                        <p className="text-xs text-slate-500">{selectedArticle?.name}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Variant</span>
                        <span className="font-bold text-slate-800">{selectedVariant.itemName || selectedVariant.color}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cartons</span>
                        <span className="font-bold text-slate-800">{cartons} Ctns</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Pairs</span>
                        <span className="font-bold text-slate-800">{Number(cartons) * 24} prs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Reason</span>
                        <span className="font-bold text-slate-800">{reason}</span>
                      </div>
                      {note && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Note</span>
                          <span className="font-bold text-slate-800 text-right max-w-[60%] truncate">{note}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200/60 pt-2 mt-2 flex justify-between">
                        <span className="text-slate-500">Current Live Stock</span>
                        <span className="font-bold text-slate-800">{Math.floor(variantLive / 24)} Ctns ({variantLive} prs)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">After Movement</span>
                        <span className={`font-black ${movementType === 'INWARD' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {Math.floor(Math.max(0, variantLive + (movementType === 'INWARD' ? 1 : -1) * Number(cartons) * 24) / 24)} Ctns
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Back
                </button>
              )}
              {step === 0 && (
                <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
              )}
              {step === 1 && selectedVariantId && (
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all"
                >
                  Next
                </button>
              )}
              {step === 2 && (
                <button
                  disabled={!cartons || Number(cartons) < 1 || !reason || (movementType === 'OUTWARD' && Number(cartons) > Math.floor(variantLive / 24))}
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Review
                </button>
              )}
              {step === 3 && (
                <button
                  disabled={submitting}
                  onClick={handleMovementSubmit}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    movementType === 'INWARD'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-100'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-sm shadow-rose-100'
                  } disabled:opacity-50`}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {submitting ? 'Saving...' : `Confirm ${movementType === 'INWARD' ? 'Inward' : 'Outward'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterInventory;
