import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
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
  GripVertical,
  Star,
  ArrowUp,
  Loader2,
} from "lucide-react";
import { AssortmentType, Article, Variant } from "../../types";
import { ASSORTMENTS } from "../../constants";
import SearchableSelect from "../SearchableSelect";
import { masterCatalogService } from "../../services/masterCatalogService";
import { getImageUrl } from "../../utils/imageUtils";

interface ProductMasterProps {
  addArticle: (article: Article) => void;
  updateArticle?: (article: Article) => void;
  editingId?: string | null;
  onCancelEdit?: () => void;
  onSuccess?: () => void;
}

const ProductMaster: React.FC<ProductMasterProps> = ({ 
  addArticle, 
  updateArticle,
  editingId, 
  onCancelEdit,
  onSuccess 
}) => {
  // Form State
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
    unitId: "",
    category: "",
    brand: "",
  });

  const [units, setUnits] = useState<any[]>([]);

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [dragIndex, setDragIndex] = useState<{ color: string; index: number } | null>(null);

  // Per-color media state
  const [colorMedia, setColorMedia] = useState<Record<string, { images: File[]; previews: string[] }>>({});

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
      const [catRes, brandRes, manufacturerRes, unitRes] = await Promise.all([
        masterCatalogService.listCategories(),
        masterCatalogService.listBrands(),
        masterCatalogService.listManufacturers(),
        masterCatalogService.listUnits(),
      ]);
      setCategories(catRes.data || []);
      setBrands(brandRes.data || []);
      setManufacturers(manufacturerRes.data || []);
      setUnits(unitRes.data || (Array.isArray(unitRes) ? unitRes : []));
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
          unitId: item.unitId?._id || item.unitId || "",
          category: item.categoryId?.name || item.categoryId || "",
          brand: item.brandId?.name || item.brandId || "",
        });

        if (item.productColors) setSelectedColors(item.productColors);
        if (item.sizeRanges) setSizeRanges(item.sizeRanges);

        if (item.colorMedia && item.colorMedia.length > 0) {
          const mediaMap: Record<string, { images: File[]; previews: string[] }> = {};
          item.colorMedia.forEach((cm: any) => {
            mediaMap[cm.color] = {
              images: [], // We don't have the File objects for existing images
              previews: cm.images?.map((img: any) => getImageUrl(img.url || img)) || [],
            };
          });
          setColorMedia(mediaMap);
        }
        
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
  }, [editingId, categories, brands, manufacturers, units]);

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

    // Initialize media state for new colors
    setColorMedia((prev) => {
      const next = { ...prev };
      let changed = false;
      selectedColors.forEach((color) => {
        if (!next[color]) {
          next[color] = { images: [], previews: [] };
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setVariants((prev) => {
      const newVariants: Variant[] = [];
      selectedColors.forEach((color) => {
        sizeRanges.forEach((range) => {
          const existing = prev.find(
            (v) => v.color === color && v.sizeRange === range
          );
          if (existing) {
            newVariants.push(existing);
          } else {
            newVariants.push({
              id: `var-${color}-${range}-${Date.now()}`,
              itemName: `${formData.artname || "Item"}-${color}-${range}`,
              sku: "",
              sizeSkus: {},
              color,
              sizeRange: range,
              costPrice: 0,
              sellingPrice: 0,
              mrp: formData.mrp || 0,
              hsnCode: formData.hsnCode || "",
              sizeQuantities: {},
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

  const copyToAll = (
    field: "costPrice" | "mrp",
    color: string
  ) => {
    if (variants.length === 0) return;

    const targetVariants = variants.filter((v) => v.color === color);
    if (targetVariants.length === 0) return;

    const firstVal = targetVariants[0][field];

    setVariants((prev) =>
      prev.map((v) => {
        if (v.color !== color) return v;
        return { ...v, [field]: firstVal };
      })
    );
  };

  const copySizeToAll = (color: string, size: string) => {
    const targetVariants = variants.filter((v) => v.color === color);
    if (targetVariants.length === 0) return;

    // Find first variant that has this size in its range
    const firstWithSize = targetVariants.find(v => parseSizeRange(v.sizeRange).includes(size));
    if (!firstWithSize) return;

    const val = firstWithSize.sizeQuantities[size] || 0;

    setVariants((prev) =>
      prev.map((v) => {
        if (v.color !== color || !parseSizeRange(v.sizeRange).includes(size)) return v;
        return {
          ...v,
          sizeQuantities: { ...v.sizeQuantities, [size]: val }
        };
      })
    );
  };


  const copyHsnToAll = (color: string) => {
    const targetVariants = variants.filter((v) => v.color === color);
    if (targetVariants.length === 0) return;
    const firstVal = targetVariants[0].hsnCode || "";

    setVariants((prev) =>
      prev.map((v) => {
        if (v.color !== color) return v;
        return { ...v, hsnCode: firstVal };
      })
    );
  };

  const toggleColorImage = (color: string, imageUrl: string) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.color !== color) return v;
        const currentImages = v.images || [];
        const newImages = currentImages.includes(imageUrl)
          ? currentImages.filter((img) => img !== imageUrl)
          : [...currentImages, imageUrl];
        return { ...v, images: newImages };
      })
    );
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  // --- Per-Color Image Helpers ---
  const handleColorImageChange = (color: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      const previews = files.map((f) => URL.createObjectURL(f));
      setColorMedia((prev) => {
        const current = prev[color] || { images: [], previews: [] };
        return {
          ...prev,
          [color]: {
            images: [...current.images, ...files],
            previews: [...current.previews, ...previews],
          },
        };
      });
      // Reset input
      e.target.value = "";
    }
  };

  const removeColorImage = (color: string, idx: number) => {
    setColorMedia((prev) => {
      const current = prev[color];
      if (!current) return prev;
      return {
        ...prev,
        [color]: {
          images: current.images.filter((_, i) => i !== idx),
          previews: current.previews.filter((_, i) => i !== idx),
        },
      };
    });
  };

  const handleColorImageDrop = (color: string, dropIdx: number) => {
    if (!dragIndex || dragIndex.color !== color || dragIndex.index === dropIdx) {
      setDragIndex(null);
      return;
    }

    setColorMedia((prev) => {
      const current = prev[color];
      if (!current) return prev;
      const newPreviews = [...current.previews];
      const newImages = [...current.images];
      
      const [movedPreview] = newPreviews.splice(dragIndex.index, 1);
      newPreviews.splice(dropIdx, 0, movedPreview);
      
      if (newImages.length > dragIndex.index) {
        const [movedFile] = newImages.splice(dragIndex.index, 1);
        newImages.splice(dropIdx, 0, movedFile);
      }
      
      return {
        ...prev,
        [color]: { images: newImages, previews: newPreviews },
      };
    });
    setDragIndex(null);
  };

  const setColorImageAsCover = (color: string, idx: number) => {
    if (idx === 0) return;
    setColorMedia((prev) => {
      const current = prev[color];
      if (!current) return prev;
      const newPreviews = [...current.previews];
      const newImages = [...current.images];
      
      const [movedPreview] = newPreviews.splice(idx, 1);
      newPreviews.unshift(movedPreview);
      
      if (newImages.length > idx) {
        const [movedFile] = newImages.splice(idx, 1);
        newImages.unshift(movedFile);
      }
      
      return {
        ...prev,
        [color]: { images: newImages, previews: newPreviews },
      };
    });
  };

 const addSizeRange = () => {
  const trimmed = sizeRangeInput.trim();

  // Regex for start-end format (e.g., 5-7, 10-12)
  const rangeRegex = /^\d+-\d+$/;

  if (trimmed && rangeRegex.test(trimmed)) {
    if (sizeRanges.includes(trimmed)) {
      return toast.error("Size range already exists");
    }

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
      const res = await masterCatalogService.createCategory(cat);
      // Backend returns { data: { _id, name, ... } }
      const newCat = res.data;
      if (newCat && newCat._id) {
        setCategories(prev => [...prev, newCat]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const categoryDoc = categories.find(c => (c.name || c) === cat);
    if (categoryDoc?._id) {
      try {
        await masterCatalogService.deleteCategory(categoryDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete category");
      }
    }
  };

  // Handlers for Brand
  const handleAddBrand = async (brand: string, categoryId?: string) => {
    try {
      const res = await masterCatalogService.createBrand(brand, categoryId);
      const newBrand = res.data;
      if (newBrand && newBrand._id) {
        setBrands(prev => [...prev, newBrand]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add brand");
    }
  };

  const handleDeleteBrand = async (brand: string) => {
    const brandDoc = brands.find(b => (b.name || b) === brand);
    if (brandDoc?._id) {
      try {
        await masterCatalogService.deleteBrand(brandDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete brand");
      }
    }
  };

  // Handlers for Manufacturer
  const handleAddManufacturer = async (man: string) => {
    try {
      const res = await masterCatalogService.createManufacturer(man);
      const newMan = res.data;
      if (newMan && newMan._id) {
        setManufacturers(prev => [...prev, newMan]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add manufacturer");
    }
  };

  const handleDeleteManufacturer = async (man: string) => {
    const manDoc = manufacturers.find(m => (m.name || m) === man);
    if (manDoc?._id) {
      try {
        await masterCatalogService.deleteManufacturer(manDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete manufacturer");
      }
    }
  };

  // Handlers for Unit
  const handleAddUnit = async (name: string) => {
    try {
      const res = await masterCatalogService.createUnit(name);
      const newUnit = res.data;
      if (newUnit && newUnit._id) {
        setUnits(prev => [...prev, newUnit]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add unit");
    }
  };

  const handleDeleteUnit = async (name: string) => {
    const unitDoc = units.find(u => (u.name || u) === name);
    if (unitDoc?._id) {
      try {
        await masterCatalogService.deleteUnit(unitDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete unit");
      }
    }
  };

  // Placeholder for any other taxonomy handlers

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
    setColorMedia((prev) => {
      const next = { ...prev };
      delete next[color];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.artname || !formData.category || !formData.brand) {
      return toast.error("Please fill all required fields");
    }

    const foundCategory = categories.find(c => (c.name || c) === formData.category);
    const categoryId = foundCategory?._id || foundCategory?.id;
    
    const foundBrand = brands.find(b => (b.name || b) === formData.brand);
    const brandId = foundBrand?._id || foundBrand?.id;
    
    const foundMan = manufacturers.find(m => (m.name || m) === formData.manufacturer);
    const manufacturerId = foundMan?._id || foundMan?.id;

    const foundUnit = units.find(u => (u.name || u) === formData.unit);
    const unitId = foundUnit?._id || foundUnit?.id;

    if (!categoryId || !brandId || !manufacturerId || !unitId) {
      return toast.error("One or more taxonomy IDs (Category/Brand/Manufacturer/Unit) were not found. Please re-select them.");
    }

    // Multiple of 24 validation for variants
    for (const v of variants) {
      const total = Object.values(v.sizeQuantities).reduce((sum, q) => sum + (q || 0), 0);
      if (total > 0 && total % 24 !== 0) {
        return toast.error(`Total quantity for variant "${v.itemName}" must be a multiple of 24 (Current: ${total})`);
      }
    }

    const data = new FormData();
    data.append("articleName", formData.artname);
    data.append("soleColor", formData.soleColor);
    data.append("mrp", formData.mrp.toString());
    data.append("gender", formData.gender);
    data.append("categoryId", categoryId);
    data.append("brandId", brandId);
    data.append("manufacturerCompanyId", manufacturerId);
    data.append("unitId", unitId);
    data.append("stage", formData.status);
    if (formData.status === "WISHLIST") {
      data.append("expectedAvailableDate", formData.wishlistDate);
    }

    data.append("productColors", JSON.stringify(selectedColors));
    data.append("sizeRanges", JSON.stringify(sizeRanges));

    // Normalize variants for backend
    const normalizedVariants = variants.map((v) => ({
      _id: v.id?.startsWith('var-') ? undefined : v.id, // Only send if it's a real DB ID, not a temporary one
      itemName: v.itemName,
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice || 0,
      mrp: v.mrp,
      hsnCode: v.hsnCode,
      color: v.color,
      sizeRange: v.sizeRange,
      sizeQuantities: v.sizeQuantities || {},
      sizeSkus: v.sizeSkus || {},
    }));
    data.append("variants", JSON.stringify(normalizedVariants));

    // Append all images per color
    Object.entries(colorMedia).forEach(([color, media]) => {
      // Backend expects images for each color. For existing images (URLs), we might need a way to tell which ones to keep.
      // However, the current backend `update` logic for `colorMedia` is:
      // if hasNewColorImages AND replaceColorMedia is true -> replace all.
      // if hasNewColorImages AND replaceColorMedia is false -> append.
      // If no new images are uploaded for a color, it stays as is unless we send something else.
      
      media.images.forEach((file) => {
        data.append(`images_${color}`, file);
      });
    });

    // If we are editing and want to replace images, we should send replaceColorMedia: true if any new image is added
    if (editingId && Object.values(colorMedia).some(m => m.images.length > 0)) {
      data.append("replaceColorMedia", "true");
    }

    const savePromise = async () => {
      if (editingId) {
        const res = await masterCatalogService.updateMasterItem(editingId, data);
        const item = res.data || res;

        // Map backend item to Article type (consistent with App.tsx fetchArticles logic)
        const normalizedVariants = (item.variants || []).map((v: any) => {
          const sizeSkus: Record<string, string> = {};
          const sizeQuantities: Record<string, number> = {};
          if (v.sizeMap) {
            Object.entries(v.sizeMap).forEach(([sz, cell]: [string, any]) => {
              sizeSkus[sz] = cell.sku || "";
              sizeQuantities[sz] = cell.qty || 0;
            });
          }
          return {
            ...v,
            id: v._id,
            sizeSkus,
            sizeQuantities,
          };
        });

        const mappedArticle: Article = {
          id: item._id,
          sku: item.sku || "",
          name: item.articleName,
          category: item.gender,
          assortmentId: item.assortmentId || "",
          productCategory: item.categoryId?.name,
          brand: item.brandId?.name,
          pricePerPair: item.variants?.[0]?.sellingPrice || item.mrp,
          mrp: item.mrp,
          soleColor: item.soleColor,
          manufacturer: item.manufacturerCompanyId?.name,
          unit: item.unitId?.name,
          status: item.stage,
          expectedDate: item.expectedAvailableDate
            ? new Date(item.expectedAvailableDate).toISOString().split("T")[0]
            : "",
          imageUrl: item.primaryImage?.url,
          secondaryImages: item.secondaryImages || [],
          selectedSizes: item.sizeRanges || [],
          selectedColors: item.productColors || [],
          colorMedia: item.colorMedia || [],
          variants: normalizedVariants,
          isActive: item.isActive !== false,
        };

        if (updateArticle) updateArticle(mappedArticle);
        if (onSuccess) onSuccess();
        if (onCancelEdit) onCancelEdit();
      } else {
        await masterCatalogService.createMasterItem(data);
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
          unitId: "",
          category: "",
          brand: "",
        });
        setSelectedSizes([]);
        setSelectedColors([]);
        setSizeRanges([]);
        setVariants([]);
      }
    };

    setLoading(true);
    const promise = savePromise();
    toast.promise(promise, {
      loading: editingId ? "Updating product..." : "Creating product...",
      success: editingId ? "Product Updated Successfully!" : "Product Created Successfully!",
      error: (err: any) => err.message || "Failed to save product",
    });
    promise.finally(() => setLoading(false));
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
                      disabled={loading}
                      placeholder="e.g. Urban Runner X1"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-800 disabled:opacity-50"
                      value={formData.artname}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, artname: val.charAt(0).toUpperCase() + val.slice(1) });
                      }}
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
                    options={brands
                      .filter((b) => {
                        if (!formData.category) return true;
                        const cat = categories.find(c => (c.name || c) === formData.category);
                        return !b.categoryId || b.categoryId._id === cat?._id || b.categoryId === cat?._id;
                      })
                      .map((b) => b.name || b)
                    }
                    value={formData.brand}
                    onChange={(val) => setFormData({ ...formData, brand: val })}
                    onAdd={(brand) => {
                      const cat = categories.find(c => (c.name || c) === formData.category);
                      return handleAddBrand(brand, cat?._id);
                    }}
                    onDelete={handleDeleteBrand}
                    placeholder={formData.category ? "Select Brand" : "Select Category first"}
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
                      <SearchableSelect
                        label="Base Unit"
                        options={units.map((u) => u.name || u)}
                        value={formData.unit}
                        onChange={(val) => {
                          setFormData({ 
                            ...formData, 
                            unit: val 
                          });
                        }}
                        onAdd={handleAddUnit}
                        onDelete={handleDeleteUnit}
                        placeholder="Select Unit"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Col 3: Status (3 cols) - Media removed as it is now per-color */}
            <div className="lg:col-span-3 flex flex-col gap-8">
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

          {/* ===== VARIANTS TABLES (Grouped by Color) ===== */}
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
                {selectedColors.map(
                  (color) => {
                    const colorVariants = variants.filter(
                      (v) => v.color === color
                    );
                    if (colorVariants.length === 0) return null;

                    const colorSizes = Array.from(
                      new Set(
                        colorVariants.flatMap((v) => parseSizeRange(v.sizeRange || ""))
                      )
                    ).sort((a, b) => Number(a) - Number(b));

                    return (
                      <div key={color} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-slate-100"></div>
                          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Color: {color}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">
                              ({colorVariants.length} items)
                            </span>
                          </div>
                          <div className="h-px flex-1 bg-slate-100"></div>
                        </div>

                        {/* Per-Color Media Management */}
                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-dashed border-slate-200">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <ImageIcon size={18} className="text-indigo-500" />
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Media for {color}</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(`file-input-${color}`) as HTMLInputElement;
                                if (input) input.click();
                              }}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5"
                            >
                              <Plus size={12} /> Add Images
                            </button>
                            <input
                              id={`file-input-${color}`}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleColorImageChange(color, e)}
                            />
                          </div>
                          
                          {(colorMedia[color]?.previews.length || 0) > 0 ? (
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                              {colorMedia[color].previews.map((src, idx) => (
                                <div
                                  key={idx}
                                  draggable
                                  onDragStart={() => setDragIndex({ color, index: idx })}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => handleColorImageDrop(color, idx)}
                                  className={`relative group rounded-xl border-2 overflow-hidden transition-all cursor-grab active:cursor-grabbing ${
                                    dragIndex?.color === color && dragIndex?.index === idx
                                      ? "border-indigo-400 opacity-50 scale-95"
                                      : idx === 0
                                      ? "border-indigo-500 shadow-md shadow-indigo-500/10"
                                      : "border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  <img
                                    src={src}
                                    className="w-full aspect-square object-cover"
                                    alt={`Preview ${idx + 1}`}
                                    draggable={false}
                                  />
                                  {/* Cover badge */}
                                  {idx === 0 && (
                                    <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[7px] font-bold shadow-lg">
                                      <Star size={7} fill="currentColor" /> Cover
                                    </div>
                                  )}
                                  
                                  {/* Hover Actions */}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                    {idx !== 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setColorImageAsCover(color, idx)}
                                        className="p-1 bg-white text-indigo-600 rounded-lg hover:bg-slate-50 transition-all"
                                        title="Set as cover"
                                      >
                                        <ArrowUp size={10} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeColorImage(color, idx)}
                                      className="p-1 bg-white text-rose-500 rounded-lg hover:bg-slate-50 transition-all"
                                      title="Remove"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>

                                  {/* Index badge */}
                                  <div className="absolute bottom-1 right-1 px-1 bg-black/50 backdrop-blur-sm text-white rounded-md text-[7px] font-bold">
                                    {idx + 1}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div 
                              onClick={() => {
                                const input = document.getElementById(`file-input-${color}`) as HTMLInputElement;
                                if (input) input.click();
                              }}
                              className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                            >
                              <div className="p-3 bg-white rounded-full shadow-sm border border-slate-100 text-slate-400 group-hover:text-indigo-500 mb-2">
                                <ImageIcon size={20} />
                              </div>
                              <p className="text-[10px] text-slate-500 font-bold group-hover:text-indigo-600">Click to upload images for {color}</p>
                              <p className="text-[8px] text-slate-400 mt-1">First image will be the cover image</p>
                            </div>
                          )}
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                          <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">#</th>
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Item Variation Name</th>
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">
                                  <div className="flex flex-col gap-1 text-indigo-600">
                                    <span>Cost Price (₹)</span>
                                    <button
                                      type="button"
                                      onClick={() => copyToAll("costPrice", color)}
                                      className="flex items-center gap-1 text-[9px] hover:text-indigo-800 transition-colors uppercase"
                                    >
                                      <ArrowUp size={10} className="rotate-180" /> Copy All
                                    </button>
                                  </div>
                                </th>
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">
                                  <div className="flex flex-col gap-1 text-indigo-600">
                                    <span>MRP (₹)</span>
                                    <button
                                      type="button"
                                      onClick={() => copyToAll("mrp", color)}
                                      className="flex items-center gap-1 text-[9px] hover:text-indigo-800 transition-colors uppercase"
                                    >
                                      <ArrowUp size={10} className="rotate-180" /> Copy All
                                    </button>
                                  </div>
                                </th>
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32 text-center">
                                  <div className="flex flex-col gap-1 text-indigo-600">
                                    <span>HSN</span>
                                    <button
                                      type="button"
                                      onClick={() => copyHsnToAll(color)}
                                      className="flex items-center gap-1 text-[9px] hover:text-indigo-800 transition-colors uppercase justify-center"
                                    >
                                      <ArrowUp size={10} className="rotate-180" /> Apply
                                    </button>
                                  </div>
                                </th>
                                {colorSizes.map((size) => (
                                  <th key={size} className="px-3 py-4 text-[11px] font-bold text-indigo-700 uppercase tracking-wider w-20 text-center border-l border-slate-100 bg-indigo-50/30">
                                    <div className="flex flex-col gap-1">
                                      <span>Size {size}</span>
                                      <button
                                        type="button"
                                        onClick={() => copySizeToAll(color, size)}
                                        className="flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 transition-colors uppercase justify-center"
                                      >
                                        <ArrowUp size={10} className="rotate-180" /> Apply
                                      </button>
                                    </div>
                                  </th>
                                ))}
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-24 text-center">Total Pairs</th>
                                <th className="px-4 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {colorVariants.map((v, idx) => {
                                const sizesInRange = parseSizeRange(v.sizeRange || "");
                                return (
                                  <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-4 py-4 text-xs font-bold text-slate-400 text-center">{idx + 1}</td>
                                    <td className="px-4 py-4">
                                      <div className="flex flex-col gap-1">
                                        <input
                                          type="text"
                                          disabled={loading}
                                          className="w-full text-xs font-bold text-slate-700 bg-transparent border-none outline-none focus:ring-1 focus:ring-indigo-500/50 rounded p-1"
                                          value={v.itemName}
                                          onChange={(e) => updateVariantField(v.id, "itemName", e.target.value)}
                                        />
                                        <span className="text-[10px] text-slate-400 font-medium px-1 italic">Range: {v.sizeRange}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4">
                                      <input
                                        type="number"
                                        className="w-full p-2 text-xs font-bold text-indigo-600 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={v.costPrice || ""}
                                        onChange={(e) => updateVariantField(v.id, "costPrice", Number(e.target.value))}
                                      />
                                    </td>
                                    <td className="px-4 py-4">
                                      <input
                                        type="number"
                                        className="w-full p-2 text-xs font-bold text-indigo-600 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={v.mrp || ""}
                                        onChange={(e) => updateVariantField(v.id, "mrp", Number(e.target.value))}
                                      />
                                    </td>
                                    <td className="px-4 py-4">
                                      <input
                                        type="text"
                                        className="w-full p-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={v.hsnCode}
                                        onChange={(e) => updateVariantField(v.id, "hsnCode", e.target.value)}
                                      />
                                    </td>
                                    {colorSizes.map((size) => {
                                      const isAvailable = sizesInRange.includes(size);
                                      return (
                                        <td key={size} className={`px-2 py-4 border-l border-slate-100 ${!isAvailable ? 'bg-slate-50/50' : ''}`}>
                                          {isAvailable ? (
                                            <input
                                              type="number"
                                              placeholder="Qty"
                                              className="w-full p-2 text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                                              value={v.sizeQuantities[size] || ""}
                                              onChange={(e) => {
                                                const newQtys = { ...v.sizeQuantities, [size]: Number(e.target.value) };
                                                updateVariantField(v.id, "sizeQuantities", newQtys);
                                              }}
                                            />
                                          ) : (
                                            <div className="flex items-center justify-center">
                                              <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                                            </div>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-4 py-4 text-center">
                                      {(() => {
                                        const total = Object.values(v.sizeQuantities).reduce((sum, q) => sum + (q || 0), 0);
                                        const isGood = total === 0 || total % 24 === 0;
                                        return (
                                          <div className={`text-xs font-black ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {total}
                                            {!isGood && <p className="text-[8px] font-medium leading-tight">Must be ÷24</p>}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => removeVariant(v.id)}
                                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
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
