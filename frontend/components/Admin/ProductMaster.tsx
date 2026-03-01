import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Package,
  Tag,
  DollarSign,
  Users,
  Image as ImageIcon,
  Layers,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Factory,
  Weight,
  Copy,
  Trash2,
  Grid3X3,
} from "lucide-react";
import { AssortmentType, Article, Variant } from "../../types";
import { ASSORTMENTS } from "../../constants";
import SearchableSelect from "../SearchableSelect";
import { masterCatalogService } from "../../services/masterCatalogService";

interface ProductMasterProps {
  addArticle: (article: Article) => void;
  editingId?: string | null;
  onCancelEdit?: () => void;
  onSuccess?: () => void;
}

const ProductMaster: React.FC<ProductMasterProps> = ({ 
  addArticle, 
  editingId, 
  onCancelEdit,
  onSuccess 
}) => {
  // Form State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditingDataLoaded = useRef(false);

  const [formData, setFormData] = useState({
    artname: "",
    soleColor: "",
    mrp: 0,
    hsnCode: "",
    gender: AssortmentType.MEN,
    // keep assortmentId internally but not shown in UI
    assortmentId: ASSORTMENTS[0].id,
    status: "AVAILABLE" as "AVAILABLE" | "WISHLIST",
    wishlistDate: "",
    manufacturer: "",
    unit: "Pairs",
    category: "",
    brand: "",
    // image handling now supports multiple files
    images: [] as File[],
    imagePreviews: [] as string[],
  });

  // Dynamic parameters (Size and Color)
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");

  // Size Ranges & Variants
  const [sizeRanges, setSizeRanges] = useState<string[]>([]);
  const [sizeRangeInput, setSizeRangeInput] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);

  // Taxonomy states from API
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTaxonomy = async () => {
    try {
      setLoading(true);
      const [catRes, brandRes, manufacturerRes] = await Promise.all([
        masterCatalogService.listCategories(),
        masterCatalogService.listBrands(),
        masterCatalogService.listManufacturers(),
      ]);
      setCategories(catRes.data || []);
      setBrands(brandRes.data || []);
      setManufacturers(manufacturerRes.data || []);
    } catch (err) {
      console.error("Failed to fetch taxonomy", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxonomy();
  }, []);

  // --- Edit Mode Initialization ---
  useEffect(() => {
    if (!editingId) return;

    const loadArticle = async () => {
      try {
        setLoading(true);
        const res = await masterCatalogService.getMasterItem(editingId);
        const item = res.data || res; // depending on structure

        setFormData({
          artname: item.articleName || "",
          soleColor: item.soleColor || "",
          mrp: item.mrp || 0,
          hsnCode: item.variants?.[0]?.hsnCode || "",
          gender: item.gender || AssortmentType.MEN,
          assortmentId: ASSORTMENTS[0].id,
          status: item.stage || "AVAILABLE",
          wishlistDate: item.expectedAvailableDate ? new Date(item.expectedAvailableDate).toISOString().split('T')[0] : "",
          manufacturer: item.manufacturerCompanyId?.name || item.manufacturerCompanyId || "",
          unit: item.unitId?.name || item.unitId || "Pairs",
          category: item.categoryId?.name || item.categoryId || "",
          brand: item.brandId?.name || item.brandId || "",
          images: [],
          imagePreviews: item.primaryImage?.url ? [item.primaryImage.url, ...(item.secondaryImages?.map((img: any) => img.url) || [])] : [],
        });

        if (item.productColors) setSelectedColors(item.productColors);
        if (item.sizeRanges) setSizeRanges(item.sizeRanges);
        
        if (item.variants && item.variants.length > 0) {
          const mappedVariants = item.variants.map((v: any) => {
            // sizeMap to sizeQuantities/sizeSkus
            const sizeQuantities: Record<string, number> = {};
            const sizeSkus: Record<string, string> = {};
            
            if (v.sizeMap) {
              Object.entries(v.sizeMap).forEach(([size, data]: [string, any]) => {
                sizeQuantities[size] = data.qty || 0;
                sizeSkus[size] = data.sku || "";
              });
            }

            return {
              id: v._id || `v-${Date.now()}-${Math.random()}`,
              itemName: v.itemName,
              sku: v.sku || "",
              color: v.color,
              sizeRange: v.sizeRange,
              costPrice: v.costPrice || 0,
              sellingPrice: v.sellingPrice || 0,
              mrp: v.mrp || 0,
              hsnCode: v.hsnCode || "",
              sizeQuantities,
              sizeSkus,
            };
          });
          setVariants(mappedVariants);
          isEditingDataLoaded.current = true;
        }
      } catch (err) {
        console.error("Failed to load article for editing", err);
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [editingId, categories, brands, manufacturers]);

  // --- Size Range Helpers ---
  const parseSizeRange = (range: string): string[] => {
    const parts = range.split("-").map((s) => s.trim());
    if (parts.length === 2) {
      const start = parseInt(parts[0]);
      const end = parseInt(parts[1]);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        const sizes: string[] = [];
        for (let i = start; i <= end; i++) sizes.push(String(i));
        return sizes;
      }
    }
    return [range]; // single size fallback
  };

  const getAllSizesFromRanges = useCallback((): string[] => {
    const allSizes = new Set<string>();
    sizeRanges.forEach((range) => {
      parseSizeRange(range).forEach((s) => allSizes.add(s));
    });
    return Array.from(allSizes).sort((a, b) => Number(a) - Number(b));
  }, [sizeRanges]);

  // --- Auto-generate variants when colors or size ranges change ---
  useEffect(() => {
    if (editingId && !isEditingDataLoaded.current) return;
    if (selectedColors.length === 0 || sizeRanges.length === 0) {
      setVariants([]);
      return;
    }

    setVariants((prev) => {
      const newVariants: Variant[] = [];
      selectedColors.forEach((color) => {
        sizeRanges.forEach((range) => {
          const existing = prev.find(
            (v) => v.color === color && v.sizeRange === range
          );
          if (existing) {
            // Preserve existing data, but ensure all sizes in range have entries
            const sizes = parseSizeRange(range);
            const updatedQty = { ...existing.sizeQuantities };
            sizes.forEach((s) => {
              if (!(s in updatedQty)) updatedQty[s] = 0;
            });
            newVariants.push({ ...existing, sizeQuantities: updatedQty });
          } else {
            const sizes = parseSizeRange(range);
            const sizeQuantities: Record<string, number> = {};
            const sizeSkus: Record<string, string> = {};
            sizes.forEach((s) => {
              sizeQuantities[s] = 0;
              sizeSkus[s] = "";
            });
            newVariants.push({
              id: `var-${color}-${range}-${Date.now()}`,
              itemName: `${formData.artname || "Item"}-${color}-${range}`,
              sku: "",
              sizeSkus,
              color,
              sizeRange: range,
              costPrice: 0,
              sellingPrice: 0,
              mrp: formData.mrp || 0,
              hsnCode: formData.hsnCode || "",
              sizeQuantities,
            });
          }
        });
      });
      return newVariants;
    });
  }, [selectedColors, sizeRanges, formData.artname, formData.mrp]);

  // --- Variant Helpers ---
  const updateVariantField = (id: string, field: keyof Variant, value: any) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const updateVariantSizeQty = (id: string, size: string, qty: number) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        return { ...v, sizeQuantities: { ...v.sizeQuantities, [size]: qty } };
      })
    );
  };

  const updateVariantSizeSku = (id: string, size: string, sku: string) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        return { ...v, sizeSkus: { ...v.sizeSkus, [size]: sku } };
      })
    );
  };

  const copyToAll = (
    field: "costPrice" | "sellingPrice" | "mrp",
    sizeRange?: string
  ) => {
    if (variants.length === 0) return;

    // Find the first value for this specific range
    const targetVariants = sizeRange
      ? variants.filter((v) => v.sizeRange === sizeRange)
      : variants;

    if (targetVariants.length === 0) return;

    const firstVal = targetVariants[0][field];

    setVariants((prev) =>
      prev.map((v) => {
        if (sizeRange && v.sizeRange !== sizeRange) return v;
        return { ...v, [field]: firstVal };
      })
    );
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const addSizeRange = () => {
    const trimmed = sizeRangeInput.trim();
    // Regex for start-end format (e.g., 5-7, 10-12)
    const rangeRegex = /^\d+-\d+$/;
    if (trimmed && rangeRegex.test(trimmed) && !sizeRanges.includes(trimmed)) {
      setSizeRanges([...sizeRanges, trimmed]);
      setSizeRangeInput("");
    }
  };

  const removeSizeRange = (range: string) => {
    setSizeRanges(sizeRanges.filter((r) => r !== range));
  };

  // Handlers for Category
  const handleAddCategory = async (cat: string) => {
    try {
      await masterCatalogService.createCategory(cat);
      await fetchTaxonomy();
    } catch (err: any) {
      alert(err.message || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const categoryDoc = categories.find(c => (c.name || c) === cat);
    if (categoryDoc?._id) {
      try {
        await masterCatalogService.deleteCategory(categoryDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        alert(err.message || "Failed to delete category");
      }
    }
  };

  // Handlers for Brand
  const handleAddBrand = async (brand: string) => {
    try {
      await masterCatalogService.createBrand(brand);
      await fetchTaxonomy();
    } catch (err: any) {
      alert(err.message || "Failed to add brand");
    }
  };

  const handleDeleteBrand = async (brand: string) => {
    const brandDoc = brands.find(b => (b.name || b) === brand);
    if (brandDoc?._id) {
      try {
        await masterCatalogService.deleteBrand(brandDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        alert(err.message || "Failed to delete brand");
      }
    }
  };

  // Handlers for Manufacturer
  const handleAddManufacturer = async (man: string) => {
    try {
      await masterCatalogService.createManufacturer(man);
      await fetchTaxonomy();
    } catch (err: any) {
      alert(err.message || "Failed to add manufacturer");
    }
  };

  const handleDeleteManufacturer = async (man: string) => {
    const manDoc = manufacturers.find(m => (m.name || m) === man);
    if (manDoc?._id) {
      try {
        await masterCatalogService.deleteManufacturer(manDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        alert(err.message || "Failed to delete manufacturer");
      }
    }
  };

  // Image handler (multiple images)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      const previews = files.map((f) => URL.createObjectURL(f));
      setFormData({
        ...formData,
        images: files,
        imagePreviews: previews,
      });
    }
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const addColor = () => {
    if (customColor && !selectedColors.includes(customColor)) {
      setSelectedColors([...selectedColors, customColor]);
      setCustomColor("");
    }
  };

  const removeColor = (color: string) => {
    setSelectedColors(selectedColors.filter((c) => c !== color));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.artname || !formData.category || !formData.brand) {
      return alert("Please fill all required fields");
    }

    const categoryId = categories.find(c => (c.name || c) === formData.category)?._id || formData.category;
    const brandId = brands.find(b => (b.name || b) === formData.brand)?._id || formData.brand;
    const manufacturerId = manufacturers.find(m => (m.name || m) === formData.manufacturer)?._id || formData.manufacturer;

    const data = new FormData();
    data.append("articleName", formData.artname);
    data.append("soleColor", formData.soleColor);
    data.append("mrp", formData.mrp.toString());
    data.append("gender", formData.gender);
    data.append("categoryId", categoryId);
    data.append("brandId", brandId);
    data.append("manufacturerCompanyId", manufacturerId);
    data.append("unitId", "64f1c1e5f1b2c3d4e5f6a7b8"); // Mocking UnitId for now or fetching it
    data.append("stage", formData.status);
    if (formData.status === "WISHLIST") {
      data.append("expectedAvailableDate", formData.wishlistDate);
    }

    data.append("productColors", JSON.stringify(selectedColors));
    data.append("sizeRanges", JSON.stringify(sizeRanges));

    // Normalize variants for backend
    const normalizedVariants = variants.map(v => ({
      itemName: v.itemName,
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice,
      mrp: v.mrp,
      hsnCode: v.hsnCode,
      color: v.color,
      sizeRange: v.sizeRange,
      sizeMap: Object.keys(v.sizeQuantities).reduce((acc, size) => {
        acc[size] = { qty: v.sizeQuantities[size], sku: v.sizeSkus[size] };
        return acc;
      }, {} as any)
    }));
    data.append("variants", JSON.stringify(normalizedVariants));

    if (formData.images.length > 0) {
      data.append("primaryImage", formData.images[0]);
      formData.images.slice(1).forEach(img => {
        data.append("secondaryImages", img);
      });
    }

    try {
      setLoading(true);
      if (editingId) {
        await masterCatalogService.updateMasterItem(editingId, data);
        alert("Product Updated Successfully!");
        if (onSuccess) onSuccess();
        if (onCancelEdit) onCancelEdit();
      } else {
        await masterCatalogService.createMasterItem(data);
        alert("Product Created Successfully!");
        if (onSuccess) onSuccess();
        
        // Reset form
        setFormData({
          artname: "",
          soleColor: "",
          hsnCode: "",
          mrp: 0,
          gender: AssortmentType.MEN,
          assortmentId: ASSORTMENTS[0].id,
          status: "AVAILABLE",
          wishlistDate: "",
          manufacturer: "",
          unit: "Pairs",
          category: "",
          brand: "",
          images: [],
          imagePreviews: [],
        });
        setSelectedSizes([]);
        setSelectedColors([]);
        setSizeRanges([]);
        setVariants([]);
      }
    } catch (err: any) {
      alert(err.message || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  // Available Sizes for Parameter selection
  const availableSizes = ["4", "5", "6", "7", "8", "9", "10", "11", "12"];

  return (
    <div className="w-full space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
            <Package size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {editingId ? "Edit Product" : "Product Master"}
            </h2>
            <p className="text-slate-500 text-xs font-medium">
              Create and manage your product catalogue centrally
            </p>
          </div>
        </div>
        {editingId && (
          <button
            onClick={onCancelEdit}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <form
        id="product-form"
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-slate-200"
      >
        {/* Content Area */}
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            {/* Col 1: Core Details (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-8 relative">
              <div className="hidden lg:block absolute -right-6 top-0 bottom-0 w-px bg-slate-100" />

              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Tag size={16} className="text-indigo-500" /> Core Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Article Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Urban Runner X1"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-800"
                      value={formData.artname}
                      onChange={(e) =>
                        setFormData({ ...formData, artname: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Sole Color
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. White"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-800"
                        value={formData.soleColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({
                            ...formData,
                            soleColor: val.charAt(0).toUpperCase() + val.slice(1),
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        MRP (₹) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 1999"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-indigo-700"
                        value={formData.mrp || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            mrp: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Gender Audience <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                      {Object.values(AssortmentType).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setFormData({ ...formData, gender: g })
                          }
                          className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all ${
                            formData.gender === g
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                              : "text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Grid3X3 size={16} className="text-indigo-500" /> Attributes
                </h3>

                <div className="space-y-5">
                  {/* Color Attribute */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                      Product Colors
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Red"
                        className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium text-sm transition-all text-slate-800"
                        value={customColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomColor(val.charAt(0).toUpperCase() + val.slice(1));
                        }}
                        onBlur={addColor}
                        onKeyDown={(e) =>
                          e.key === "Enter" && (e.preventDefault(), addColor())
                        }
                      />
                      <button
                        type="button"
                        onClick={addColor}
                        className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20 flex items-center justify-center"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    {selectedColors.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {selectedColors.map((color) => (
                          <span
                            key={color}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            {color}
                            <X
                              size={12}
                              className="cursor-pointer text-slate-400 hover:text-rose-500 ml-1"
                              onClick={() => removeColor(color)}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Size Range Attribute */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                      Size Ranges
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 5-7"
                        className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium text-sm transition-all text-slate-800"
                        value={sizeRangeInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Only allow digits and hyphens
                          if (/^[0-9-]*$/.test(val)) {
                            setSizeRangeInput(val);
                          }
                        }}
                        onBlur={addSizeRange}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          (e.preventDefault(), addSizeRange())
                        }
                      />
                      <button
                        type="button"
                        onClick={addSizeRange}
                        className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20 flex items-center justify-center"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    {sizeRanges.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {sizeRanges.map((range) => (
                          <span
                            key={range}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            {range}
                            <X
                              size={12}
                              className="cursor-pointer text-slate-400 hover:text-rose-500 ml-1"
                              onClick={() => removeSizeRange(range)}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Col 2: Taxonomy & Classification (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-8 relative">
              <div className="hidden lg:block absolute -right-6 top-0 bottom-0 w-px bg-slate-100" />

              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Layers size={16} className="text-indigo-500" /> Taxonomy
                </h3>

                <div className="space-y-4">
                  <SearchableSelect
                    label="Category"
                    options={categories.map((c) => c.name || c)}
                    value={formData.category}
                    onChange={(val) =>
                      setFormData({ ...formData, category: val, brand: "" })
                    }
                    onAdd={handleAddCategory}
                    onDelete={handleDeleteCategory}
                    placeholder="Select Category"
                    required
                  />

                  <SearchableSelect
                    label="Brand"
                    options={brands.map((b) => b.name || b)}
                    value={formData.brand}
                    onChange={(val) => setFormData({ ...formData, brand: val })}
                    onAdd={handleAddBrand}
                    onDelete={handleDeleteBrand}
                    placeholder="Select Brand"
                    required
                  />

                  {/* assortment mix removed from UI */}
                </div>

                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Factory size={16} className="text-indigo-500" />{" "}
                    Manufacturing
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <SearchableSelect
                        label="Manufacturer"
                        options={manufacturers.map((m) => m.name || m)}
                        value={formData.manufacturer}
                        onChange={(val) =>
                          setFormData({ ...formData, manufacturer: val })
                        }
                        onAdd={handleAddManufacturer}
                        onDelete={handleDeleteManufacturer}
                        placeholder="Select Manufacturer"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Base Unit
                      </label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium text-slate-700 transition-all cursor-pointer"
                        value={formData.unit}
                        onChange={(e) =>
                          setFormData({ ...formData, unit: e.target.value })
                        }
                      >
                        <option>Pairs</option>
                        <option>Pcs</option>
                        <option>Boxes</option>
                        <option>Cartons</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Col 3: Media & Status (3 cols) */}
            <div className="lg:col-span-3 flex flex-col gap-8">
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <ImageIcon size={16} className="text-indigo-500" /> Primary
                  Media
                </h3>

                <div>
                  {/* container that will trigger file chooser on click */}
                  <div
                    className="grid grid-cols-2 gap-2 mb-2 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {formData.imagePreviews.map((src, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={src}
                          className="w-full h-24 object-cover rounded-xl border"
                          alt={`Preview ${idx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            // prevent the container click from firing
                            e.stopPropagation();
                            const newPre = formData.imagePreviews.filter(
                              (_, i) => i !== idx
                            );
                            const newFiles = formData.images.filter(
                              (_, i) => i !== idx
                            );
                            setFormData({
                              ...formData,
                              imagePreviews: newPre,
                              images: newFiles,
                            });
                          }}
                          className="absolute top-1 right-1 p-1 bg-white/90 text-rose-500 rounded-full shadow-sm hover:bg-rose-50 transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {formData.imagePreviews.length === 0 && (
                      <div className="aspect-square w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/50">
                        <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100 text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-transform mb-3">
                          <ImageIcon size={28} />
                        </div>
                        <p className="text-xs text-slate-500 font-bold">
                          Click to upload image
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          PNG, JPG up to 5MB
                        </p>
                      </div>
                    )}
                  </div>
                  {/* hidden input used by click handler */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Clock size={16} className="text-indigo-500" /> Listing Status
                </h3>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, status: "AVAILABLE" })
                    }
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 font-bold text-sm transition-all ${
                      formData.status === "AVAILABLE"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm"
                        : "bg-white border-slate-100 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <CheckCircle2
                      size={18}
                      className={
                        formData.status === "AVAILABLE"
                          ? "text-emerald-500"
                          : "text-slate-400"
                      }
                    />
                    Active / Available
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, status: "WISHLIST" })
                    }
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 font-bold text-sm transition-all ${
                      formData.status === "WISHLIST"
                        ? "bg-amber-50 border-amber-500 text-amber-800 shadow-sm"
                        : "bg-white border-slate-100 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Clock
                      size={18}
                      className={
                        formData.status === "WISHLIST"
                          ? "text-amber-500"
                          : "text-slate-400"
                      }
                    />
                    Coming Soon / Wishlist
                  </button>

                  {formData.status === "WISHLIST" && (
                    <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Expected Availability
                      </label>
                      <input
                        type="date"
                        className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 font-medium text-slate-700 transition-all"
                        value={formData.wishlistDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            wishlistDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ===== VARIANTS TABLES (Grouped by Range) ===== */}
          {variants.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                <Layers size={16} className="text-indigo-500" />
                Product Variants
                <span className="ml-2 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {variants.length} total
                </span>
              </h3>

              <div className="space-y-10">
                {Array.from(new Set(variants.map((v) => v.sizeRange))).map(
                  (range) => {
                    const rangeVariants = variants.filter(
                      (v) => v.sizeRange === range
                    );
                    const rangeSizes = parseSizeRange(range);

                    return (
                      <div key={range} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-slate-100"></div>
                          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Size Range: {range}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">
                              ({rangeVariants.length} items)
                            </span>
                          </div>
                          <div className="h-px flex-1 bg-slate-100"></div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
                                  Item Name
                                </th>
                                <th className="px-3 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    Cost Price (₹)
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyToAll("costPrice", range)
                                      }
                                      className="text-[9px] text-indigo-400 hover:text-indigo-600 font-bold uppercase flex items-center gap-1 transition-colors"
                                    >
                                      <Copy size={9} /> Copy Range
                                    </button>
                                  </div>
                                </th>
                                <th className="px-3 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    Selling Price (₹)
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyToAll("sellingPrice", range)
                                      }
                                      className="text-[9px] text-indigo-400 hover:text-indigo-600 font-bold uppercase flex items-center gap-1 transition-colors"
                                    >
                                      <Copy size={9} /> Copy Range
                                    </button>
                                  </div>
                                </th>
                                {/* Dynamic size columns for THIS range only */}
                                {rangeSizes.map((size) => (
                                  <th
                                    key={size}
                                    className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center whitespace-nowrap min-w-20"
                                  >
                                    <div className="flex flex-col">
                                      <span>Size {size}</span>
                                      <span className="text-[8px] text-slate-400 font-medium">Qty / SKU</span>
                                    </div>
                                  </th>
                                ))}
                                <th className="px-3 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    MRP (₹)
                                    <button
                                      type="button"
                                      onClick={() => copyToAll("mrp", range)}
                                      className="text-[9px] text-indigo-400 hover:text-indigo-600 font-bold uppercase flex items-center gap-1 transition-colors"
                                    >
                                      <Copy size={9} /> Copy Range
                                    </button>
                                  </div>
                                </th>
                                <th className="px-3 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    HSN Code
                                  </div>
                                </th>
                                <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                                  {/* Actions */}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {rangeVariants.map((variant, idx) => (
                                <tr
                                  key={variant.id}
                                  className={`border-b border-slate-100 ${
                                    idx % 2 === 0
                                      ? "bg-white"
                                      : "bg-slate-50/30"
                                  } hover:bg-indigo-50/30 transition-colors`}
                                >
                                  {/* Item Name */}
                                  <td className="px-4 py-2.5">
                                    <input
                                      type="text"
                                      className="w-full min-w-40 p-2 bg-transparent border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all placeholder:text-slate-300"
                                      value={variant.itemName}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "itemName",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>

                                  {/* Cost Price */}
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="number"
                                      placeholder="0"
                                      className="w-full min-w-22.5 p-2 bg-transparent border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                      value={variant.costPrice || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "costPrice",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>
                                  {/* Selling Price */}
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="number"
                                      placeholder="0"
                                      className="w-full min-w-22.5 p-2 bg-transparent border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                      value={variant.sellingPrice || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "sellingPrice",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>
                                  {/* Sizes for this variant */}
                                  {rangeSizes.map((size) => (
                                    <td
                                      key={size}
                                      className="px-2 py-2.5 text-center"
                                    >
                                      <div className="flex flex-col gap-1.5">
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="Qty"
                                          className="w-full min-w-12.5 p-2 bg-emerald-50/50 border border-emerald-200/50 rounded-lg text-xs font-bold text-emerald-800 text-center outline-none focus:ring-1 focus:ring-emerald-400/30 focus:border-emerald-400 transition-all"
                                          value={
                                            variant.sizeQuantities[size] || ""
                                          }
                                          onChange={(e) =>
                                            updateVariantSizeQty(
                                              variant.id,
                                              size,
                                              Number(e.target.value)
                                            )
                                          }
                                        />
                                        <input
                                          type="text"
                                          placeholder="SKU"
                                          className="w-full min-w-12.5 p-1.5 bg-slate-50 border border-slate-200 rounded-md text-[10px] font-medium text-slate-600 text-center outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                          value={variant.sizeSkus[size] || ""}
                                          onChange={(e) =>
                                            updateVariantSizeSku(
                                              variant.id,
                                              size,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </div>
                                    </td>
                                  ))}
                                  {/* MRP */}
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="number"
                                      placeholder="0"
                                      className="w-full min-w-22.5 p-2 bg-transparent border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                      value={variant.mrp || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "mrp",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="text"
                                      placeholder="e.g. 6402"
                                      className="w-full min-w-22.5 p-2 bg-transparent border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                      value={variant.hsnCode || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "hsnCode",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  {/* Actions */}
                                  <td className="px-3 py-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeVariant(variant.id)}
                                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 md:px-8 flex justify-between items-center shrink-0">
          <p className="text-xs text-slate-400 font-medium hidden sm:block">
            Please review all details before saving. Required fields are marked
            with <span className="text-rose-500">*</span>
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all shadow-sm"
            >
              Save as Draft
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none px-8 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 hover:-translate-y-0.5"
            >
              <CheckCircle2 size={18} />
              Save Product
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductMaster;
