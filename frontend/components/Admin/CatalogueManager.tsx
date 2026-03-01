// src/pages/Admin/CatalogueManager.tsx
import React, { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Image as ImageIcon,
  Tag,
  ShoppingBag,
  Layers,
  CheckCircle2,
  Heart,
  ArrowRightLeft,
  CalendarDays,
  Package,
} from "lucide-react";
import { Article, AssortmentType } from "../../types";

type CatalogStatus = "AVAILABLE" | "WISHLIST";

type CatalogueForm = {
  name: string;
  category: AssortmentType; // gender
  mrp: number;

  sizeRange: string; // "4-8"
  sizeBreakup: Record<string, number>; // { "4": 0, "5": 6, ... }

  images: File[]; // files
  catalogStatus: CatalogStatus; // AVAILABLE / WISH

  // ✅ only required when catalogStatus === "WISHLIST"
  expectedAvailableDate: string; // "YYYY-MM-DD"
};

interface CatalogueManagerProps {
  articles: Article[];
  addArticle: (article: Article) => void;
  updateArticle: (article: Article) => void;
  deleteArticle: (id: string) => void;
  onEditArticle: (id: string) => void;
}

const CatalogueManager: React.FC<CatalogueManagerProps> = ({
  articles,
  addArticle,
  updateArticle,
  deleteArticle,
  onEditArticle,
}) => {
  const [activeTab, setActiveTab] = useState<CatalogStatus>("AVAILABLE");
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  
  // New state for Catalogue Details overlay
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<any | null>(null);

  // preview urls for selected files / saved urls
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [formData, setFormData] = useState<CatalogueForm>({
    name: "",
    category: AssortmentType.MEN,
    mrp: 0,
    sizeRange: "",
    sizeBreakup: {},
    images: [],
    catalogStatus: "WISHLIST",
    expectedAvailableDate: "",
  });

  // ---------- Helpers ----------
  const capFirst = (v: string) => {
    const s = (v || "").trimStart();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

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

  const applySizeRange = (value: string) => {
    const sizes = parseSizeRange(value);
    setFormData((prev) => {
      const nextBreakup: Record<string, number> = {};
      sizes.forEach((s) => {
        nextBreakup[s] = prev.sizeBreakup?.[s] ?? 0;
      });
      return { ...prev, sizeRange: value, sizeBreakup: nextBreakup };
    });
  };

  const totalPairs = useMemo(() => {
    return Object.values(formData.sizeBreakup || {}).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
  }, [formData.sizeBreakup]);

  const isValidMultiple = totalPairs === 0 || totalPairs % 24 === 0;

  // ---------- Image ----------
  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;

    const previewUrls = fileArray.map((file) => URL.createObjectURL(file));

    setFormData((prev) => ({
      ...prev,
      images: [...(prev.images || []), ...fileArray],
    }));

    setImagePreviews((prev) => [...prev, ...previewUrls]);
  };

  const removeImageByIndex = (index: number) => {
    setFormData((prev) => {
      const updated = [...(prev.images || [])];
      updated.splice(index, 1);
      return { ...prev, images: updated };
    });

    setImagePreviews((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed && removed.startsWith("blob:")) URL.revokeObjectURL(removed);
      return updated;
    });
  };

  // ✅ Only allow move: WISH -> AVAILABLE
  const moveWishToAvailable = (article: Article) => {
    const status = (((article as any).catalogStatus as CatalogStatus) || "AVAILABLE") as CatalogStatus;
    if (status !== "WISHLIST") return;

    const updated: Article = {
      ...article,
      // @ts-ignore
      catalogStatus: "AVAILABLE",
      // @ts-ignore (once in catalog, date not needed)
      expectedAvailableDate: "",
    };
    updateArticle(updated);
  };

  // ---------- Data Views ----------
  const catalogItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const result: any[] = [];

    articles
      .filter((a) => {
        const status = (a.status || "AVAILABLE") as CatalogStatus;
        return status === activeTab;
      })
      .forEach((a) => {
        if (a.variants && a.variants.length > 0) {
          a.variants.forEach((v) => {
            const sizes = Object.keys(v.sizeSkus || {});
            if (sizes.length > 0) {
              sizes.forEach((s) => {
                const sku = v.sizeSkus[s] || a.sku;
                const baseName = v.itemName || `${a.name} - ${v.color}`;
                const fullName = `${baseName} - Size ${s}`;
                
                if (q && !fullName.toLowerCase().includes(q) && !sku.toLowerCase().includes(q)) return;
                
                result.push({
                  id: `${a.id}-${v.id}-${s}`,
                  article: a,
                  variant: v,
                  name: fullName,
                  sku: sku,
                  color: v.color,
                  size: s,
                  mrp: v.mrp || v.sellingPrice || a.pricePerPair || 0,
                  pairs: (v.sizeQuantities && v.sizeQuantities[s]) || 0,
                  image: a.imageUrl || "",
                });
              });
            } else {
              const sku = v.sku || a.sku;
              const name = v.itemName || `${a.name} - ${v.color}`;
              
              if (q && !name.toLowerCase().includes(q) && !sku.toLowerCase().includes(q)) return;
              
              result.push({
                id: `${a.id}-${v.id}`,
                article: a,
                variant: v,
                name: name,
                sku: sku,
                color: v.color,
                size: "—",
                mrp: v.mrp || v.sellingPrice || a.pricePerPair || 0,
                pairs: 0,
                image: a.imageUrl || "",
              });
            }
          });
        } else {
          if (q && !(a.name || "").toLowerCase().includes(q) && !(a.sku || "").toLowerCase().includes(q)) return;
          
          let pairs = 0;
          if ((a as any).sizeBreakup) {
             const breakups = Object.values((a as any).sizeBreakup);
             pairs = breakups.reduce((sum: number, val: any) => sum + (Number(val) || 0), 0) as number;
          }
          
          result.push({
            id: a.id,
            article: a,
            variant: null,
            name: a.name,
            sku: a.sku,
            color: "",
            size: a.selectedSizes?.join(", ") || "—",
            mrp: Number((a as any).mrp || a.pricePerPair || 0),
            pairs: pairs,
            image: a.imageUrl || "",
          });
        }
      });
      return result;
  }, [articles, activeTab, searchTerm]);

  // ---------- Modal ----------
  const openModal = (article?: Article) => {
    // cleanup old blob previews
    setImagePreviews((prev) => {
      prev.forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
      return [];
    });

    if (article) {
      setEditingArticle(article);

      const status: CatalogStatus =
        ((article as any).catalogStatus as CatalogStatus) || "AVAILABLE";

      setFormData({
        name: article.name || "",
        category: article.category,
        mrp: Number((article as any).mrp || 0),
        sizeRange: String((article as any).sizeRange || ""),
        sizeBreakup: (article as any).sizeBreakup || {},
        images: [],
        catalogStatus: status,
        expectedAvailableDate: String((article as any).expectedAvailableDate || ""),
      });

      const savedUrls: string[] = (article as any).images || [];
      if (savedUrls.length) setImagePreviews(savedUrls);
    } else {
      setEditingArticle(null);
      setFormData({
        name: "",
        category: AssortmentType.MEN,
        mrp: 0,
        sizeRange: "",
        sizeBreakup: {},
        images: [],
        // ✅ default WISH, and user will select before submit
        catalogStatus: "WISHLIST",
        expectedAvailableDate: "",
      });
    }

    // if editing from Details view, close details view first.
    setSelectedDetailsItem(null);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // ✅ Manual catalogue submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return alert("Article name required");
    if (formData.mrp <= 0) return alert("MRP must be > 0");

    if (Object.keys(formData.sizeBreakup || {}).length > 0 && !isValidMultiple) {
      return alert("Total pairs must be 24, 48, 72... (multiple of 24)");
    }

    // ✅ if WISH → expected date required
    if (formData.catalogStatus === "WISHLIST" && !formData.expectedAvailableDate) {
      return alert("Expected available date is required for Wish List items.");
    }

    // ✅ store preview urls for now (later replace by backend URLs)
    const storedImages: string[] = imagePreviews;

    const payload: Article = {
      id: editingArticle ? editingArticle.id : `art-${Date.now()}`,
      sku: editingArticle?.sku || `CAT-${Date.now().toString().slice(-6)}`,
      name: capFirst(formData.name.trim()),
      category: formData.category,
      pricePerPair: editingArticle?.pricePerPair ?? 0,
      imageUrl: editingArticle?.imageUrl ?? "",
      // @ts-ignore
      mrp: Number(formData.mrp || 0),
      // @ts-ignore
      sizeRange: String(formData.sizeRange || "").trim(),
      // @ts-ignore
      sizeBreakup: formData.sizeBreakup || {},
      // @ts-ignore
      images: storedImages,
      // @ts-ignore
      catalogStatus: formData.catalogStatus,
      // @ts-ignore
      expectedAvailableDate:
        formData.catalogStatus === "WISHLIST" ? formData.expectedAvailableDate : "",
    };

    if (editingArticle) updateArticle(payload);
    else addArticle(payload);

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl">
            <Layers className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Catalogue</h3>
            <p className="text-sm text-slate-500">
              Master Catalogue • 2 Tabs: <b>Available</b> + <b>Wish</b>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search SKU or Name..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={() => openModal()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus size={18} />
            New Catalog
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm flex gap-2">
        <button
          onClick={() => setActiveTab("AVAILABLE")}
          className={`flex-1 px-4 py-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
            activeTab === "AVAILABLE"
              ? "bg-emerald-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <CheckCircle2 size={16} />
          Available Catalogue
        </button>
        <button
          onClick={() => setActiveTab("WISHLIST")}
          className={`flex-1 px-4 py-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
            activeTab === "WISHLIST"
              ? "bg-rose-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Heart size={16} />
          Wish List
        </button>
      </div>

      {/* Table (desktop) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[950px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Article
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Gender
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  MRP
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Assortment
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pairs
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Expected Date
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {catalogItems.map((item) => {
                const a = item.article;
                const status: CatalogStatus =
                  ((a as any).catalogStatus as CatalogStatus) || "AVAILABLE";

                const mrp = Number(item.mrp || 0);
                const pairs = item.pairs || 0;
                const expectedDate = String((a as any).expectedAvailableDate || "");
                const cover = item.image || "https://picsum.photos/seed/kore/200/200";

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedDetailsItem(item)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={cover ? (cover.startsWith('http') ? cover : `http://localhost:5005${cover}`) : "https://picsum.photos/seed/kore/200/200"}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover border border-slate-100"
                        />
                        <div>
                          <p className="font-bold text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono tracking-widest">
                            {item.sku}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          a.category === AssortmentType.MEN
                            ? "bg-indigo-50 text-indigo-600"
                            : a.category === AssortmentType.WOMEN
                            ? "bg-pink-50 text-pink-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {a.category}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-800">
                        ₹{mrp.toLocaleString()}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700">
                      <div className="font-semibold">
                        {item.size || <span className="text-slate-400 italic">—</span>}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          pairs === 0
                            ? "bg-slate-100 text-slate-500"
                            : pairs % 24 === 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-indigo-50 text-indigo-700"
                        }`}
                      >
                        {pairs || 0}
                      </span>
                    </td>


                    <td className="px-6 py-4 text-sm">
                      {status === "WISHLIST" ? (
                        expectedDate ? (
                          <span className="font-semibold text-slate-700">
                            {expectedDate}
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold text-xs">
                            Required
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onEditArticle(a.id)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title="Edit Product"
                        >
                          <Edit2 size={16} />
                        </button>

                        {/* ✅ Only WISH -> AVAILABLE */}
                        <button
                          onClick={() => moveWishToAvailable(a)}
                          disabled={status !== "WISHLIST"}
                          className={`p-2 rounded-xl transition-all ${
                            status === "WISHLIST"
                              ? "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                              : "text-slate-300 cursor-not-allowed"
                          }`}
                          title={
                            status === "WISHLIST"
                              ? "Move Wish → Catalogue"
                              : "Catalogue → Wish not allowed"
                          }
                        >
                          <ArrowRightLeft size={16} />
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ${a.name}?`)) deleteArticle(a.id);
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {catalogItems.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-slate-400 italic"
                  >
                    No items in this tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards (mobile) */}
      <div className="md:hidden space-y-3">
        {catalogItems.map((item) => {
          const a = item.article;
          const status: CatalogStatus =
            ((a as any).catalogStatus as CatalogStatus) || "AVAILABLE";
          const mrp = Number(item.mrp || 0);
          const pairs = item.pairs || 0;
          const expectedDate = String((a as any).expectedAvailableDate || "");
          const cover = item.image || "https://picsum.photos/seed/kore/200/200";

          return (
            <div
              key={item.id}
              onClick={() => setSelectedDetailsItem(item)}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-indigo-200 transition-colors"
            >
              <div className="flex gap-3">
                <img
                  src={cover}
                  alt=""
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-100"
                />
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{item.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono tracking-widest">
                    {item.sku}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                      ₹{mrp.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                      {a.category}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        pairs === 0
                          ? "bg-slate-100 text-slate-600"
                          : pairs % 24 === 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      Pairs: {pairs || 0}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    Assortment:{" "}
                    <span className="font-semibold">{item.size || "—"}</span>
                  </p>

                  {status === "WISHLIST" && (
                    <p className="mt-1 text-sm text-slate-600">
                      Expected:{" "}
                      <span className="font-semibold">
                        {expectedDate || "Required"}
                      </span>
                    </p>
                  )}
                </div>
              </div>


              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onEditArticle(a.id)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Edit Product
                </button>

                <button
                  onClick={() => moveWishToAvailable(a)}
                  disabled={status !== "WISHLIST"}
                  className={`flex-1 px-3 py-2 rounded-xl font-bold ${
                    status === "WISHLIST"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Move to Catalogue
                </button>

                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${a.name}?`)) deleteArticle(a.id);
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {catalogItems.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-400 italic">
            No items in this tab.
          </div>
        )}
      </div>

      {/* Catalogue Details Overlay */}
      {selectedDetailsItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                <Layers className="text-indigo-600" size={20} />
                Catalogue Details
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onEditArticle(selectedDetailsItem.article.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl transition-colors text-sm"
                >
                  <Edit2 size={16} /> Edit Product
                </button>
                <button
                  onClick={() => setSelectedDetailsItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto flex-1">
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                
                {/* Image Section */}
                <div className="w-full sm:w-1/3 shrink-0 space-y-4">
                  <div className="aspect-square rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 relative">
                    <img 
                      src={selectedDetailsItem.image ? (selectedDetailsItem.image.startsWith('http') ? selectedDetailsItem.image : `http://localhost:5005${selectedDetailsItem.image}`) : "https://picsum.photos/seed/kore/400/400"} 
                      alt={selectedDetailsItem.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold text-slate-700 border border-slate-200/50 shadow-sm">
                      Primary
                    </div>
                  </div>

                  {/* Secondary Images Gallery */}
                  {selectedDetailsItem.article.secondaryImages?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                        Gallery ({selectedDetailsItem.article.secondaryImages.length})
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {selectedDetailsItem.article.secondaryImages.map((img: any, idx: number) => (
                          <div key={idx} className="aspect-square rounded-xl border border-slate-100 overflow-hidden bg-slate-50 cursor-zoom-in hover:border-indigo-300 transition-colors">
                            <img 
                              src={img.url ? (img.url.startsWith('http') ? img.url : `http://localhost:5005${img.url}`) : ""} 
                              alt={`Gallery ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onClick={() => {
                                // Simple swap or lightbox logic could go here
                                // For now just showing them
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Details Section */}
                <div className="w-full sm:w-2/3 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedDetailsItem.name}</h2>
                    <div className="flex items-center gap-3 mt-2">
                       <span className="text-sm font-mono tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                         {selectedDetailsItem.sku}
                       </span>
                    </div>
                  </div>

                  {/* Pricing Details */}
                  <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">MRP</p>
                        <p className="font-bold text-slate-800 text-lg">₹{Number(selectedDetailsItem.mrp || 0).toLocaleString()}</p>
                     </div>
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Selling Price</p>
                        <p className="font-bold text-slate-800 text-lg">
                           ₹{selectedDetailsItem.variant?.sellingPrice || selectedDetailsItem.article.pricePerPair || 0}
                        </p>
                     </div>
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cost Price</p>
                        <p className="font-bold text-slate-800 text-lg">
                           ₹{selectedDetailsItem.variant?.costPrice || 0}
                        </p>
                     </div>
                  </div>

                  {/* Core Classification */}
                   <div className="flex flex-wrap items-center gap-3 mb-4">
                      <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 flex items-center gap-1.5">
                        <Tag size={10} /> {selectedDetailsItem.article.category}
                      </div>
                      <div className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                        <Package size={10} /> {selectedDetailsItem.article.productCategory || "Product"}
                      </div>
                      <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1.5">
                        <Layers size={10} /> {selectedDetailsItem.article.brand || "Unbranded"}
                      </div>
                      <div className="px-3 py-1 bg-slate-50 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-1.5">
                        <ArrowRightLeft size={10} /> Range: {selectedDetailsItem.article.selectedSizes?.join(", ") || "—"}
                      </div>
                   </div>

                  {/* Variant specifics */}
                   <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100 text-xs">
                      <div>
                        <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">SKU</p>
                        <p className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                          {selectedDetailsItem.sku}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Category</p>
                        <p className="font-semibold text-slate-700">{selectedDetailsItem.article.productCategory || "—"}</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-400 uppercase tracking-wider mb-1">Brand</p>
                        <p className="font-semibold text-slate-700">{selectedDetailsItem.article.brand || "—"}</p>
                      </div>
                   </div>

                   {/* Pricing Section */}
                   <div className="grid grid-cols-3 gap-2 pb-4 border-b border-slate-100">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">MRP</p>
                        <p className="text-sm font-bold text-slate-700">₹{selectedDetailsItem.mrp.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Selling</p>
                        <p className="text-sm font-bold text-indigo-600">₹{(selectedDetailsItem.variant?.sellingPrice || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cost</p>
                        <p className="text-sm font-bold text-slate-500">₹{(selectedDetailsItem.variant?.costPrice || 0).toLocaleString()}</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-4 gap-4">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Color</p>
                         <p className="text-xs font-bold text-slate-700">{selectedDetailsItem.color || "—"}</p>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sole Color</p>
                         <p className="text-xs font-bold text-slate-700">{selectedDetailsItem.article.soleColor || "—"}</p>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Item Size</p>
                         <p className="text-xs font-bold text-slate-700">{selectedDetailsItem.size || "—"}</p>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">HSN Code</p>
                         <p className="text-xs font-bold text-slate-700">{selectedDetailsItem.variant?.hsnCode || "—"}</p>
                      </div>
                   </div>
                  
                  {/* Stock & Origin */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                     <div className="space-y-4">
                       <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Available Pairs</p>
                          <span
                            className={`inline-block text-sm font-bold px-3 py-1 rounded-xl ${
                              selectedDetailsItem.pairs === 0
                                ? "bg-slate-100 text-slate-500"
                                : selectedDetailsItem.pairs % 24 === 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}
                          >
                            {selectedDetailsItem.pairs || 0} Pairs
                          </span>
                       </div>
                       
                       <div>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Manufacturer</p>
                         <p className="font-semibold text-slate-700 text-sm">{selectedDetailsItem.article.manufacturer || "—"}</p>
                       </div>
                       
                     </div>
                     <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Catalogue Status</p>
                        {selectedDetailsItem.article.status === "WISHLIST" ? (
                           <div>
                             <span className="inline-block text-xs font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-700 mb-1">
                                Wish List
                             </span>
                             {selectedDetailsItem.article.expectedDate ? (
                               <p className="text-xs text-slate-500 font-medium">Expected: {selectedDetailsItem.article.expectedDate}</p>
                             ) : (
                                <p className="text-xs text-rose-600 font-bold">Date Required</p>
                            )}
                          </div>
                        ) : (
                             <span className="inline-block text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                               Available
                            </span>
                        )}
                     </div>
                  </div>

                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 p-5 flex justify-between items-center text-white">
              <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                {editingArticle ? <Edit2 size={20} /> : <Plus size={20} />}
                {editingArticle ? "Edit Catalogue" : "Create Master"}
              </h3>
              <button
                onClick={closeModal}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-5 sm:p-8 max-h-[78vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left */}
                <div className="space-y-4">
                  <Field label="Article Name" required icon={<Tag size={12} />}>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Urban Runner"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, name: capFirst(e.target.value) }))
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Gender" required>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={formData.category}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            category: e.target.value as AssortmentType,
                          }))
                        }
                      >
                        {Object.values(AssortmentType).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="MRP (per pair)"
                      required
                      icon={<ShoppingBag size={12} />}
                    >
                      <input
                        type="number"
                        min={0}
                        required
                        placeholder="0"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-indigo-600 placeholder:text-slate-300"
                        value={formData.mrp === 0 ? "" : String(formData.mrp)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === "" ? 0 : Number(raw) || 0;
                          setFormData((p) => ({ ...p, mrp: val }));
                        }}
                      />
                    </Field>
                  </div>

                  <Field label="Assortment (Size Range)" icon={<Layers size={12} />}>
                    <input
                      type="text"
                      placeholder="e.g. 4-8"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={formData.sizeRange}
                      onChange={(e) => applySizeRange(e.target.value)}
                    />
                  </Field>

                  {/* Size-wise Pairs */}
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
                        {Object.keys(formData.sizeBreakup || {}).length === 0 ? (
                          <div className="text-xs text-slate-400 italic">
                            Type size range to generate boxes (e.g. 4-8).
                          </div>
                        ) : (
                          Object.entries(formData.sizeBreakup || {}).map(([size, qty]) => (
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
                                  value={(qty ?? 0) === 0 ? "" : String(qty ?? 0)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const val = raw === "" ? 0 : Number(raw) || 0;
                                    setFormData((prev) => ({
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
                          ))
                        )}
                      </div>

                      {Object.keys(formData.sizeBreakup || {}).length > 0 && (
                        <div className="mt-3 text-xs font-bold">
                          <span className={isValidMultiple ? "text-emerald-600" : "text-rose-600"}>
                            Total Pairs: {totalPairs}
                          </span>
                          {!isValidMultiple && totalPairs > 0 && (
                            <span className="ml-2 text-rose-600">(Must be 24, 48, 72...)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ✅ Add To: Catalogue or Wish List */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Add To (Before Submit)
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            catalogStatus: "AVAILABLE",
                            expectedAvailableDate: "",
                          }))
                        }
                        className={`flex-1 px-3 py-2 rounded-xl font-bold text-sm border transition ${
                          formData.catalogStatus === "AVAILABLE"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        Catalogue
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            catalogStatus: "WISHLIST",
                          }))
                        }
                        className={`flex-1 px-3 py-2 rounded-xl font-bold text-sm border transition ${
                          formData.catalogStatus === "WISHLIST"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        Wish List
                      </button>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      ✅ Rule: <b>Catalogue → Wish</b> not allowed. Only <b>Wish → Catalogue</b>.
                    </p>

                    {/* ✅ Expected date only for WISH */}
                    {formData.catalogStatus === "WISHLIST" && (
                      <div className="mt-4">
                        <Field
                          label="Expected Available Date"
                          required
                          icon={<CalendarDays size={12} />}
                        >
                          <input
                            type="date"
                            className="w-full p-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                            value={formData.expectedAvailableDate}
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                expectedAvailableDate: e.target.value,
                              }))
                            }
                            required
                          />
                        </Field>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Wish list item me expected date mandatory hai.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right */}
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Images (Multiple)
                  </p>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Choose Images
                    </label>

                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                      onChange={(e) => {
                        handleImageSelect(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {imagePreviews.length === 0 ? (
                        <div className="col-span-2 sm:col-span-3 text-center text-slate-400 italic py-10">
                          <ImageIcon size={32} className="mx-auto mb-2 text-slate-300" />
                          Selected images will preview here.
                        </div>
                      ) : (
                        imagePreviews.map((src, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={src}
                              alt="preview"
                              className="w-full h-24 sm:h-28 rounded-2xl object-cover border border-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => removeImageByIndex(index)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-white/90 border border-slate-200 rounded-xl px-2 py-1 text-xs font-bold text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      You can select multiple images (JPG, PNG, WebP).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-bold text-slate-900 mb-1">Rules</p>
                    <p className="text-slate-600 text-sm">
                      1) Create master → choose <b>Catalogue</b> or <b>Wish List</b> before submit <br />
                      2) <b>Catalogue → Wish</b> not allowed <br />
                      3) Only <b>Wish → Catalogue</b> allowed (Move button)
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >
                  {editingArticle ? "Save Changes" : "Create Master"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogueManager;

/* ---------- Field helper ---------- */
const Field: React.FC<{
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, required, icon, children }) => (
  <div>
    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
      {icon ? icon : null}
      {label} {required ? <span className="text-rose-500">*</span> : null}
    </label>
    {children}
  </div>
);