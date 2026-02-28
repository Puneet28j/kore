
import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Package, 
  ArrowUpRight, 
  Sparkles
} from 'lucide-react';
import InteractiveIndiaMap from './InteractiveIndiaMap';
import { Order, Inventory, Article, OrderStatus } from '../../types';
import { getInventoryInsights } from '../../services/geminiService';

interface AdminDashboardProps {
  orders: Order[];
  inventory: Inventory[];
  articles: Article[];
}

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const AdminDashboard: React.FC<AdminDashboardProps> = ({ orders, inventory, articles }) => {
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      const res = await getInventoryInsights(inventory.map(i => ({
        sku: articles.find(a => a.id === i.articleId)?.sku,
        stock: i.actualStock,
        reserved: i.reservedStock
      })));
      setAiInsights(res);
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [inventory, articles]);

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalCartons = inventory.reduce((sum, i) => sum + i.actualStock, 0);
  
  const categoryData = articles.reduce((acc: any[], article) => {
    const catName = article.category.toString();
    const existing = acc.find(a => a.name === catName);
    const stock = inventory.find(i => i.articleId === article.id)?.actualStock || 0;
    if (existing) {
      existing.value += stock;
    } else {
      acc.push({ name: catName, value: stock });
    }
    return acc;
  }, []);

  const topDistributors = orders.reduce((acc: any[], o) => {
    const existing = acc.find(d => d.name === o.distributorName);
    if (existing) {
      existing.value += o.totalAmount;
    } else {
      acc.push({ name: o.distributorName, value: o.totalAmount });
    }
    return acc;
  }, []).sort((a, b) => b.value - a.value).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Total Revenue" value={`₹${totalRevenue.toLocaleString()}`} change="+12.5%" icon={<TrendingUp size={24} className="text-emerald-600" />} />
        <MetricCard title="Active Parties" value="5" change="+5" icon={<Users size={24} className="text-indigo-600" />} />
        <MetricCard title="Total Inventory" value={`${totalCartons} Cartons`} change="100% Filled" icon={<Package size={24} className="text-amber-600" />} />
        <MetricCard title="Orders Placed" value={orders.length} change="Live Status" icon={<ArrowUpRight size={24} className="text-red-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales by Category */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Package size={20} className="text-slate-400" />
            Stock Inventory by Segment
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-xl shadow-indigo-100 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="text-indigo-300" />
            <h3 className="font-bold text-lg">Gemini AI Insights</h3>
          </div>
          
          {loadingInsights ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4">
               <div className="w-8 h-8 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-sm">Analyzing inventory patterns...</p>
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/10">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold text-sm">{insight.insight}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                      insight.priority === 'High' ? 'bg-red-500 text-white' : 'bg-indigo-400 text-white'
                    }`}>
                      {insight.priority}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-100 italic">Action: {insight.action}</p>
                </div>
              ))}
              {aiInsights.length === 0 && <p className="text-sm text-indigo-200">System ready for analysis.</p>}
            </div>
          )}
          
          <button className="mt-6 w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 transition-colors rounded-lg font-medium text-sm">
            Generate Full Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Distributors */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Top Parties (by Revenue)</h3>
          <div className="space-y-4">
            {topDistributors.length === 0 ? (
               <p className="text-slate-400 text-sm italic">Waiting for initial bookings...</p>
            ) : (
              topDistributors.map((dist, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-sm">{dist.name}</span>
                      <span className="text-sm font-bold">₹{(dist.value / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full rounded-full" 
                        style={{ width: `${(dist.value / (topDistributors[0]?.value || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Interactive India Map */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
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

const MetricCard: React.FC<{ title: string; value: string | number; change: string; icon: React.ReactNode }> = ({ title, value, change, icon }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group hover:border-indigo-500 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">{icon}</div>
      <span className="text-[10px] font-bold px-2 py-1 rounded bg-indigo-50 text-indigo-600">
        {change}
      </span>
    </div>
    <p className="text-slate-500 text-sm font-medium">{title}</p>
    <p className="text-2xl font-bold mt-1 text-slate-900">{value}</p>
  </div>
);

export default AdminDashboard;
