import React, { useState } from 'react';
import { User, UserRole } from '../../types';
import { 
  Users, 
  Plus, 
  Search, 
  ChevronRight, 
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  FileText,
  CreditCard,
  MapPin,
  Percent,
  Wallet
} from 'lucide-react';
import { MOCK_DISTRIBUTORS } from '../../constants';

interface DistributorManagerProps {
  orders: any[]; // Used just for the list
}

type ViewState = 'LIST' | 'CREATE' | 'DETAILS';

const DistributorManager: React.FC<DistributorManagerProps> = ({ orders }) => {
  // --- Draft Persistence ---
  const savedDraftStr = localStorage.getItem("kore_distributor_draft");
  const savedDraft = savedDraftStr ? JSON.parse(savedDraftStr) : null;

  const [view, setView] = useState<ViewState>(savedDraft?.view || 'LIST');
  const [distributors, setDistributors] = useState<User[]>(
    MOCK_DISTRIBUTORS.filter((d) => d.role === UserRole.DISTRIBUTOR)
  );
  
  const [selectedDistributor, setSelectedDistributor] = useState<User | null>(savedDraft?.selectedDistributor || null);
  
  // --- Create/Edit Form State ---
  const [editingId, setEditingId] = useState<string | null>(savedDraft?.editingId || null);
  const [isCustomPayment, setIsCustomPayment] = useState(savedDraft?.isCustomPayment || false);
  const [formData, setFormData] = useState<Partial<User>>(savedDraft?.formData || {
    name: '',
    email: '',
    phone: '',
    companyName: '',
    gstNumber: '',
    billingAddress: '',
    shippingAddress: '',
    paymentTerms: '30 days',
    discountPercentage: 0,
    creditLimit: 0,
  });

  React.useEffect(() => {
    if (view !== 'LIST') {
      localStorage.setItem("kore_distributor_draft", JSON.stringify({
        view, selectedDistributor, editingId, isCustomPayment, formData
      }));
    } else {
      localStorage.removeItem("kore_distributor_draft");
    }
  }, [view, selectedDistributor, editingId, isCustomPayment, formData]);

  const handleCreateDistributor = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      setDistributors(prev => prev.map(d => 
        d.id === editingId ? {
          ...d,
          name: formData.name || '',
          email: formData.email || '',
          phone: formData.phone || '',
          companyName: formData.companyName || '',
          gstNumber: formData.gstNumber || '',
          billingAddress: formData.billingAddress || '',
          shippingAddress: formData.shippingAddress || '',
          paymentTerms: formData.paymentTerms || '30 days',
          discountPercentage: Number(formData.discountPercentage) || 0,
          creditLimit: Number(formData.creditLimit) || 0,
          location: formData.billingAddress?.split(',')[0] || d.location,
        } : d
      ));
    } else {
      const newDistributor: User = {
        id: `dist-${Date.now().toString().slice(-6)}`,
        role: UserRole.DISTRIBUTOR,
        isActive: true,
        name: formData.name || '',
        email: formData.email || '',
        phone: formData.phone || '',
        companyName: formData.companyName || '',
        gstNumber: formData.gstNumber || '',
        billingAddress: formData.billingAddress || '',
        shippingAddress: formData.shippingAddress || '',
        paymentTerms: formData.paymentTerms || '30 days',
        discountPercentage: Number(formData.discountPercentage) || 0,
        creditLimit: Number(formData.creditLimit) || 0,
        location: formData.billingAddress?.split(',')[0] || 'Unknown', // Quick mock location
      };
      
      setDistributors([newDistributor, ...distributors]);
    }
    
    setView('LIST');
    
    // Reset form
    setEditingId(null);
    setIsCustomPayment(false);
    setFormData({
      name: '', email: '', phone: '', companyName: '', gstNumber: '',
      billingAddress: '', shippingAddress: '', paymentTerms: '30 days',
      discountPercentage: 0, creditLimit: 0
    });
    localStorage.removeItem("kore_distributor_draft");
  };

  const handleRowClick = (dist: User) => {
    setSelectedDistributor(dist);
    setView('DETAILS');
  };

  if (view === 'CREATE') {
    return (
      <div className="space-y-6 max-w-full mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setView('LIST');
              setEditingId(null);
              setIsCustomPayment(false);
              setFormData({
                name: '', email: '', phone: '', companyName: '', gstNumber: '',
                billingAddress: '', shippingAddress: '', paymentTerms: '30 days',
                discountPercentage: 0, creditLimit: 0
              });
              localStorage.removeItem("kore_distributor_draft");
            }}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Edit Distributor' : 'Create Distributor'}</h2>
            <p className="text-sm text-slate-500">{editingId ? 'Update existing partner details' : 'Add a new partner to your distribution network'}</p>
          </div>
        </div>

        <form onSubmit={handleCreateDistributor} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8 space-y-8">
            {/* Base Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Contact Person Name" icon={<Users size={14} />}>
                  <input type="text" required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </Field>
                <Field label="Company Name" icon={<Building2 size={14} />}>
                  <input type="text" required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})}
                  />
                </Field>
                <Field label="Email Address" icon={<Mail size={14} />}>
                  <input type="email" required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </Field>
                <Field label="Phone Number" icon={<Phone size={14} />}>
                  <input type="tel" required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </Field>
                <Field label="GST Number" icon={<FileText size={14} />}>
                  <input type="text" required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none uppercase"
                    value={formData.gstNumber} onChange={e => setFormData({...formData, gstNumber: e.target.value.toUpperCase()})}
                  />
                </Field>
              </div>
            </div>

            {/* Address Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Billing Address" icon={<MapPin size={14} />}>
                  <textarea required rows={3}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={formData.billingAddress} onChange={e => setFormData({...formData, billingAddress: e.target.value})}
                  />
                </Field>
                <Field label="Shipping Address" icon={<MapPin size={14} />}>
                  <textarea required rows={3}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={formData.shippingAddress} onChange={e => setFormData({...formData, shippingAddress: e.target.value})}
                  />
                </Field>
              </div>
            </div>

            {/* Financial Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">Financial Setup</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Field label="Payment Terms" icon={<CreditCard size={14} />}>
                  <div className="flex gap-2">
                    <select 
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={isCustomPayment ? 'Custom' : formData.paymentTerms} 
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'Custom') {
                          setIsCustomPayment(true);
                          setFormData({...formData, paymentTerms: ''}); // clear for custom input
                        } else {
                          setIsCustomPayment(false);
                          setFormData({...formData, paymentTerms: val});
                        }
                      }}
                    >
                      <option value="30 days">30 Days</option>
                      <option value="45 days">45 Days</option>
                      <option value="90 days">90 Days</option>
                      <option value="Custom">Custom</option>
                    </select>
                    {isCustomPayment && (
                      <input 
                        type="text"
                        placeholder="e.g. 60 days net"
                        required
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        value={formData.paymentTerms} 
                        onChange={e => setFormData({...formData, paymentTerms: e.target.value})}
                      />
                    )}
                  </div>
                </Field>
                <Field label="Discount % (Optional)" icon={<Percent size={14} />}>
                  <input type="number" min="0" max="100"
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.discountPercentage || ''} onChange={e => setFormData({...formData, discountPercentage: Number(e.target.value)})}
                  />
                </Field>
                <Field label="Credit Limit (Optional)" icon={<Wallet size={14} />}>
                  <input type="number" min="0" step="1000"
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.creditLimit || ''} onChange={e => setFormData({...formData, creditLimit: Number(e.target.value)})}
                  />
                </Field>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
            <button type="button" onClick={() => {
                setView('LIST');
                setEditingId(null);
                setIsCustomPayment(false);
                setFormData({
                  name: '', email: '', phone: '', companyName: '', gstNumber: '',
                  billingAddress: '', shippingAddress: '', paymentTerms: '30 days',
                  discountPercentage: 0, creditLimit: 0
                });
                localStorage.removeItem("kore_distributor_draft");
            }} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200">
              {editingId ? 'Update Distributor' : 'Save Distributor'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'DETAILS' && selectedDistributor) {
    const d = selectedDistributor;
    return (
      <div className="space-y-6 max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { 
                setView('LIST'); 
                setSelectedDistributor(null); 
                localStorage.removeItem("kore_distributor_draft");
              }}
              className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">{d.companyName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[10px] font-black uppercase tracking-wider">
                  Active Partner
                </span>
                <span className="text-xs text-slate-500 font-mono">{d.id}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => {
              setEditingId(d.id);
              
              const isCustom = !['30 days', '45 days', '90 days'].includes(d.paymentTerms || '30 days');
              setIsCustomPayment(isCustom);
              
              setFormData({
                name: d.name,
                email: d.email,
                phone: d.phone,
                companyName: d.companyName,
                gstNumber: d.gstNumber,
                billingAddress: d.billingAddress,
                shippingAddress: d.shippingAddress,
                paymentTerms: d.paymentTerms,
                discountPercentage: d.discountPercentage,
                creditLimit: d.creditLimit
              });
              setView('CREATE');
            }} className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm">
              Edit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Quick Contact */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Contact Info</h3>
              
              <div className="space-y-4">
                <InfoRow icon={<Users size={16} />} label="Contact Person" value={d.name} />
                <InfoRow icon={<Mail size={16} />} label="Email" value={d.email} />
                <InfoRow icon={<Phone size={16} />} label="Phone" value={d.phone || '—'} />
                <InfoRow icon={<FileText size={16} />} label="GSTIN" value={d.gstNumber || '—'} mono />
              </div>
            </div>

            {/* Important Financial Settings block placed at the bottom-left specifically */}
            <div className="bg-indigo-600 text-white rounded-2xl shadow-md p-6 relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-200 mb-6">Financial Terms</h3>
                
                <div className="space-y-5">
                  <div>
                    <p className="text-indigo-200 text-xs font-medium mb-1 flex items-center gap-1.5"><CreditCard size={14} /> Payment Terms</p>
                    <p className="text-lg font-bold">{d.paymentTerms || '30 days'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-500/50">
                    <div>
                      <p className="text-indigo-200 text-xs font-medium mb-1">Discount Config</p>
                      <p className="text-2xl font-black text-amber-300">{d.discountPercentage || 0}%</p>
                    </div>
                    <div>
                      <p className="text-indigo-200 text-xs font-medium mb-1">Credit Limit</p>
                      <p className="text-xl font-bold">₹{(d.creditLimit || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-8 -right-8 opacity-10 blur-[1px]">
                <Wallet size={120} />
              </div>
            </div>
          </div>

          {/* Right Column: Addresses & Stats */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Addresses</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <MapPin size={14} className="text-indigo-500" /> Billing Address
                  </h4>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{d.billingAddress || 'No billing address provided.'}</p>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <MapPin size={14} className="text-emerald-500" /> Shipping Address
                  </h4>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{d.shippingAddress || 'No shipping address provided.'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Activity Overview</h3>
              <div className="py-12 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileText className="text-slate-300 mb-2" size={32} />
                <p className="text-sm text-slate-500 font-medium">No order history available for this distributor yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // default: LIST VIEW
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search distributors..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
          />
        </div>
        
        <button 
          onClick={() => setView('CREATE')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition shadow-sm"
        >
          <Plus size={18} />
          Create Distributor
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Company & Contact</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Location</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Terms</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Total Orders</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {distributors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No distributors found. Click "Create Distributor" to add one.
                  </td>
                </tr>
              ) : (
                distributors.map((dist) => {
                  const hasOrders = orders.filter((o) => o.distributorId === dist.id).length;
                  
                  return (
                    <tr 
                      key={dist.id} 
                      onClick={() => handleRowClick(dist)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{dist.companyName || dist.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{dist.name} • {dist.phone || dist.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-700 font-medium">{dist.location || 'N/A'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider border border-slate-200">
                          {dist.paymentTerms || '30 DAYS'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${hasOrders > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
                          <span className={`font-bold ${hasOrders > 0 ? "text-slate-900" : "text-slate-400"}`}>
                            {hasOrders} 
                          </span>
                          <span className="text-xs text-slate-500">Orders</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DistributorManager;

// --- Sub-components ---
const Field: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">
      {icon && <span className="text-slate-400">{icon}</span>}
      {label}
    </label>
    {children}
  </div>
);

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex gap-3">
    <div className="mt-0.5 text-slate-400">{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm text-slate-800 font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  </div>
);
