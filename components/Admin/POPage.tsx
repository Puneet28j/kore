import React, { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Link2,
  FileText,
  Package,
  CheckCircle2,
  ArrowRight,
  X,
} from "lucide-react";
import { Article, AssortmentType } from "../../types";

type POItemForm = {
  articleName: string;
  gender: AssortmentType;

  // ✅ Assortment = only size range
  sizeRange: string; // e.g. "4-8"
  sizeBreakup: Record<string, number>; // { "4": 0, "5": 6, ... }

  color: string;
  soleColor: string;
  mrp: number;

  // transactional
  poNo: string;
  vendorCostPerPair: number;
  totalCartonsQty: number;
  barcodeNo: string;
};

type PORecord = {
  id: string;
  createdAt: string;
  mode: "AUTO_CATALOG" | "LINK_CATALOG";
  status: "DRAFT" | "SUBMITTED";
  linkedCatalogArticleId?: string;
  data: POItemForm;
};

interface POPageProps {
  articles: Article[];
  addArticle: (article: Article) => void;
  updateArticle: (article: Article) => void;
}

const POPage: React.FC<POPageProps> = ({
  articles,
  addArticle,
  updateArticle,
}) => {
  const [mode, setMode] = useState<"AUTO_CATALOG" | "LINK_CATALOG">(
    "AUTO_CATALOG",
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [linkedCatalogId, setLinkedCatalogId] = useState<string>("");

  const [pos, setPos] = useState<PORecord[]>([]);

  const [form, setForm] = useState<POItemForm>({
    articleName: "",
    gender: AssortmentType.MEN,

    sizeRange: "",
    sizeBreakup: {},

    color: "",
    soleColor: "",
    mrp: 0,

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
      articleName: "",
      gender: AssortmentType.MEN,

      sizeRange: "",
      sizeBreakup: {},

      color: "",
      soleColor: "",
      mrp: 0,

      poNo: "",
      vendorCostPerPair: 0,
      totalCartonsQty: 0,
      barcodeNo: "",
    });
    setLinkedCatalogId("");
    setMode("AUTO_CATALOG");
    setSearchTerm("");
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  const generateSku = (name: string, gender: string) => {
    const base = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 18);
    return `KK-${gender}-${base}-${Date.now().toString().slice(-4)}`;
  };

  // ✅ parse range like "4-8" -> ["4","5","6","7","8"]
  const parseSizeRange = (range: string) => {
    const cleaned = range.trim().replace(/\s/g, "");
    const m = cleaned.match(/^(\d+)-(\d+)$/);
    if (!m) return [];
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    if (end < start) return [];
    const out: string[] = [];
    for (let i = start; i <= end; i++) out.push(String(i));
    return out;
  };

  // ✅ when user types size range, auto-generate boxes
  const applySizeRange = (value: string) => {
    const sizes = parseSizeRange(value);

    setForm((prev) => {
      const nextBreakup: Record<string, number> = {};
      sizes.forEach((s) => {
        nextBreakup[s] = prev.sizeBreakup?.[s] ?? 0;
      });

      return {
        ...prev,
        sizeRange: value,
        sizeBreakup: nextBreakup,
      };
    });
  };

  // ✅ totals + validation (24 multiple)
  const totalPairs = useMemo(() => {
    return Object.values(form.sizeBreakup || {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
  }, [form.sizeBreakup]);

  const isValidMultiple = totalPairs === 0 || totalPairs % 24 === 0;
  const cartonsHint =
    totalPairs > 0 && totalPairs % 24 === 0 ? totalPairs / 24 : null;

  // ✅ Submit guard
  const canSubmitAutoCatalog =
    form.poNo.trim() &&
    form.totalCartonsQty > 0 &&
    form.barcodeNo.trim() &&
    form.articleName.trim() &&
    form.color.trim() &&
    form.soleColor.trim() &&
    form.mrp > 0 &&
    isValidMultiple;

  const canSubmitLinkCatalog =
    form.poNo.trim() &&
    form.totalCartonsQty > 0 &&
    form.barcodeNo.trim() &&
    !!linkedCatalogId;

  const canSubmit =
    mode === "AUTO_CATALOG" ? canSubmitAutoCatalog : canSubmitLinkCatalog;

  const createPO = (e: React.FormEvent) => {
    e.preventDefault();

    // minimal guards
    if (!form.poNo.trim()) return alert("PO No required");
    if (form.totalCartonsQty <= 0)
      return alert("Total cartons qty must be > 0");
    if (!form.barcodeNo.trim()) return alert("Barcode no required");

    let linkedId: string | undefined = undefined;

    if (mode === "AUTO_CATALOG") {
      if (!form.articleName.trim()) return alert("Article name required");
      if (!form.color.trim()) return alert("Color required");
      if (!form.soleColor.trim()) return alert("Sole color required");
      if (form.mrp <= 0) return alert("MRP must be > 0");
      if (!isValidMultiple) return alert("Total pairs must be 24, 48, 72...");

      const match = articles.find((a) => {
        return (
          a.name.trim().toLowerCase() ===
            form.articleName.trim().toLowerCase() &&
          a.category === form.gender &&
          (a as any).color?.toLowerCase?.() ===
            form.color.trim().toLowerCase() &&
          (a as any).soleColor?.toLowerCase?.() ===
            form.soleColor.trim().toLowerCase()
        );
      });

      if (match) {
        const updated: Article = {
          ...match,
          name: form.articleName.trim(),
          category: form.gender,
          pricePerPair: match.pricePerPair,
          imageUrl: match.imageUrl,
          // @ts-ignore
          color: form.color.trim(),
          // @ts-ignore
          soleColor: form.soleColor.trim(),
          // @ts-ignore
          mrp: form.mrp,
          // @ts-ignore
          sizeRange: form.sizeRange.trim(),
          // @ts-ignore
          sizeBreakup: form.sizeBreakup,
        };
        updateArticle(updated);
        linkedId = match.id;
      } else {
        const newArticle: Article = {
          id: `art-${Date.now()}`,
          name: form.articleName.trim(),
          sku: generateSku(form.articleName, form.gender),
          category: form.gender,
          pricePerPair: Math.max(0, Math.round(form.mrp * 0.55)),
          imageUrl: "",
          // @ts-ignore
          color: form.color.trim(),
          // @ts-ignore
          soleColor: form.soleColor.trim(),
          // @ts-ignore
          mrp: form.mrp,
          // @ts-ignore
          sizeRange: form.sizeRange.trim(),
          // @ts-ignore
          sizeBreakup: form.sizeBreakup,
        };
        addArticle(newArticle);
        linkedId = newArticle.id;
      }
    }

    if (mode === "LINK_CATALOG") {
      if (!linkedCatalogId)
        return alert("Please select a catalog article to link.");
      linkedId = linkedCatalogId;
    }

    const record: PORecord = {
      id: `PO-${Date.now().toString().slice(-6)}`,
      createdAt: new Date().toISOString(),
      mode,
      status: "SUBMITTED",
      linkedCatalogArticleId: linkedId,
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
              Catalog is <b>Master</b>, PO is <b>Transactional</b>
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
                  Mode
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
                const linked = po.linkedCatalogArticleId
                  ? articles.find((a) => a.id === po.linkedCatalogArticleId)
                  : undefined;

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
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          po.mode === "AUTO_CATALOG"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {po.mode === "AUTO_CATALOG"
                          ? "PO → Catalog"
                          : "Link Catalog"}
                      </span>
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
                        <span className="text-slate-400 italic">
                          Not linked
                        </span>
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
                    colSpan={5}
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

      {/* Create PO Modal (Responsive) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          {/* Center wrapper */}
          <div className="mx-auto h-full w-full max-w-4xl">
            {/* Card */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl h-full flex flex-col overflow-hidden">
              {/* Header sticky */}
              <div className="bg-indigo-600 p-4 sm:p-6 flex justify-between items-center text-white">
                <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Package size={20} />
                  Create Purchase Order
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Content scroll */}
              <div className="flex-1 overflow-y-auto">
                {/* Mode Switch */}
                <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50">
                  <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">
                        PO → Catalog Logic
                      </p>
                      <p className="text-sm text-slate-500">
                        <b>Catalog is Master</b> • <b>PO is Transactional</b>
                      </p>
                    </div>

                    {/* responsive switch */}
                    <div className="w-full lg:w-auto flex bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMode("AUTO_CATALOG")}
                        className={`flex-1 lg:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition ${
                          mode === "AUTO_CATALOG"
                            ? "bg-emerald-600 text-white"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        PO → Catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("LINK_CATALOG")}
                        className={`flex-1 lg:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold transition ${
                          mode === "LINK_CATALOG"
                            ? "bg-amber-600 text-white"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Link Catalog
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={createPO} className="p-4 sm:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    {/* Left */}
                    <div className="space-y-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Catalog Master Fields
                      </p>

                      {mode === "AUTO_CATALOG" ? (
                        <>
                          <Field label="Article Name" required>
                            <input
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                              value={form.articleName}
                              onChange={(e) => {
                                const value = e.target.value;

                                // First letter capital
                                const formatted =
                                  value.length > 0
                                    ? value.charAt(0).toUpperCase() +
                                      value.slice(1)
                                    : "";

                                setForm({ ...form, articleName: formatted });
                              }}
                              placeholder="e.g. Urban Runner"
                              required
                            />
                          </Field>

                          <Field label="Gender" required>
                            <select
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                              value={form.gender}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  gender: e.target.value as AssortmentType,
                                })
                              }
                            >
                              {Object.values(AssortmentType).map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Assortment (Size Range)">
                            <input
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                              value={form.sizeRange}
                              onChange={(e) => applySizeRange(e.target.value)}
                              placeholder="e.g. 4-8"
                            />
                          </Field>

                          {/* Boxes */}
                          <div className="mt-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                              Size-wise Pairs (Input)
                            </p>

                            <div
                              className={`p-3 border rounded-2xl transition ${
                                isValidMultiple
                                  ? "bg-slate-50 border-slate-200"
                                  : "bg-rose-50 border-rose-300"
                              }`}
                            >
                              <div className="flex flex-wrap gap-2">
                                {Object.keys(form.sizeBreakup || {}).length ===
                                0 ? (
                                  <div className="text-xs text-slate-400 italic">
                                    Type size range to generate boxes (e.g.
                                    4-8).
                                  </div>
                                ) : (
                                  Object.entries(form.sizeBreakup || {}).map(
                                    ([size, qty]) => (
                                      <div
                                        key={size}
                                        className="w-[64px] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                                      >
                                        <div className="text-center text-xs font-black text-slate-600 py-2">
                                          {size}
                                        </div>

                                        <div className="border-t border-slate-100 px-1 py-1">
                                          <input
                                            type="number"
                                            min={0}
                                            placeholder="0"
                                            className="w-full text-center text-sm font-bold text-indigo-600 bg-transparent outline-none placeholder:text-slate-300"
                                            value={
                                              (qty ?? 0) === 0
                                                ? ""
                                                : String(qty ?? 0)
                                            }
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              const val =
                                                raw === ""
                                                  ? 0
                                                  : Number(raw) || 0;

                                              setForm((prev) => ({
                                                ...prev,
                                                sizeBreakup: {
                                                  ...(prev.sizeBreakup || {}),
                                                  [size]: val,
                                                },
                                              }));
                                            }}
                                          />
                                        </div>
                                      </div>
                                    ),
                                  )
                                )}
                              </div>

                              {Object.keys(form.sizeBreakup || {}).length >
                                0 && (
                                <div className="mt-3 text-xs font-bold flex flex-wrap items-center gap-2">
                                  <span
                                    className={
                                      isValidMultiple
                                        ? "text-emerald-600"
                                        : "text-rose-600"
                                    }
                                  >
                                    Total Pairs: {totalPairs}
                                  </span>

                                  {cartonsHint !== null && (
                                    <span className="text-slate-500 font-semibold">
                                      • Cartons (auto): {cartonsHint}
                                    </span>
                                  )}

                                  {!isValidMultiple && totalPairs > 0 && (
                                    <span className="text-rose-600">
                                      (Must be 24, 48, 72...)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Color" required>
                              <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                                value={form.color}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const formatted = value.replace(
                                    /\b\w/g,
                                    (char) => char.toUpperCase(),
                                  );
                                  setForm({ ...form, color: formatted });
                                }}
                                placeholder="e.g. Black"
                                required
                              />
                            </Field>

                            <Field label="Sole Color" required>
                              <input
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                                value={form.soleColor}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const formatted = value.replace(
                                    /\b\w/g,
                                    (char) => char.toUpperCase(),
                                  );
                                  setForm({ ...form, soleColor: formatted });
                                }}
                                placeholder="e.g. White"
                                required
                              />
                            </Field>
                          </div>

                          <Field label="MRP (per pair)" required>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-indigo-600 placeholder:text-slate-300"
                              value={form.mrp === 0 ? "" : String(form.mrp)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const val = raw === "" ? 0 : Number(raw) || 0;
                                setForm({ ...form, mrp: val });
                              }}
                              required
                            />
                          </Field>
                        </>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-900">
                                Select Catalog
                              </p>
                            </div>

                            <div className="relative w-full sm:w-64">
                              <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                size={18}
                              />
                              <input
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                                placeholder="Search SKU / Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="mt-4 max-h-72 overflow-auto border border-slate-100 rounded-xl">
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
                                    <p className="font-semibold text-slate-900">
                                      {a.name}
                                    </p>
                                    <p className="text-xs text-slate-400 font-mono">
                                      {a.sku}
                                    </p>
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
                      )}
                    </div>

                    {/* Right */}
                    <div className="space-y-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        PO Transaction Fields
                      </p>

                      <Field label="PO No" required>
                        <input
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={form.poNo}
                          onChange={(e) =>
                            setForm({ ...form, poNo: e.target.value })
                          }
                          placeholder="e.g. PO-2026-001"
                          required
                        />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Vendor Cost / Pair" required>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-300"
                            value={
                              form.vendorCostPerPair === 0
                                ? ""
                                : String(form.vendorCostPerPair)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === "" ? 0 : Number(raw) || 0;
                              setForm({ ...form, vendorCostPerPair: val });
                            }}
                            required
                          />
                        </Field>

                        <Field label="Total Carton Qty" required>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-300"
                            value={
                              form.totalCartonsQty === 0
                                ? ""
                                : String(form.totalCartonsQty)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === "" ? 0 : Number(raw) || 0;
                              setForm({ ...form, totalCartonsQty: val });
                            }}
                            required
                          />

                          {cartonsHint !== null && (
                            <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              Suggested cartons from sizes: {cartonsHint}
                            </p>
                          )}
                        </Field>
                      </div>

                      <Field label="Barcode No (PO Barcode)" required>
                        <input
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                          value={form.barcodeNo}
                          onChange={(e) =>
                            setForm({ ...form, barcodeNo: e.target.value })
                          }
                          placeholder="e.g. POBC-000123"
                          required
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Footer sticky-ish */}
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

                  {!canSubmit && mode === "AUTO_CATALOG" && (
                    <p className="mt-3 text-xs text-slate-500">
                      Note: Submit enabled only when required fields are filled
                      and <b>Total Pairs</b> is <b>24 multiple</b>.
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
