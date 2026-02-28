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

interface ProductMasterProps {
  addArticle: (article: Article) => void;
}

const ProductMaster: React.FC<ProductMasterProps> = ({ addArticle }) => {
  // Form State
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    artname: "",
    soleColor: "",
    mrp: 0,
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

  // Category, Brand and Manufacturer states (Persisted to localStorage for demo)
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("kore_categories");
    return saved ? JSON.parse(saved) : ["Footwear", "Apparel", "Accessories"];
  });

  const [brands, setBrands] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem("kore_brands");
    return saved
      ? JSON.parse(saved)
      : {
          Footwear: ["Nike", "Adidas", "Puma", "Reebok"],
          Apparel: ["Levis", "Zara", "H&M"],
          Accessories: ["Titan", "Casio"],
        };
  });

  const [manufacturers, setManufacturers] = useState<string[]>(() => {
    const saved = localStorage.getItem("kore_manufacturers");
    return saved
      ? JSON.parse(saved)
      : ["Acme Corp", "Global Supplies", "Prime Footwear"];
  });

  useEffect(() => {
    localStorage.setItem("kore_categories", JSON.stringify(categories));
    localStorage.setItem("kore_brands", JSON.stringify(brands));
    localStorage.setItem("kore_manufacturers", JSON.stringify(manufacturers));
  }, [categories, brands, manufacturers]);

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
            sizes.forEach((s) => (sizeQuantities[s] = 0));
            newVariants.push({
              id: `var-${color}-${range}-${Date.now()}`,
              itemName: `${formData.artname || "Item"}-${color}-${range}`,
              sku: "",
              color,
              sizeRange: range,
              costPrice: 0,
              sellingPrice: 0,
              mrp: formData.mrp || 0,
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
    if (trimmed && !sizeRanges.includes(trimmed)) {
      setSizeRanges([...sizeRanges, trimmed]);
      setSizeRangeInput("");
    }
  };

  const removeSizeRange = (range: string) => {
    setSizeRanges(sizeRanges.filter((r) => r !== range));
  };

  // Handlers for Category
  const handleAddCategory = (cat: string) => {
    if (!categories.includes(cat)) {
      setCategories([...categories, cat]);
      setBrands({ ...brands, [cat]: [] });
    }
  };

  const handleDeleteCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
    const newBrands = { ...brands };
    delete newBrands[cat];
    setBrands(newBrands);
    if (formData.category === cat) {
      setFormData({ ...formData, category: "", brand: "" });
    }
  };

  // Handlers for Brand
  const handleAddBrand = (brand: string) => {
    if (!formData.category) return alert("Please select a category first");
    const catBrands = brands[formData.category] || [];
    if (!catBrands.includes(brand)) {
      setBrands({
        ...brands,
        [formData.category]: [...catBrands, brand],
      });
    }
  };

  const handleDeleteBrand = (brand: string) => {
    if (!formData.category) return;
    setBrands({
      ...brands,
      [formData.category]: brands[formData.category].filter((b) => b !== brand),
    });
    if (formData.brand === brand) {
      setFormData({ ...formData, brand: "" });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.artname || !formData.category || !formData.brand) {
      return alert("Please fill all required fields");
    }

    const newArticle: Article = {
      id: `art-${Date.now()}`,
      sku: `KK-${formData.gender.charAt(0)}-${formData.artname
        .replace(/\s+/g, "")
        .toUpperCase()}-${Date.now().toString().slice(-4)}`,
      name: formData.artname,
      category: formData.gender,
      productCategory: formData.category,
      brand: formData.brand,
      assortmentId: formData.assortmentId,
      pricePerPair: formData.mrp,
      mrp: formData.mrp,
      soleColor: formData.soleColor,
      imageUrl: formData.imagePreviews[0] || "https://picsum.photos/400/400",
      images: formData.imagePreviews,
      status: formData.status,
      expectedDate: formData.status === "WISHLIST" ? formData.wishlistDate : "",
      manufacturer: formData.manufacturer,
      unit: formData.unit,
      selectedSizes: selectedSizes,
      selectedColors: selectedColors,
      variants: variants,
    };

    addArticle(newArticle);
    alert("Product Created Successfully!");

    // Reset form
    setFormData({
      artname: "",
      soleColor: "",
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
              Product Master
            </h2>
            <p className="text-slate-500 text-xs font-medium">
              Create and manage your product catalogue centrally
            </p>
          </div>
        </div>
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
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            soleColor: e.target.value,
                          })
                        }
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
                        onChange={(e) => setCustomColor(e.target.value)}
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
                        onChange={(e) => setSizeRangeInput(e.target.value)}
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
                    options={categories}
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
                    options={
                      formData.category ? brands[formData.category] || [] : []
                    }
                    value={formData.brand}
                    onChange={(val) => setFormData({ ...formData, brand: val })}
                    onAdd={handleAddBrand}
                    onDelete={handleDeleteBrand}
                    placeholder={
                      formData.category
                        ? "Select Brand"
                        : "Select Category First"
                    }
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
                        options={manufacturers}
                        value={formData.manufacturer}
                        onChange={(val) =>
                          setFormData({ ...formData, manufacturer: val })
                        }
                        onAdd={(val) =>
                          setManufacturers((prev) =>
                            prev.includes(val) ? prev : [...prev, val]
                          )
                        }
                        onDelete={(val) =>
                          setManufacturers((prev) =>
                            prev.filter((m) => m !== val)
                          )
                        }
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
                                  SKU
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
                                    className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center whitespace-nowrap min-w-15"
                                  >
                                    {size}
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
                                  {/* SKU */}
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="text"
                                      placeholder="Auto"
                                      className="w-full min-w-22.5 p-2 bg-transparent border border-slate-200 rounded-lg text-xs text-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                      value={variant.sku}
                                      onChange={(e) =>
                                        updateVariantField(
                                          variant.id,
                                          "sku",
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
                                      <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
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
              Discard Clear
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
