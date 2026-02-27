import React, { useMemo, useState } from "react";
import { Plus, Search, Link2, FileText, Package, CheckCircle2, ArrowRight, X } from "lucide-react";
import { Article } from "../../types";

type POItemForm = {
  poNo: string;
  vendorCostPerPair: number;
  totalCartonsQty: number;
  barcodeNo: string;
};

type PORecord = {
  id: string;
  createdAt: string;
  status: "SUBMITTED";
  linkedCatalogArticleId: string;
  data: POItemForm;
};

interface POPageProps {
  articles: Article[];
}

const POPage: React.FC<POPageProps> = ({ articles }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [linkedCatalogId, setLinkedCatalogId] = useState<string>("");

  const [pos, setPos] = useState<PORecord[]>([]);

  const [form, setForm] = useState<POItemForm>({
    poNo: "",
    vendorCostPerPair: 0,
    totalCartonsQty: 0,
    barcodeNo: "",
  });

  const filteredCatalog = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.sku.toLowerCase().includes(q),
    );
  }, [articles, searchTerm]);

  const resetForm = () => {
    setForm({
      poNo: "",
      vendorCostPerPair: 0,
      totalCartonsQty: 0,
      barcodeNo: "",
    });
    setLinkedCatalogId("");
    setSearchTerm("");
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  const canSubmit =
    !!linkedCatalogId &&
    form.poNo.trim() &&
    form.totalCartonsQty > 0 &&
    form.barcodeNo.trim() &&
    form.vendorCostPerPair > 0;

  const createPO = (e: React.FormEvent) => {
    e.preventDefault();

    if (!linkedCatalogId) return alert("Please select a catalog article to link.");
    if (!form.poNo.trim()) return alert("PO No required");
    if (form.vendorCostPerPair <= 0) return alert("Vendor cost / pair must be > 0");
    if (form.totalCartonsQty <= 0) return alert("Total cartons qty must be > 0");
    if (!form.barcodeNo.trim()) return alert("Barcode no required");

    const record: PORecord = {
      id: `PO-${Date.now().toString().slice(-6)}`,
      createdAt: new Date().toISOString(),
      status: "SUBMITTED",
      linkedCatalogArticleId: linkedCatalogId,
      data: { ...form },
    };

    setPos((p) => [record, ...p]);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl">
            <FileText className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Purchase Orders (PO)
            </h3>
            <p className="text-sm text-slate-500">
              PO always generated <b>against Catalog</b>
            </p>
          </div>
        </div>

        <button
          onClick={openModal}
          className="w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus size={18} />
          Create PO
        </button>
      </div>

      {/* PO List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <p className="font-bold text-slate-900">Recent POs</p>
          <p className="text-xs text-slate-500">{pos.length} total</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  PO
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Cartons
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Catalog Link
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pos.map((po) => {
                const linked = articles.find((a) => a.id === po.linkedCatalogArticleId);

                return (
                  <tr
                    key={po.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{po.data.poNo}</p>
                      <p className="text-[10px] text-slate-400 font-mono tracking-widest">
                        {po.id}
                      </p>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700 font-bold">
                      {po.data.totalCartonsQty}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700">
                      {linked ? (
                        <div className="flex items-center gap-2">
                          <Link2 size={16} className="text-indigo-600" />
                          <span className="font-semibold">{linked.name}</span>
                          <span className="text-xs text-slate-400 font-mono">
                            {linked.sku}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Catalog not found</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 size={14} />
                        {po.status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {pos.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-slate-400 italic"
                  >
                    No POs created yet. Click <b>Create PO</b> to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="mx-auto h-full w-full max-w-4xl">
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl h-full flex flex-col overflow-hidden">
              <div className="bg-indigo-600 p-4 sm:p-6 flex justify-between items-center text-white">
                <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Package size={20} />
                  Create Purchase Order (Against Catalog)
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Catalog Select */}
                <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">Select Catalog</p>
                      <p className="text-sm text-slate-500">
                        PO will be linked to a catalog item only.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Search SKU / Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 max-h-72 overflow-auto border border-slate-100 rounded-xl bg-white">
                    {filteredCatalog.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setLinkedCatalogId(a.id)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition ${
                          linkedCatalogId === a.id ? "bg-indigo-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{a.name}</p>
                            <p className="text-xs text-slate-400 font-mono">{a.sku}</p>
                          </div>
                          {linkedCatalogId === a.id && (
                            <span className="text-xs font-bold text-indigo-600 inline-flex items-center gap-1">
                              Selected <ArrowRight size={14} />
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredCatalog.length === 0 && (
                      <div className="px-4 py-10 text-center text-slate-400 italic">
                        No catalog items found.
                      </div>
                    )}
                  </div>
                </div>

                {/* PO Form */}
                <form onSubmit={createPO} className="p-4 sm:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    <div className="space-y-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        PO Transaction Fields
                      </p>

                      <Field label="PO No" required>
                        <input
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={form.poNo}
                          onChange={(e) => setForm({ ...form, poNo: e.target.value })}
                          placeholder="e.g. PO-2026-001"
                          required
                        />
                      </Field>

                      <Field label="Vendor Cost / Pair" required>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-300"
                          value={form.vendorCostPerPair === 0 ? "" : String(form.vendorCostPerPair)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const val = raw === "" ? 0 : Number(raw) || 0;
                            setForm({ ...form, vendorCostPerPair: val });
                          }}
                          required
                        />
                      </Field>
                    </div>

                    <div className="space-y-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Packing & Barcode
                      </p>

                      <Field label="Total Carton Qty" required>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-300"
                          value={form.totalCartonsQty === 0 ? "" : String(form.totalCartonsQty)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const val = raw === "" ? 0 : Number(raw) || 0;
                            setForm({ ...form, totalCartonsQty: val });
                          }}
                          required
                        />
                      </Field>

                      <Field label="Barcode No (PO Barcode)" required>
                        <input
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                          value={form.barcodeNo}
                          onChange={(e) => setForm({ ...form, barcodeNo: e.target.value })}
                          placeholder="e.g. POBC-000123"
                          required
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="w-full sm:flex-1 px-6 py-3 sm:py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={`w-full sm:flex-[2] py-3 sm:py-4 rounded-2xl font-bold transition-all shadow-xl ${
                        canSubmit
                          ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100"
                          : "bg-slate-200 text-slate-500 cursor-not-allowed shadow-transparent"
                      }`}
                    >
                      Submit PO
                    </button>
                  </div>

                  {!canSubmit && (
                    <p className="mt-3 text-xs text-slate-500">
                      Note: Submit enabled only when <b>Catalog selected</b> and
                      required fields are filled.
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POPage;

/* ---------- Small helper UI component ---------- */
const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
      {label} {required ? <span className="text-rose-500">*</span> : null}
    </label>
    {children}
  </div>
);