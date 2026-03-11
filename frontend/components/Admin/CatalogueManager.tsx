import React, { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
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
  ChevronDown,
  Palette,
  Loader2,
} from "lucide-react";
import { Article, AssortmentType } from "../../types";
import Switch from "../ui/Switch";
import { masterCatalogService } from "../../services/masterCatalogService";

type CatalogStatus = "AVAILABLE" | "WISHLIST";

type CatalogueForm = {
  name: string;
  category: AssortmentType;
  mrp: number;
  sizeRange: string;
  sizeBreakup: Record<string, number>;
  images: File[];
  catalogStatus: CatalogStatus;
  expectedAvailableDate: string;
};

interface CatalogueManagerProps {
  articles: Article[];
  addArticle: (article: Article) => void;
  updateArticle: (article: Article) => void;
  deleteArticle: (id: string) => void;
  onEditArticle: (id: string) => void;
  onViewVariant: (articleId: string, variantId: string) => void;
  expandedIds: Set<string>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL.replace("/api", "");

const CatalogueManager: React.FC<CatalogueManagerProps> = ({
  articles,
  addArticle,
  updateArticle,
  deleteArticle,
  onEditArticle,
  onViewVariant,
  expandedIds,
  setExpandedIds,
}) => {
  const [activeTab, setActiveTab] = useState<CatalogStatus>("AVAILABLE");
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

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
      0
    );
  }, [formData.sizeBreakup]);

  const isValidMultiple = totalPairs === 0 || totalPairs % 24 === 0;

  // ---------- Image ----------
  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );
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

  const moveWishToAvailable = async (article: Article) => {
    const status = (article.status || "AVAILABLE") as CatalogStatus;
    if (status !== "WISHLIST") return;
    const updated: Article = {
      ...article,
      status: "AVAILABLE",
      expectedDate: "",
    };

    const promise = async () => {
      // Simulate/Trigger update
      await updateArticle(updated);
    };

    toast.promise(promise(), {
      loading: "Moving to Catalogue...",
      success: "Moved to Available Catalogue!",
      error: "Failed to move article",
    });
  };

  const handleStatusToggle = async (article: Article, newStatus: boolean) => {
    const updated: Article = {
      ...article,
      isActive: newStatus,
    };

    try {
      await masterCatalogService.updateMasterItemFields(article.id, {
        isActive: newStatus,
      });
      // Update local state
      updateArticle(updated);
      toast.success(
        `Article ${newStatus ? "activated" : "deactivated"} successfully`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleVariantStatusToggle = async (
    article: Article,
    variantId: string,
    newStatus: boolean
  ) => {
    const updatedVariants = article.variants?.map((v) =>
      v.id === variantId ? { ...v, isActive: newStatus } : v
    );
    const updatedArticle: Article = { ...article, variants: updatedVariants };

    try {
      await masterCatalogService.updateMasterItemFields(article.id, {
        variants: updatedVariants,
      });
      // Update local state
      updateArticle(updatedArticle);
      toast.success(
        `Variant ${newStatus ? "activated" : "deactivated"} successfully`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update variant status");
    }
  };

  // ---------- Toggle Accordion ----------
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------- Data: filtered master articles ----------
  const filteredMasters = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return articles.filter((a) => {
      const status = (a.status || "AVAILABLE") as CatalogStatus;
      if (status !== activeTab) return false;
      if (!q) return true;
      // Match on article name, sku, or any variant name/sku
      if ((a.name || "").toLowerCase().includes(q)) return true;
      if ((a.sku || "").toLowerCase().includes(q)) return true;
      if (
        a.variants?.some((v) => {
          const vName = v.itemName || `${a.name} - ${v.color}`;
          if (vName.toLowerCase().includes(q)) return true;
          if ((v.sku || "").toLowerCase().includes(q)) return true;
          if (
            Object.values(v.sizeSkus || {}).some((sk) =>
              sk.toLowerCase().includes(q)
            )
          )
            return true;
          return false;
        })
      )
        return true;
      return false;
    });
  }, [articles, activeTab, searchTerm]);

  // ---------- Modal ----------
  const openModal = (article?: Article) => {
    setImagePreviews((prev) => {
      prev.forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
      return [];
    });

    if (article) {
      setEditingArticle(article);
      const status: CatalogStatus =
        (article.status as CatalogStatus) || "AVAILABLE";
      setFormData({
        name: article.name || "",
        category: article.category,
        mrp: Number((article as any).mrp || 0),
        sizeRange: String((article as any).sizeRange || ""),
        sizeBreakup: (article as any).sizeBreakup || {},
        images: [],
        catalogStatus: status,
        expectedAvailableDate: String(
          (article as any).expectedAvailableDate || ""
        ),
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
        catalogStatus: "WISHLIST",
        expectedAvailableDate: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error("Article name required");
    if (formData.mrp <= 0) return toast.error("MRP must be > 0");
    if (
      Object.keys(formData.sizeBreakup || {}).length > 0 &&
      !isValidMultiple
    ) {
      return toast.error("Total pairs must be 24, 48, 72... (multiple of 24)");
    }
    if (
      formData.catalogStatus === "WISHLIST" &&
      !formData.expectedAvailableDate
    ) {
      return toast.error(
        "Expected available date is required for Wish List items."
      );
    }
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
      status: formData.catalogStatus,
      expectedDate:
        formData.catalogStatus === "WISHLIST"
          ? formData.expectedAvailableDate
          : "",
    };

    if (!isValidMultiple) {
      return toast.error("Total pairs must be a multiple of 24");
    }

    const savePromise = async () => {
      // Simulate API delay if needed or just handle props
      if (editingArticle) {
        await updateArticle(payload);
      } else {
        await addArticle(payload);
      }
      setIsModalOpen(false);
    };

    setLoading(true);
    const promise = savePromise();
    toast.promise(promise, {
      loading: editingArticle ? "Updating..." : "Creating...",
      success: editingArticle
        ? "Updated successfully!"
        : "Created successfully!",
      error: "Failed to save catalogue item",
    });
    promise.finally(() => setLoading(false));
  };

  // ---------- Render helpers ----------
  const imgSrc = (url: string | undefined) => {
    if (!url) return "https://picsum.photos/seed/kore/200/200";
    return url.startsWith("http") ? url : `${BASE_URL}${url}`;
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
              {filteredMasters.length} Master
              {filteredMasters.length !== 1 ? "s" : ""} •{" "}
              <b>{activeTab === "AVAILABLE" ? "Available" : "Wish List"}</b>
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
              placeholder="Search master, variant or SKU..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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

      {/* Master Articles List */}
      <div className="space-y-3">
        {filteredMasters.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-2 text-center">
            <Package className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-400 font-medium">No items in this tab.</p>
          </div>
        )}

        {filteredMasters.map((article) => {
          const isExpanded = expandedIds.has(article.id);
          const status = (article.status || "AVAILABLE") as CatalogStatus;
          const variantCount = article.variants?.length || 0;
          const cover = imgSrc(article.imageUrl);

          // Calculate price ranges
          const sellingPrices =
            article.variants
              ?.map((v) => v.sellingPrice || 0)
              .filter((p) => p > 0) || [];
          const costPrices =
            article.variants
              ?.map((v) => v.costPrice || 0)
              .filter((p) => p > 0) || [];
          const mrpPrices =
            article.variants?.map((v) => v.mrp || 0).filter((p) => p > 0) || [];

          const formatRange = (prices: number[], fallback: number) => {
            if (!prices.length) return `₹${fallback.toLocaleString()}`;
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            return min === max
              ? `₹${min.toLocaleString()}`
              : `₹${min.toLocaleString()} - ₹${max.toLocaleString()}`;
          };

          const sellingDisplay = formatRange(
            sellingPrices,
            article.pricePerPair || 0
          );
          const costDisplay = formatRange(costPrices, 0);
          const mrpDisplay = formatRange(mrpPrices, article.mrp || 0);

          // Find common HSN
          const hsnCodes = Array.from(
            new Set(article.variants?.map((v) => v.hsnCode).filter(Boolean))
          );
          const hsnDisplay =
            hsnCodes.length === 1
              ? hsnCodes[0]
              : hsnCodes.length > 1
              ? "Multiple"
              : "N/A";

          return (
            <div
              key={article.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all"
            >
              {/* Master Row */}
              <div
                className="flex items-center gap-4 p-4 md:p-1 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => toggleExpand(article.id)}
              >
                {/* Removed parent image per request */}

                {/* Info Container */}
                <div className="flex-1 min-w-0">
                  {/* Info Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors truncate">
                      {article.name}
                    </h4>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        article.category === AssortmentType.MEN
                          ? "bg-indigo-50 text-indigo-600 border border-indigo-100/50"
                          : article.category === AssortmentType.WOMEN
                          ? "bg-pink-50 text-pink-600 border border-pink-100/50"
                          : "bg-amber-50 text-amber-600 border border-amber-100/50"
                      }`}
                    >
                      {article.category}
                    </span>
                    {article.productCategory && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold border border-slate-200/50">
                        {article.productCategory}
                      </span>
                    )}
                    {status === "WISHLIST" && article.expectedDate && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-bold flex items-center gap-1 border border-rose-100/50">
                        <CalendarDays size={8} />
                        ETA:{" "}
                        {new Date(article.expectedDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Compact Stats Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <StatItem
                      label="Brand"
                      value={article.brand || "Internal"}
                    />
                    <div className="flex items-center gap-2">
                      <StatBox label="Cost" value={costDisplay} />
                      <StatBox label="MRP" value={mrpDisplay} />
                    </div>
                  </div>
                </div>

                {/* Variant count badge */}
                <div className="hidden lg:block shrink-0 px-4 border-l border-slate-100">
                  <div className="text-center">
                    <span className="text-xl font-black text-indigo-600 block leading-tight">
                      {variantCount}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      Variants
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onEditArticle(article.id)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Edit Product"
                  >
                    <Edit2 size={16} />
                  </button>

                  {status === "WISHLIST" && (
                    <button
                      onClick={() => moveWishToAvailable(article)}
                      className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                      title="Move Wish → Catalogue"
                    >
                      <ArrowRightLeft size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${article.name}?`))
                        deleteArticle(article.id);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>

                  <Switch
                    checked={article.isActive !== false}
                    onCheckedChange={(checked) =>
                      handleStatusToggle(article, checked)
                    }
                    className="scale-90"
                  />
                </div>

                {/* Chevron */}
                <ChevronDown
                  size={20}
                  className={`text-slate-400 shrink-0 transition-transform duration-300 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </div>

              {/* Accordion Content — Variants */}
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {variantCount === 0 ? (
                      <div className="px-6 py-8 text-center text-slate-400 italic text-sm">
                        No variants for this master. Edit to add variants.
                      </div>
                    ) : (
                      <>
                        {/* Desktop variant table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-slate-100/80 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Image
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Variant
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Color
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  HSN Code
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Cost
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  MRP
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {article.variants!.map((v) => {
                                const vName =
                                  v.itemName || `${article.name} - ${v.color}`;
                                return (
                                  <tr
                                    key={v.id}
                                    onClick={() =>
                                      onViewVariant(article.id, v.id)
                                    }
                                    className="hover:bg-white cursor-pointer transition-colors"
                                  >
                                    <td className="px-6 py-3">
                                      {v.images && v.images.length > 0 ? (
                                        <img
                                          src={v.images[0]}
                                          alt={v.color}
                                          className="w-10 h-10 rounded-lg object-cover border border-slate-100"
                                        />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-100">
                                          <ImageIcon
                                            size={16}
                                            className="text-slate-400"
                                          />
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="font-bold text-sm text-slate-800 truncate max-w-[220px]">
                                        {vName}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                        {v.sku || article.sku || ""}
                                      </p>
                                    </td>
                                    <td className="px-6 py-3">
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                        <span
                                          className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                                          style={{
                                            backgroundColor:
                                              v.color?.toLowerCase() || "#ccc",
                                          }}
                                        />
                                        {v.color || "—"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 font-mono text-[11px] text-slate-500">
                                      {v.hsnCode || article.sku || "—"}
                                    </td>
                                    <td className="px-6 py-3">
                                      <span className="text-sm font-bold text-slate-500">
                                        ₹{(v.costPrice || 0).toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3">
                                      <span className="text-sm font-bold text-slate-800">
                                        ₹{(v.mrp || 0).toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <Switch
                                          checked={v.isActive !== false}
                                          onCheckedChange={(checked) =>
                                            handleVariantStatusToggle(
                                              article,
                                              v.id,
                                              checked
                                            )
                                          }
                                          className="scale-75"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile variant cards */}
                        <div className="md:hidden p-3 space-y-2">
                          {article.variants!.map((v) => {
                            const vName =
                              v.itemName || `${article.name} - ${v.color}`;
                            return (
                              <div
                                key={v.id}
                                onClick={() => onViewVariant(article.id, v.id)}
                                className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-indigo-200 transition-colors"
                              >
                                <div className="flex gap-3">
                                  {v.images && v.images.length > 0 ? (
                                    <img
                                      src={v.images[0]}
                                      alt={v.color}
                                      className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-100 shrink-0">
                                      <ImageIcon
                                        size={20}
                                        className="text-slate-400"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-bold text-sm text-slate-800">
                                          {vName}
                                        </p>
                                        <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                          {v.sku || article.sku || ""}
                                        </p>
                                      </div>
                                      <span className="text-[10px] font-bold text-indigo-500 uppercase shrink-0">
                                        View →
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full border border-slate-300"
                                          style={{
                                            backgroundColor:
                                              v.color?.toLowerCase() || "#ccc",
                                          }}
                                        />
                                        {v.color || "—"}
                                      </span>
                                      <span className="text-xs font-bold text-indigo-600">
                                        ₹{(v.mrp || 0).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  <div
                                    className="shrink-0 pt-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Switch
                                      checked={v.isActive !== false}
                                      onCheckedChange={(checked) =>
                                        handleVariantStatusToggle(
                                          article,
                                          v.id,
                                          checked
                                        )
                                      }
                                      className="scale-90"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Form Modal — unchanged */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-100 flex items-center justify-center p-3 cursor-pointer"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
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
                        setFormData((p) => ({
                          ...p,
                          name: capFirst(e.target.value),
                        }))
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

                  <Field
                    label="Assortment (Size Range)"
                    icon={<Layers size={12} />}
                  >
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
                        {Object.keys(formData.sizeBreakup || {}).length ===
                        0 ? (
                          <div className="text-xs text-slate-400 italic">
                            Type size range to generate boxes (e.g. 4-8).
                          </div>
                        ) : (
                          Object.entries(formData.sizeBreakup || {}).map(
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
                                      (qty ?? 0) === 0 ? "" : String(qty ?? 0)
                                    }
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const val =
                                        raw === "" ? 0 : Number(raw) || 0;
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
                            )
                          )
                        )}
                      </div>
                      {Object.keys(formData.sizeBreakup || {}).length > 0 && (
                        <div className="mt-3 text-xs font-bold">
                          <span
                            className={
                              isValidMultiple
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }
                          >
                            Total Pairs: {totalPairs}
                          </span>
                          {!isValidMultiple && totalPairs > 0 && (
                            <span className="ml-2 text-rose-600">
                              (Must be 24, 48, 72...)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add To: Catalogue or Wish List */}
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
                      ✅ Rule: <b>Catalogue → Wish</b> not allowed. Only{" "}
                      <b>Wish → Catalogue</b>.
                    </p>
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
                          <ImageIcon
                            size={32}
                            className="mx-auto mb-2 text-slate-300"
                          />
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
                      1) Create master → choose <b>Catalogue</b> or{" "}
                      <b>Wish List</b> before submit <br />
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
                  className="flex-2 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
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

/* ---------- Helper Components ---------- */
const StatItem: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-center gap-1.5 overflow-hidden">
    <span className="text-[10px] text-slate-400 uppercase font-black shrink-0">
      {label}:
    </span>
    <span
      className={`text-[11px] text-slate-600 truncate ${
        mono ? "font-mono" : "font-semibold"
      }`}
    >
      {value}
    </span>
  </div>
);

const StatBox: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <div
    className={`px-2 py-1 rounded-lg border flex flex-col justify-center ${
      highlight
        ? "bg-indigo-50 border-indigo-100"
        : "bg-slate-50 border-slate-100"
    }`}
  >
    <span
      className={`text-[8px] uppercase font-black tracking-tighter ${
        highlight ? "text-indigo-400" : "text-slate-400"
      }`}
    >
      {label}
    </span>
    <span
      className={`text-[11px] font-bold leading-none ${
        highlight ? "text-indigo-600" : "text-slate-800"
      }`}
    >
      {value}
    </span>
  </div>
);

const SizeBreakdown: React.FC<{
  sizeRange: string;
  sizeMap: any;
  type?: "stock" | "booking";
  compact?: boolean;
}> = ({ sizeRange, sizeMap, type = "stock", compact = false }) => {
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

  const sizes = parseSizeRange(sizeRange);
  if (sizes.length === 0) return null;

  const getQty = (val: any) => {
    if (typeof val === "object" && val !== null && "qty" in val) {
      return Number(val.qty) || 0;
    }
    return Number(val) || 0;
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {sizes.map((sz) => {
          const rawVal = sizeMap[sz] || 0;
          let qty = getQty(rawVal);
          if (type === "stock") qty = 0; // Forced to 0 as PO quantities are not GRN inventory
          return (
            <div
              key={sz}
              className="flex items-center bg-white border border-slate-100 rounded px-1.5 py-0.5"
            >
              <span className="text-[8px] font-black text-slate-400 mr-1">
                {sz}:
              </span>
              <span
                className={`text-[9px] font-bold ${
                  qty > 0 ? "text-indigo-600" : "text-slate-300"
                }`}
              >
                {qty}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {sizes.map((sz) => {
        const rawVal = sizeMap[sz] || 0;
        let qty = getQty(rawVal);
        if (type === "stock") qty = 0; // Forced to 0 as PO quantities are not GRN inventory

        const isPositive = qty > 0;
        const colorClass =
          type === "stock"
            ? isPositive
              ? "text-indigo-600"
              : "text-slate-300"
            : isPositive
            ? "text-emerald-600"
            : "text-slate-300";

        return (
          <div
            key={sz}
            className="flex flex-col items-center min-w-[32px] bg-white border border-slate-100 rounded-md shadow-sm"
          >
            <span className="text-[9px] font-black text-slate-400 border-b border-slate-50 w-full text-center py-0.5">
              {sz}
            </span>
            <span className={`text-[10px] font-bold py-0.5 ${colorClass}`}>
              {qty}
            </span>
          </div>
        );
      })}
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
    <label className=" text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
      {icon ? icon : null}
      {label} {required ? <span className="text-rose-500">*</span> : null}
    </label>
    {children}
  </div>
);
