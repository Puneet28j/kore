import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  TrendingUp, Users, Package, ArrowUpRight, ChevronLeft,
  Calendar, FileText, Building2, Star, Search, ArrowUpDown, ChevronDown, X,
} from 'lucide-react';
import InteractiveIndiaMap from './InteractiveIndiaMap';
import { Order, Inventory, Article, OrderStatus, PurchaseOrder } from '../../types';
import { poService } from '../../services/poService';
import { masterCatalogService } from '../../services/masterCatalogService';
import { distributorOrderService } from '../../services/distributorOrderService';
import { getImageUrl } from '../../utils/imageUtils';
import OverduePayments from '../shared/OverduePayments';

// ─── Types ─────────────────────────────────────────────────────────────────────
type DateFilter = 'all' | 'this_month' | 'last_month' | 'this_year' | 'custom';
type SortOption = 'top' | 'az' | 'za' | 'newest' | 'oldest';
type ShowMoreView = null | 'distributors' | 'products' | 'po';

interface AdminDashboardProps {
  orders: Order[];
  inventory: Inventory[];
  articles: Article[];
  updateStatus?: (id: string, status: OrderStatus) => void;
  loadingOrders?: boolean;
  lastUpdated?: Date;
  onSeeAllOverdue?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function filterByDate(orders: Order[], filter: DateFilter, customStart?: string, customEnd?: string): Order[] {
  if (filter === 'all') return orders;
  const now = new Date();
  if (filter === 'custom') {
    if (!customStart && !customEnd) return orders;
    const s = customStart ? new Date(customStart) : new Date(0);
    const e = customEnd   ? new Date(customEnd)   : new Date();
    e.setHours(23, 59, 59, 999);
    return orders.filter(o => { const d = new Date(o.date); return d >= s && d <= e; });
  }
  return orders.filter(o => {
    const d = new Date(o.date);
    if (filter === 'this_month')
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filter === 'last_month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    if (filter === 'this_year') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

interface DistEntry { id: string; name: string; totalAmount: number; orderCount: number; latestDate: string; }
interface ProductEntry { articleId: string; name: string; sku: string; imageUrl: string; totalPairs: number; totalAmount: number; latestDate: string; }
interface POEntry extends PurchaseOrder {}

function sortDistributors(list: DistEntry[], sort: SortOption): DistEntry[] {
  const s = [...list];
  if (sort === 'top')    s.sort((a, b) => b.totalAmount - a.totalAmount);
  else if (sort === 'az')   s.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'za')   s.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === 'newest') s.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  else if (sort === 'oldest') s.sort((a, b) => new Date(a.latestDate).getTime() - new Date(b.latestDate).getTime());
  return s;
}

function computeDistributors(orders: Order[]): DistEntry[] {
  const map: Record<string, DistEntry> = {};
  for (const o of orders) {
    const key = String(typeof o.distributorId === 'object' ? (o.distributorId as any).id : o.distributorId);
    const name = o.distributorName || 'Unknown';
    if (!map[key]) map[key] = { id: key, name, totalAmount: 0, orderCount: 0, latestDate: o.date };
    map[key].totalAmount += o.totalAmount;
    map[key].orderCount += 1;
    if (new Date(o.date) > new Date(map[key].latestDate)) map[key].latestDate = o.date;
  }
  return Object.values(map);
}

function sortProducts(list: ProductEntry[], sort: SortOption): ProductEntry[] {
  const s = [...list];
  if (sort === 'top')    s.sort((a, b) => b.totalAmount - a.totalAmount);
  else if (sort === 'az')   s.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'za')   s.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === 'newest') s.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  else if (sort === 'oldest') s.sort((a, b) => new Date(a.latestDate).getTime() - new Date(b.latestDate).getTime());
  return s;
}

function computeProducts(orders: Order[], articles: Article[]): ProductEntry[] {
  const map: Record<string, ProductEntry> = {};
  for (const o of orders) {
    for (const item of o.items) {
      const id = item.articleId;
      const art = articles.find(a => a.id === id);
      if (!map[id]) map[id] = { articleId: id, name: art?.name || 'Unknown', sku: art?.sku || '', imageUrl: art?.imageUrl || '', totalPairs: 0, totalAmount: 0, latestDate: o.date };
      map[id].totalPairs += item.pairCount;
      map[id].totalAmount += item.price;
      if (new Date(o.date) > new Date(map[id].latestDate)) map[id].latestDate = o.date;
    }
  }
  return Object.values(map);
}

function sortPOs(list: POEntry[], sort: SortOption): POEntry[] {
  const s = [...list];
  if (sort === 'top')    s.sort((a, b) => b.total - a.total);
  else if (sort === 'az')   s.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  else if (sort === 'za')   s.sort((a, b) => b.vendorName.localeCompare(a.vendorName));
  else if (sort === 'newest') s.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  else if (sort === 'oldest') s.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return s;
}

// ─── SortBar ─────────────────────────────────────────────────────────────────
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'top',    label: 'Top' },
  { value: 'az',     label: 'A→Z' },
  { value: 'za',     label: 'Z→A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const SortBar: React.FC<{ value: SortOption; onChange: (v: SortOption) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 flex-wrap">
    <ArrowUpDown size={13} className="text-slate-400 mr-0.5" />
    {SORT_OPTIONS.map(o => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
          value === o.value
            ? 'bg-indigo-600 text-white shadow'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ─── Date Filter Dropdown ────────────────────────────────────────────────────
const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all',        label: 'All Time' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year',  label: 'This Year' },
  { value: 'custom',     label: 'Custom Range' },
];

interface DateFilterBarProps {
  value: DateFilter;
  onChange: (v: DateFilter) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
}

const DateFilterBar: React.FC<DateFilterBarProps> = ({
  value, onChange, customStart, customEnd, onCustomStart, onCustomEnd,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = value === 'custom'
    ? (customStart || customEnd ? `${customStart || '…'} → ${customEnd || '…'}` : 'Custom Range')
    : DATE_OPTIONS.find(d => d.value === value)?.label || 'All Time';

  return (
    <div ref={ref} className="relative inline-block">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        <Calendar size={15} className="text-indigo-500 shrink-0" />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter:</span>
        <button
          onClick={() => setOpen(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all"
        >
          {label} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {value !== 'all' && (
          <button onClick={() => { onChange('all'); onCustomStart(''); onCustomEnd(''); }}
            className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 min-w-[220px] p-2 space-y-0.5">
          {DATE_OPTIONS.filter(o => o.value !== 'custom').map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                value === o.value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {o.label}
            </button>
          ))}
          <div className="border-t border-slate-100 pt-1 mt-1">
            <button
              onClick={() => onChange('custom')}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                value === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Custom Range
            </button>
            {value === 'custom' && (
              <div className="px-3 pb-2 pt-1 space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">From</label>
                  <input type="date" value={customStart} onChange={e => onCustomStart(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">To</label>
                  <input type="date" value={customEnd} onChange={e => onCustomEnd(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                </div>
                <button onClick={() => setOpen(false)}
                  className="w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all">
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Show More: Distributors ──────────────────────────────────────────────────
const ShowMoreDistributors: React.FC<{
  data: DistEntry[];
  onBack: () => void;
}> = ({ data, onBack }) => {
  const [sort, setSort] = useState<SortOption>('top');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? data.filter(d => d.name.toLowerCase().includes(q)) : data;
    return sortDistributors(filtered, sort);
  }, [data, sort, search]);

  const maxVal = list[0]?.totalAmount || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          <ChevronLeft size={18} /> Back
        </button>
        <h2 className="text-xl font-bold text-slate-900">All Distributors</h2>
        <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{list.length}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search distributors..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>
        <SortBar value={sort} onChange={setSort} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-50">
          {list.length === 0 ? (
            <p className="text-slate-400 text-sm italic p-6">No distributors found.</p>
          ) : list.map((d, idx) => (
            <div key={d.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/70 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-sm shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-900 truncate">{d.name}</span>
                  <span className="text-sm font-bold text-slate-800 ml-2 shrink-0">₹{d.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(d.totalAmount / maxVal) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{d.orderCount} orders</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Show More: Products ──────────────────────────────────────────────────────
const ShowMoreProducts: React.FC<{
  data: ProductEntry[];
  onBack: () => void;
}> = ({ data, onBack }) => {
  const [sort, setSort] = useState<SortOption>('top');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? data.filter(d => d.name.toLowerCase().includes(q) || d.sku.toLowerCase().includes(q)) : data;
    return sortProducts(filtered, sort);
  }, [data, sort, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          <ChevronLeft size={18} /> Back
        </button>
        <h2 className="text-xl font-bold text-slate-900">Top Products</h2>
        <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{list.length}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>
        <SortBar value={sort} onChange={setSort} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-50">
          {list.length === 0 ? (
            <p className="text-slate-400 text-sm italic p-6">No products found.</p>
          ) : list.map((p, idx) => (
            <div key={p.articleId} className="flex items-center gap-4 p-4 hover:bg-slate-50/70 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center font-bold text-amber-600 text-xs shrink-0">
                {idx + 1}
              </div>
              {p.imageUrl ? (
                <img src={getImageUrl(p.imageUrl)} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Package size={16} className="text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm text-slate-900 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{p.sku}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-bold text-slate-800">₹{p.totalAmount.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">{p.totalPairs.toLocaleString()} pairs</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Show More: POs ───────────────────────────────────────────────────────────
const ShowMorePOs: React.FC<{
  data: POEntry[];
  onBack: () => void;
}> = ({ data, onBack }) => {
  const [sort, setSort] = useState<SortOption>('newest');
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? data.filter(d => d.vendorName.toLowerCase().includes(q) || (d.poNumber || "").toLowerCase().includes(q)) : data;
    return sortPOs(filtered, sort);
  }, [data, sort, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          <ChevronLeft size={18} /> Back
        </button>
        <h2 className="text-xl font-bold text-slate-900">Pending Purchase Orders</h2>
        <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">{list.length}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor or PO #..."
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>
        <SortBar value={sort} onChange={setSort} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-50">
          {list.length === 0 ? (
            <p className="text-slate-400 text-sm italic p-6">No pending purchase orders.</p>
          ) : list.map((po) => (
            <div key={po.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/70 transition-colors">
              <div className="p-2 bg-amber-50 rounded-lg shrink-0">
                <FileText size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{po.poNumber || "Pending Approval"}</p>
                    <p className="text-[11px] text-slate-500">{po.vendorName}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-bold text-slate-800">₹{po.total?.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">{new Date(po.date).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase shrink-0">
                {po.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const AdminDashboard: React.FC<AdminDashboardProps> = ({
  orders,
  inventory,
  articles,
  updateStatus,
  loadingOrders,
  lastUpdated,
  onSeeAllOverdue,
}) => {
  const [dateFilter, setDateFilter]   = useState<DateFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [showMore, setShowMore] = useState<ShowMoreView>(null);

  const [distSort, setDistSort]       = useState<SortOption>('top');
  const [productSort, setProductSort] = useState<SortOption>('top');
  const [poSort, setPoSort]           = useState<SortOption>('newest');

  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [totalLivePairs, setTotalLivePairs] = useState(0);
  const [dashMetrics, setDashMetrics] = useState({
    totalRevenue: 0,
    ordersPlaced: 0,
    activeParties: 0,
  });

  // Map dashboard date filter → YYYY-MM-DD range for full-data metrics API
  const metricsDateRange = useMemo(() => {
    const now = new Date();
    const ymd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (dateFilter === 'all') return {};
    if (dateFilter === 'this_month') {
      return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: ymd(now) };
    }
    if (dateFilter === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: ymd(start), endDate: ymd(end) };
    }
    if (dateFilter === 'this_year') {
      return { startDate: ymd(new Date(now.getFullYear(), 0, 1)), endDate: ymd(now) };
    }
    if (dateFilter === 'custom') {
      const range: { startDate?: string; endDate?: string } = {};
      if (customStart) range.startDate = customStart;
      if (customEnd) range.endDate = customEnd;
      return range;
    }
    return {};
  }, [dateFilter, customStart, customEnd]);

  // Fetch POs for pending section
  const fetchPOs = () => {
    poService.listPOs({ limit: 500 }).then(res => {
      const list: PurchaseOrder[] = res.data ?? res ?? [];
      setPOs(list);
    }).catch(() => {});
  };

  // Company-wide live stock (not limited to the paginated articles prop)
  const fetchStockTotals = useCallback(async () => {
    try {
      const res = await masterCatalogService.getStockTotals();
      const data = res?.data || res || {};
      setTotalLivePairs(Number(data.totalLivePairs) || 0);
    } catch {
      /* keep last known */
    }
  }, []);

  const fetchDashMetrics = useCallback(async (range: { startDate?: string; endDate?: string }) => {
    try {
      const data = await distributorOrderService.getDashboardMetrics(range);
      setDashMetrics({
        totalRevenue: Number(data.totalRevenue) || 0,
        ordersPlaced: Number(data.ordersPlaced) || 0,
        activeParties: Number(data.activeParties) || 0,
      });
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => { fetchPOs(); fetchStockTotals(); }, [fetchStockTotals]);

  useEffect(() => {
    fetchDashMetrics(metricsDateRange);
  }, [metricsDateRange, fetchDashMetrics]);

  // Real-time: refresh PO list + live inventory + metrics on socket events
  useEffect(() => {
    const handler = () => {
      fetchPOs();
      fetchStockTotals();
      fetchDashMetrics(metricsDateRange);
    };
    window.addEventListener("poRefetch", handler);
    window.addEventListener("catalogRefetch", handler);
    window.addEventListener("grnRefetch", handler);
    window.addEventListener("billRefetch", handler);
    return () => {
      window.removeEventListener("poRefetch", handler);
      window.removeEventListener("catalogRefetch", handler);
      window.removeEventListener("grnRefetch", handler);
      window.removeEventListener("billRefetch", handler);
    };
  }, [fetchStockTotals, fetchDashMetrics, metricsDateRange]);

  // Filtered orders (lists/charts still use loaded page of orders)
  const filteredOrders = useMemo(() => filterByDate(orders, dateFilter, customStart, customEnd), [orders, dateFilter, customStart, customEnd]);

  const totalLiveCtns = Math.floor(totalLivePairs / 24);

  // Chart data — use live pairs from sizeMap per category
  const categoryData = useMemo(() => articles.reduce((acc: any[], article) => {
    const catName = article.category.toString();
    const existing = acc.find(a => a.name === catName);
    const livePairs = (article.variants || []).reduce((s, v) =>
      s + Object.values(v.sizeMap || {}).reduce((vs, c: any) => vs + Number(c?.qty || 0), 0), 0
    );
    const ctns = Math.floor(livePairs / 24);
    if (existing) existing.value += ctns;
    else acc.push({ name: catName, value: ctns });
    return acc;
  }, []), [articles]);

  // Distributors
  const allDistributors = useMemo(() => computeDistributors(filteredOrders), [filteredOrders]);
  const sortedDist = useMemo(() => sortDistributors(allDistributors, distSort), [allDistributors, distSort]);

  // Products
  const allProducts = useMemo(() => computeProducts(filteredOrders, articles), [filteredOrders, articles]);
  const sortedProducts = useMemo(() => sortProducts(allProducts, productSort), [allProducts, productSort]);

  // Pending POs
  const pendingPOs = useMemo(() => pos.filter(p => p.status === 'DRAFT'), [pos]);
  const sortedPOs  = useMemo(() => sortPOs(pendingPOs, poSort), [pendingPOs, poSort]);

  // ── Show More Views ──────────────────────────────────────────────────────────
  if (showMore === 'distributors') {
    return <ShowMoreDistributors data={allDistributors} onBack={() => setShowMore(null)} />;
  }
  if (showMore === 'products') {
    return <ShowMoreProducts data={allProducts} onBack={() => setShowMore(null)} />;
  }
  if (showMore === 'po') {
    return <ShowMorePOs data={pendingPOs} onBack={() => setShowMore(null)} />;
  }

  // ── Main View ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* Date Filter */}
      <DateFilterBar
        value={dateFilter} onChange={setDateFilter}
        customStart={customStart} customEnd={customEnd}
        onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Revenue"
          value={`₹${dashMetrics.totalRevenue.toLocaleString()}`}
          sub={dateFilter === 'all' ? 'All time' : dateFilter === 'custom' ? (customStart && customEnd ? `${customStart} → ${customEnd}` : 'Custom Range') : DATE_OPTIONS.find(d => d.value === dateFilter)?.label}
          icon={<TrendingUp size={24} className="text-emerald-600" />}
        />
        <MetricCard
          title="Active Parties"
          value={dashMetrics.activeParties}
          sub={`${dashMetrics.ordersPlaced} orders`}
          icon={<Users size={24} className="text-indigo-600" />}
        />
        <MetricCard
          title="Live Inventory"
          value={`${totalLiveCtns.toLocaleString()} Ctns`}
          sub={`${totalLivePairs.toLocaleString()} pairs`}
          icon={<Package size={24} className="text-amber-600" />}
        />
        <MetricCard
          title="Orders Placed"
          value={dashMetrics.ordersPlaced}
          sub="Live status"
          icon={<ArrowUpRight size={24} className="text-red-600" />}
        />
      </div>

      {/* Chart + Overdue — 50/50 side by side, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Stock Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
            <Package size={20} className="text-slate-400" />
            Stock Inventory by Segment
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={36}>
                  {categoryData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overdue Payments */}
        <OverduePayments
          isAdmin={true}
          onSeeAll={onSeeAllOverdue}
          showAll={false}
        />

      </div>

      {/* Top Distributors + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Top Distributors */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Building2 size={17} className="text-indigo-500" />
              Top Distributors
            </h3>
            <button onClick={() => setShowMore('distributors')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
              Show All ({allDistributors.length}) →
            </button>
          </div>
          <SortBar value={distSort} onChange={setDistSort} />
          <div className="space-y-3">
            {sortedDist.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No bookings yet.</p>
            ) : sortedDist.slice(0, 10).map((d, idx) => (
              <div key={d.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-sm truncate">{d.name}</span>
                    <span className="text-sm font-bold ml-2 shrink-0">₹{(d.totalAmount / 1000).toFixed(1)}k</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(d.totalAmount / (sortedDist[0]?.totalAmount || 1)) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{d.orderCount} orders</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Star size={17} className="text-amber-500" />
              Top Products
            </h3>
            <button onClick={() => setShowMore('products')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
              Show All ({allProducts.length}) →
            </button>
          </div>
          <SortBar value={productSort} onChange={setProductSort} />
          <div className="space-y-3">
            {sortedProducts.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No products ordered yet.</p>
            ) : sortedProducts.slice(0, 10).map((p, idx) => (
              <div key={p.articleId} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center font-bold text-amber-600 text-xs shrink-0">
                  {idx + 1}
                </div>
                {p.imageUrl ? (
                  <img src={getImageUrl(p.imageUrl)} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-slate-100 shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Package size={14} className="text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-sm font-bold ml-2 shrink-0">₹{(p.totalAmount / 1000).toFixed(1)}k</p>
                  </div>
                  <p className="text-[10px] text-slate-400">{p.totalPairs.toLocaleString()} pairs · {p.sku}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PO Pending + India Map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PO Pending */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-bold flex items-center gap-2">
              <FileText size={17} className="text-rose-500" />
              Pending Purchase Orders
              {pendingPOs.length > 0 && (
                <span className="text-xs bg-rose-100 text-rose-600 font-bold px-2 py-0.5 rounded-full">
                  {pendingPOs.length}
                </span>
              )}
            </h3>
            {pendingPOs.length > 10 && (
              <button onClick={() => setShowMore('po')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                Show All ({pendingPOs.length}) →
              </button>
            )}
          </div>
          <SortBar value={poSort} onChange={setPoSort} />
          <div className="space-y-2">
            {sortedPOs.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No pending purchase orders.</p>
            ) : sortedPOs.slice(0, 10).map(po => (
              <div key={po.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-indigo-50/40 transition-colors">
                <div className="p-1.5 bg-amber-100 rounded-lg shrink-0">
                  <FileText size={14} className="text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-sm text-slate-900">{po.poNumber || "Pending Approval"}</p>
                    <p className="text-sm font-bold ml-2 shrink-0">₹{po.total?.toLocaleString()}</p>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{po.vendorName} · {new Date(po.date).toLocaleDateString('en-IN')}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase shrink-0">
                  DRAFT
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* India Map */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="text-base font-bold mb-4 flex items-center justify-between">
            Kore India Distribution Network
            <span className="text-xs font-normal text-slate-400 bg-slate-50 px-2 py-1 rounded">All States & UTs</span>
          </h3>
          <div className="relative aspect-4/5 sm:aspect-square md:aspect-4/5 bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
            <InteractiveIndiaMap orders={orders} />
          </div>
        </div>
      </div>

    </div>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard: React.FC<{ title: string; value: string | number; sub?: string; icon: React.ReactNode }> = ({
  title, value, sub, icon,
}) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group hover:border-indigo-500 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">{icon}</div>
    </div>
    <p className="text-slate-500 text-sm font-medium">{title}</p>
    <p className="text-2xl font-bold mt-1 text-slate-900">{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

export default AdminDashboard;
