import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Package,
  Tag,
  Image as ImageIcon,
  Layers,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Factory,
  Trash2,
  Grid3X3,
  Star,
  ArrowUp,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
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
  initialArticle?: Article;
}

type SizeRangeEntry = {
  id: string;
  label: string;
};

// Every size is always keyed as a plain unpadded number ("1", "2", not "01",
// "02") — this applies to every range shape (normal and kids wrap-around
// alike). Older/dirty data that got zero-padded is remapped back to the
// plain form here so it matches the columns this page renders.
function remapToCanonicalSizeKeys<T>(
  data: Record<string, T> | undefined
): Record<string, T> {
  if (!data) return {};
  const remapped: Record<string, T> = {};
  Object.entries(data).forEach(([k, v]) => {
    const canonical = /^\d+$/.test(k) ? String(Number(k)) : k;
    remapped[canonical] = v;
  });
  return remapped;
}

const ProductMaster: React.FC<ProductMasterProps> = ({
  addArticle,
  updateArticle,
  editingId,
  onCancelEdit,
  onSuccess,
  initialArticle,
}) => {
  const isEditingDataLoaded = useRef(false);

  const [formData, setFormData] = useState({
    artname: "",
    soleColor: "",
    onlineMrp: 0,
    offlineMrp: 0,
    costPrice: 0,
    hsnCode: "",
    gender: AssortmentType.MEN,
    assortmentId: ASSORTMENTS[0].id,
    manufacturer: "",
    unit: "",
    unitId: "",
    category: "",
    brand: "",
  });

  const [units, setUnits] = useState<any[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [dragIndex, setDragIndex] = useState<{
    color: string;
    index: number;
  } | null>(null);

  const [colorMedia, setColorMedia] = useState<
    Record<string, { images: File[]; previews: string[] }>
  >({});
  const [imageUrlInputByColor, setImageUrlInputByColor] = useState<
    Record<string, string>
  >({});

  const [sizeRangeInput, setSizeRangeInput] = useState("");
  const [sizeRanges, setSizeRanges] = useState<SizeRangeEntry[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [excludedCombinations, setExcludedCombinations] = useState<Set<string>>(new Set());

  // ── Product Variants section: collapsible per-color groups + search ──
  const [collapsedColors, setCollapsedColors] = useState<Set<string>>(new Set());
  const [colorSearch, setColorSearch] = useState("");

  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const makeRangeId = () =>
    `sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  useEffect(() => {
    if (!editingId || !initialArticle || isEditingDataLoaded.current) return;
    
    // Optimistic Load: Populate from initialArticle immediately
    const populateFromArticle = (item: Article) => {
      setFormData({
        artname: item.name || "",
        soleColor: item.soleColor || "",
        onlineMrp: item.variants?.[0]?.onlineMrp || 0,
        offlineMrp: item.variants?.[0]?.offlineMrp || 0,
        costPrice: item.variants?.[0]?.costPrice || 0,
        hsnCode: item.variants?.[0]?.hsnCode || "",
        gender: item.category as AssortmentType || AssortmentType.MEN,
        assortmentId: item.assortmentId || ASSORTMENTS[0].id,
        manufacturer: item.manufacturer || "",
        unit: item.unit || "",
        unitId: (item as any).unitId?._id || (item as any).unitId || "",
        category: item.productCategory || "",
        brand: item.brand || "",
      });

      if (item.selectedColors) {
        setSelectedColors(item.selectedColors);
      }

      const normalizedSizeRanges: SizeRangeEntry[] = Array.isArray(item.selectedSizes)
        ? item.selectedSizes.map((r: any) => ({
            id: makeRangeId(),
            label: typeof r === "string" ? r : r?.label || "",
          }))
        : [];
      setSizeRanges(normalizedSizeRanges);

      if (item.variants) {
        const mappedVariants = item.variants.map((v: any) => ({
          ...v,
          id: v.id || v._id,
          sizeQuantities: remapToCanonicalSizeKeys(v.sizeQuantities),
          sizeSkus: remapToCanonicalSizeKeys(v.sizeSkus),
        }));
        setVariants(mappedVariants);

        const existingCombos = new Set(mappedVariants.map((v: any) => `${v.color}|||${v.sizeRange}`));
        const excludedSet = new Set<string>();
        (item.selectedColors || []).forEach((color: string) => {
          normalizedSizeRanges.forEach((rangeEntry) => {
            const key = `${color}|||${rangeEntry.label}`;
            if (!existingCombos.has(key)) excludedSet.add(key);
          });
        });
        setExcludedCombinations(excludedSet);
      }
    };

    populateFromArticle(initialArticle);
    // Note: We don't set isEditingDataLoaded.current = true here 
    // because we still want the background fetch to run and refresh with server data.
  }, [editingId, initialArticle]);

  useEffect(() => {
    if (!editingId) return;

    const loadArticle = async () => {
      try {
        setLoading(true);
        const res = await masterCatalogService.getMasterItem(editingId);
        const item = res.data || res;

        setFormData({
          artname: item.articleName || "",
          soleColor: item.soleColor || "",
          onlineMrp: item.variants?.[0]?.onlineMrp || 0,
          offlineMrp: item.variants?.[0]?.offlineMrp || 0,
          costPrice: item.variants?.[0]?.costPrice || 0,
          hsnCode: item.variants?.[0]?.hsnCode || "",
          gender: item.gender || AssortmentType.MEN,
          assortmentId: ASSORTMENTS[0].id,
          manufacturer:
            item.manufacturerCompanyId?.name || item.manufacturerCompanyId || "",
          unit: item.unitId?.name || item.unitId || "",
          unitId: item.unitId?._id || item.unitId || "",
          category: item.categoryId?.name || item.categoryId || "",
          brand: item.brandId?.name || item.brandId || "",
        });

        if (item.productColors) {
          setSelectedColors(item.productColors);
        }

        const normalizedSizeRanges: SizeRangeEntry[] = Array.isArray(
          item.sizeRanges
        )
          ? item.sizeRanges.map((r: any) => ({
              id: makeRangeId(),
              label: typeof r === "string" ? r : r?.label || "",
            }))
          : [];

        setSizeRanges(normalizedSizeRanges);

        if (item.colorMedia && item.colorMedia.length > 0) {
          const mediaMap: Record<
            string,
            { images: File[]; previews: string[] }
          > = {};
          item.colorMedia.forEach((cm: any) => {
            mediaMap[cm.color] = {
              images: [],
              // Keep the raw (server-relative) URL here, not the resolved
              // absolute one — this is what gets sent back on submit to tell
              // the backend which existing images the user kept vs removed,
              // so it has to match what's actually stored in colorMedia.url.
              // getImageUrl() is applied only at render time for the <img> tag.
              previews: cm.images?.map((img: any) => img.url || img) || [],
            };
          });
          setColorMedia(mediaMap);
        }

        if (item.variants && item.variants.length > 0) {
          const rangeUsageCount: Record<string, number> = {};

          const mappedVariants = item.variants.map((v: any) => {
            let sizeQuantities: Record<string, number> = v.sizeQuantities || {};
            let sizeSkus: Record<string, string> = v.sizeSkus || {};

            // Legacy Fallback: If new dedicated fields are missing, try to restore from sizeMap
            if (Object.keys(sizeQuantities).length === 0 && v.sizeMap) {
              sizeQuantities = {};
              sizeSkus = {};
              Object.entries(v.sizeMap).forEach(([size, data]: [string, any]) => {
                sizeQuantities[size] = data.qty || 0;
                sizeSkus[size] = data.sku || "";
              });
            }

            sizeQuantities = remapToCanonicalSizeKeys(sizeQuantities);
            sizeSkus = remapToCanonicalSizeKeys(sizeSkus);

            const label = v.sizeRange || "";
            const currentIndex = rangeUsageCount[label] || 0;
            rangeUsageCount[label] = currentIndex + 1;

            const matchingRangeEntries = normalizedSizeRanges.filter(
              (r) => r.label === label
            );

            const matchedRangeEntry =
              matchingRangeEntries[currentIndex] || matchingRangeEntries[0];

            return {
              id: v._id || `v-${Date.now()}-${Math.random()}`,
              sizeRangeId: matchedRangeEntry?.id || makeRangeId(),
              itemName: v.itemName,
              sku: v.sku || "",
              color: v.color,
              sizeRange: v.sizeRange,
              costPrice: v.costPrice || 0,
              sellingPrice: v.sellingPrice || 0,
              mrp: v.mrp || 0,
              onlineMrp: v.onlineMrp || 0,
              offlineMrp: v.offlineMrp || 0,
              hsnCode: v.hsnCode || "",
              sizeQuantities,
              sizeSkus,
              sizeMap: v.sizeMap || {},
            };
          });

          setVariants(mappedVariants);

          const existingCombos = new Set(mappedVariants.map((v) => `${v.color}|||${v.sizeRange}`));
          const excludedSet = new Set<string>();
          (item.productColors as string[]).forEach((color) => {
            normalizedSizeRanges.forEach((rangeEntry) => {
              const key = `${color}|||${rangeEntry.label}`;
              if (!existingCombos.has(key)) excludedSet.add(key);
            });
          });
          setExcludedCombinations(excludedSet);
        }

        isEditingDataLoaded.current = true;
      } catch (err) {
        console.error("Failed to load article for editing", err);
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [editingId]);

  const parseSizeRange = (range: string): string[] => {
    const parts = range.split("-").map((s) => s.trim());
    if (parts.length !== 2) return [range];
    const start = parseInt(parts[0]);
    const end = parseInt(parts[1]);
    if (isNaN(start) || isNaN(end)) return [range];

    if (start <= end) {
      const sizes: string[] = [];
      for (let i = start; i <= end; i++) sizes.push(String(i));
      return sizes;
    }

    // Kids wrap-around range, e.g. "11-1" or "13-4": sizes run start → 13
    // (child sizing), then wrap to 1 → end (junior sizing, plain unpadded
    // number — same as every other size).
    if (start >= 1 && start <= 13 && end >= 1 && end <= 13) {
      const sizes: string[] = [];
      for (let i = start; i <= 13; i++) sizes.push(String(i));
      for (let i = 1; i <= end; i++) sizes.push(String(i));
      return sizes;
    }

    return [range];
  };

  const getAllSizesFromRanges = useCallback((): string[] => {
    const allSizes = new Set<string>();
    sizeRanges.forEach((range) => {
      parseSizeRange(range.label).forEach((s) => allSizes.add(s));
    });
    return Array.from(allSizes).sort((a, b) => Number(a) - Number(b));
  }, [sizeRanges]);

  useEffect(() => {
    if (editingId && !isEditingDataLoaded.current) return;

    if (selectedColors.length === 0 || sizeRanges.length === 0) {
      setVariants([]);
      return;
    }

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
      // Track which existing variants have already been claimed by an
      // earlier (color, rangeEntry) pair this pass, so duplicate range
      // labels don't let two different rangeEntry ids both match the same
      // stored variant and silently drop the other one.
      const claimed = new Set<string>();

      selectedColors.forEach((color) => {
        sizeRanges.forEach((rangeEntry) => {
          // Match by color + sizeRange label only — sizeRangeId is a
          // client-generated id re-created on every load/edit and isn't
          // stable, so requiring it here caused existing variants (with
          // their sku/price/assortment) to go unmatched and get silently
          // replaced by a blank variant on routine master edits.
          const existing = prev.find(
            (v: any) =>
              v.color === color &&
              v.sizeRange === rangeEntry.label &&
              !claimed.has(v.id)
          );

          if (existing) {
            claimed.add(existing.id);
            newVariants.push({ ...existing }); // preserve user-edited itemName
          } else {
            const comboKey = `${color}|||${rangeEntry.label}`;
            if (excludedCombinations.has(comboKey)) return; // intentionally absent
            newVariants.push({
              id: `var-${color}-${rangeEntry.id}`,
              sizeRangeId: rangeEntry.id,
              itemName: formData.artname
                ? `${formData.artname}-${color}-${rangeEntry.label}`
                : `${color}-${rangeEntry.label}`,
              sku: "",
              sizeSkus: {},
              color,
              sizeRange: rangeEntry.label,
              costPrice: formData.costPrice || 0,
              sellingPrice: 0,
              mrp: formData.onlineMrp || 0,
              onlineMrp: formData.onlineMrp || 0,
              offlineMrp: formData.offlineMrp || 0,
              hsnCode: formData.hsnCode || "",
              sizeQuantities: {},
            });
          }
        });
      });

      // A (color, sizeRange label) combo can legitimately hold more than one
      // variant — e.g. same size-range, different SKU/assortment (see
      // CatalogueManager's makeVariantKey, which dedupes by SKU+assortment
      // only, not by color/sizeRange). The loop above claims at most one
      // variant per label since sizeRanges holds each label once; sweep any
      // leftover existing variants here so a second same-labeled variant
      // isn't silently dropped from the form (and deleted on save).
      const knownCombos = new Set(
        selectedColors.flatMap((color) =>
          sizeRanges.map((r) => `${color}|||${r.label}`)
        )
      );
      prev.forEach((v: any) => {
        if (claimed.has(v.id)) return;
        const comboKey = `${v.color}|||${v.sizeRange}`;
        if (!knownCombos.has(comboKey)) return; // its color/size-range was actually removed
        claimed.add(v.id);
        newVariants.push({ ...v });
      });

      return newVariants;
    });
    // Deliberately NOT depending on formData.artname/onlineMrp/offlineMrp/hsnCode — those are
    // only used as defaults for brand-new variants (read fresh via closure
    // whenever this does run); depending on them made routine edits to the
    // article's name/MRP/HSN rebuild the entire variants array and risk
    // dropping existing sku/price/assortment data if the match above missed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, selectedColors, sizeRanges, excludedCombinations]);

  const updateVariantField = (id: string, field: keyof Variant, value: any) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const copyToAll = (field: "costPrice" | "onlineMrp" | "offlineMrp", color: string) => {
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

    const firstWithSize = targetVariants.find((v) =>
      parseSizeRange(v.sizeRange).includes(size)
    );
    if (!firstWithSize) return;

    const val = firstWithSize.sizeQuantities[size] || 0;

    setVariants((prev) =>
      prev.map((v) => {
        if (v.color !== color || !parseSizeRange(v.sizeRange).includes(size)) {
          return v;
        }
        return {
          ...v,
          sizeQuantities: { ...v.sizeQuantities, [size]: val },
        };
      })
    );
  };

  const removeVariant = (id: string) => {
    const target = variants.find((v) => v.id === id);
    if (target) {
      setExcludedCombinations((prev) =>
        new Set([...prev, `${target.color}|||${target.sizeRange}`])
      );
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleColorImageChange = (
    color: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      e.target.value = "";
    }
  };

  // A pasted URL is added straight into `previews` alongside existing/kept
  // image URLs — submit already treats every non-blob preview as an image
  // to keep (see existingImagesByColor below), so a freshly-typed URL flows
  // through that exact same path with no separate tracking needed.
  const addColorImageUrl = (color: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter a valid http(s) image URL");
      return;
    }
    setColorMedia((prev) => {
      const current = prev[color] || { images: [], previews: [] };
      if (current.previews.includes(trimmed)) return prev;
      return {
        ...prev,
        [color]: { ...current, previews: [...current.previews, trimmed] },
      };
    });
  };

  const removeColorImage = (color: string, idx: number) => {
    setColorMedia((prev) => {
      const current = prev[color];
      if (!current) return prev;
      const removedPreview = current.previews[idx];
      // previews mixes blob (new file) and non-blob (existing/pasted URL)
      // entries, so its index doesn't line up with `images` (which only
      // holds new files) — only remove from `images` when the removed
      // preview actually has a file behind it, and find that file by
      // counting blob previews up to this point, not by the shared index.
      let images = current.images;
      if (removedPreview?.startsWith("blob:")) {
        const blobIdx = current.previews
          .slice(0, idx)
          .filter((p) => p.startsWith("blob:")).length;
        images = current.images.filter((_, i) => i !== blobIdx);
      }
      return {
        ...prev,
        [color]: {
          images,
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
    const rangeRegex = /^\d+-\d+$/;

    if (trimmed && rangeRegex.test(trimmed)) {
      setSizeRanges((prev) => [
        ...prev,
        {
          id: makeRangeId(),
          label: trimmed,
        },
      ]);
      setSizeRangeInput("");
    }
  };

  const addRangeForColor = (color: string, rangeLabel: string) => {
    if (!rangeLabel || !/^\d+-\d+$/.test(rangeLabel)) {
      toast.error("Invalid range format. Use e.g. 2-4");
      return;
    }
    const newEntry: SizeRangeEntry = { id: makeRangeId(), label: rangeLabel };
    setSizeRanges((prev) => [...prev, newEntry]);
    const otherColors = selectedColors.filter((c) => c !== color);
    if (otherColors.length > 0) {
      setExcludedCombinations((prev) => {
        const next = new Set(prev);
        otherColors.forEach((c) => next.add(`${c}|||${rangeLabel}`));
        return next;
      });
    }
  };

  const removeSizeRange = (id: string) => {
    const toRemove = sizeRanges.find((r) => r.id === id);
    if (toRemove) {
      setExcludedCombinations((prev) => {
        const next = new Set(prev);
        for (const key of next) {
          if (key.endsWith(`|||${toRemove.label}`)) next.delete(key);
        }
        return next;
      });
    }
    setSizeRanges((prev) => prev.filter((r) => r.id !== id));
  };

  const handleAddCategory = async (cat: string) => {
    try {
      const res = await masterCatalogService.createCategory(cat);
      const newCat = res.data;
      if (newCat && newCat._id) {
        setCategories((prev) => [...prev, newCat]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add category");
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const categoryDoc = categories.find((c) => (c.name || c) === cat);
    if (categoryDoc?._id) {
      try {
        await masterCatalogService.deleteCategory(categoryDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete category");
      }
    }
  };

  const handleAddBrand = async (brand: string, categoryId?: string) => {
    try {
      const res = await masterCatalogService.createBrand(brand, categoryId);
      const newBrand = res.data;
      if (newBrand && newBrand._id) {
        setBrands((prev) => [...prev, newBrand]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add brand");
    }
  };

  const handleDeleteBrand = async (brand: string) => {
    const brandDoc = brands.find((b) => (b.name || b) === brand);
    if (brandDoc?._id) {
      try {
        await masterCatalogService.deleteBrand(brandDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete brand");
      }
    }
  };

  const handleAddManufacturer = async (man: string) => {
    try {
      const res = await masterCatalogService.createManufacturer(man);
      const newMan = res.data;
      if (newMan && newMan._id) {
        setManufacturers((prev) => [...prev, newMan]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add manufacturer");
    }
  };

  const handleDeleteManufacturer = async (man: string) => {
    const manDoc = manufacturers.find((m) => (m.name || m) === man);
    if (manDoc?._id) {
      try {
        await masterCatalogService.deleteManufacturer(manDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete manufacturer");
      }
    }
  };

  const handleAddUnit = async (name: string) => {
    try {
      const res = await masterCatalogService.createUnit(name);
      const newUnit = res.data;
      if (newUnit && newUnit._id) {
        setUnits((prev) => [...prev, newUnit]);
      }
      await fetchTaxonomy();
    } catch (err: any) {
      toast.error(err.message || "Failed to add unit");
    }
  };

  const handleDeleteUnit = async (name: string) => {
    const unitDoc = units.find((u) => (u.name || u) === name);
    if (unitDoc?._id) {
      try {
        await masterCatalogService.deleteUnit(unitDoc._id);
        await fetchTaxonomy();
      } catch (err: any) {
        toast.error(err.message || "Failed to delete unit");
      }
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
    setColorMedia((prev) => {
      const next = { ...prev };
      delete next[color];
      return next;
    });
    setExcludedCombinations((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (key.startsWith(`${color}|||`)) next.delete(key);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.artname || !formData.category || !formData.brand) {
      return toast.error("Please fill all required fields");
    }

    const foundCategory = categories.find((c) => (c.name || c) === formData.category);
    const categoryId = foundCategory?._id || foundCategory?.id;

    const foundBrand = brands.find((b) => (b.name || b) === formData.brand);
    const brandId = foundBrand?._id || foundBrand?.id;

    const foundMan = manufacturers.find((m) => (m.name || m) === formData.manufacturer);
    const manufacturerId = foundMan?._id || foundMan?.id;

    const foundUnit = units.find((u) => (u.name || u) === formData.unit);
    const unitId = foundUnit?._id || foundUnit?.id;

    if (!categoryId || !brandId || !manufacturerId || !unitId) {
      return toast.error(
        "One or more taxonomy IDs (Category/Brand/Manufacturer/Unit) were not found. Please re-select them."
      );
    }

    for (const v of variants) {
      const total = Object.values(v.sizeQuantities).reduce(
        (sum, q) => sum + (q || 0),
        0
      );
      if (total > 0 && total % 24 !== 0) {
        return toast.error(
          `Total quantity for variant "${v.itemName}" must be a multiple of 24 (Current: ${total})`
        );
      }
      // Carton SKU is mandatory for every variant, not just ones with
      // stock — a blank SKU is never allowed to save.
      if (!v.sku?.trim()) {
        return toast.error(
          `Carton SKU is required for variant "${v.itemName}" before it can be saved.`
        );
      }
    }

    const data = new FormData();
    data.append("articleName", formData.artname);
    data.append("soleColor", formData.soleColor);
    data.append("mrp", String(formData.onlineMrp || formData.offlineMrp || 0));
    data.append("gender", formData.gender);
    data.append("categoryId", categoryId);
    data.append("brandId", brandId);
    data.append("manufacturerCompanyId", manufacturerId);
    data.append("unitId", unitId);

    data.append("productColors", JSON.stringify(selectedColors));
    data.append("sizeRanges", JSON.stringify(sizeRanges.map((r) => r.label)));

    // HSN is a single product-wide value (edited once, at the top) — every
    // variant gets it applied uniformly at submit time, regardless of
    // whatever stale per-variant value it may still be carrying in state.
    const normalizedVariants = variants.map((v: any) => ({
      _id: v.id?.startsWith("var-") ? undefined : v.id,
      itemName: v.itemName,
      sku: v.sku || "",
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice || 0,
      mrp: v.onlineMrp || v.mrp || 0,
      onlineMrp: v.onlineMrp || 0,
      offlineMrp: v.offlineMrp || 0,
      hsnCode: formData.hsnCode || "",
      color: v.color,
      sizeRange: v.sizeRange,
      sizeRangeId: v.sizeRangeId || "",
      sizeQuantities: v.sizeQuantities || {},
      sizeSkus: v.sizeSkus || {},
      sizeMap: v.sizeMap || {},
    }));

    data.append("variants", JSON.stringify(normalizedVariants));

    Object.entries(colorMedia).forEach(([color, media]) => {
      media.images.forEach((file) => {
        data.append(`images_${color}`, file);
      });
    });

    if (editingId) {
      // Tell the backend exactly which pre-existing images survive this edit
      // (per color, in whatever order the user left them in) — this is what
      // lets a plain removal (no new file added) actually persist as blank,
      // instead of the backend silently keeping whatever was already there
      // because it only ever saw new uploads before.
      const existingImagesByColor: Record<string, string[]> = {};
      Object.entries(colorMedia).forEach(([color, media]) => {
        existingImagesByColor[color] = media.previews.filter(
          (p) => !p.startsWith("blob:")
        );
      });
      data.append("existingImagesByColor", JSON.stringify(existingImagesByColor));
    }

    const savePromise = async () => {
      if (editingId) {
        const res = await masterCatalogService.updateMasterItem(editingId, data);
        const item = res.data || res;

        const normalizedSavedVariants = (item.variants || []).map((v: any) => {
          const sizeSkus: Record<string, string> = v.sizeSkus || {};
          const sizeQuantities: Record<string, number> = v.sizeQuantities || {};

          // Legacy Fallback
          if (Object.keys(sizeQuantities).length === 0 && v.sizeMap) {
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
          pricePerPair:
            item.variants?.[0]?.onlineMrp ||
            item.variants?.[0]?.sellingPrice ||
            item.mrp,
          mrp: item.mrp,
          soleColor: item.soleColor,
          manufacturer: item.manufacturerCompanyId?.name,
          unit: item.unitId?.name,
          imageUrl: item.primaryImage?.url,
          secondaryImages: item.secondaryImages || [],
          selectedSizes: item.sizeRanges || [],
          selectedColors: item.productColors || [],
          colorMedia: item.colorMedia || [],
          variants: normalizedSavedVariants,
          isActive: item.isActive !== false,
        };

        if (updateArticle) updateArticle(mappedArticle);
        if (onSuccess) onSuccess();
        if (onCancelEdit) onCancelEdit();

        const autoDeactivated = res.variantChanges?.autoDeactivated || [];
        if (autoDeactivated.length) {
          const labels = autoDeactivated
            .slice(0, 2)
            .map((variant: { label?: string }) => variant.label || "Variant")
            .join(", ");
          const remaining = autoDeactivated.length - 2;
          return `Product updated. Deactivated: ${labels}${remaining > 0 ? ` +${remaining} more` : ""}`;
        }

        return "Product Updated Successfully!";
      } else {
        await masterCatalogService.createMasterItem(data);
        if (onSuccess) onSuccess();

        setFormData({
          artname: "",
          soleColor: "",
          hsnCode: "",
          onlineMrp: 0,
          offlineMrp: 0,
          costPrice: 0,
          gender: AssortmentType.MEN,
          assortmentId: ASSORTMENTS[0].id,
          manufacturer: "",
          unit: "",
          unitId: "",
          category: "",
          brand: "",
        });
        setSelectedSizes([]);
        setSelectedColors([]);
        setSizeRanges([]);
        setVariants([]);
        setColorMedia({});
        setExcludedCombinations(new Set());
        return "Product Created Successfully!";
      }
    };

    setLoading(true);
    const promise = savePromise();

    toast.promise(promise, {
      loading: editingId ? "Updating product..." : "Creating product...",
      success: (message) => message,
      error: (err: any) => err.message || "Failed to save product",
    });

    promise.finally(() => setLoading(false));
  };

  const availableSizes = ["4", "5", "6", "7", "8", "9", "10", "11", "12"];

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all shadow-sm"
              title="Back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
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
      </div>

      <form
        id="product-form"
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-slate-200"
      >
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
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
                        setFormData({
                          ...formData,
                          artname: val.charAt(0).toUpperCase() + val.slice(1),
                        });
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
                            soleColor:
                              val.charAt(0).toUpperCase() + val.slice(1),
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        HSN Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 64029990"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-slate-800"
                        value={formData.hsnCode}
                        onChange={(e) =>
                          setFormData({ ...formData, hsnCode: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Online MRP <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 1999"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-indigo-700"
                        value={formData.onlineMrp || ""}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormData({ ...formData, onlineMrp: val });
                          setVariants((prev) =>
                            prev.map((v) => ({ ...v, onlineMrp: val, mrp: val }))
                          );
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Offline MRP
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 1999"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-indigo-700"
                        value={formData.offlineMrp || ""}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormData({ ...formData, offlineMrp: val });
                          setVariants((prev) =>
                            prev.map((v) => ({ ...v, offlineMrp: val }))
                          );
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Cost Price 
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 999"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-indigo-700"
                        value={formData.costPrice || ""}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormData({ ...formData, costPrice: val });
                          setVariants((prev) =>
                            prev.map((v) => ({ ...v, costPrice: val }))
                          );
                        }}
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
                          onClick={() => setFormData({ ...formData, gender: g })}
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
                          setCustomColor(
                            val.charAt(0).toUpperCase() + val.slice(1)
                          );
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
                            key={range.id}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            {range.label}
                            <X
                              size={12}
                              className="cursor-pointer text-slate-400 hover:text-rose-500 ml-1"
                              onClick={() => removeSizeRange(range.id)}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
                        const cat = categories.find(
                          (c) => (c.name || c) === formData.category
                        );
                        return (
                          !b.categoryId ||
                          b.categoryId._id === cat?._id ||
                          b.categoryId === cat?._id
                        );
                      })
                      .map((b) => b.name || b)}
                    value={formData.brand}
                    onChange={(val) => setFormData({ ...formData, brand: val })}
                    onAdd={(brand) => {
                      const cat = categories.find(
                        (c) => (c.name || c) === formData.category
                      );
                      return handleAddBrand(brand, cat?._id);
                    }}
                    onDelete={handleDeleteBrand}
                    placeholder={
                      formData.category ? "Select Brand" : "Select Category first"
                    }
                    required
                  />
                </div>

                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Factory size={16} className="text-indigo-500" /> Manufacturing
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
                            unit: val,
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

          </div>

          {variants.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6">
                <Layers size={16} className="text-indigo-500" />
                Product Variants
                <span className="ml-2 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {variants.length} total
                </span>
              </h3>

              {selectedColors.length > 4 && (
                    <div className="relative mb-4">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={colorSearch}
                        onChange={(e) => setColorSearch(e.target.value)}
                        placeholder="Search color..."
                        className="w-full sm:w-72 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  )}
                  <div className="space-y-4">
                {selectedColors
                  .filter((c) => c.toLowerCase().includes(colorSearch.trim().toLowerCase()))
                  .map((color) => {
                  const colorVariants = variants.filter((v) => v.color === color);
                  if (colorVariants.length === 0) return null;

                  const colorSizes = Array.from(
                    new Set(
                      colorVariants.flatMap((v) =>
                        parseSizeRange(v.sizeRange || "")
                      )
                    )
                  ).sort((a, b) => Number(a) - Number(b));

                  const isCollapsed = collapsedColors.has(color);
                  const imageCount = colorMedia[color]?.previews.length || 0;
                  const missingSku = colorVariants.some((v) => !v.sku?.trim());

                  return (
                    <div key={color} className="rounded-2xl border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCollapsedColors((prev) => {
                          const next = new Set(prev);
                          if (next.has(color)) next.delete(color);
                          else next.add(color);
                          return next;
                        })}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isCollapsed ? <ChevronRight size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                          <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">
                            {color}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 shrink-0">
                            ({colorVariants.length} items · {imageCount} img{imageCount === 1 ? "" : "s"})
                          </span>
                        </div>
                        {missingSku ? (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={10} /> Missing SKU
                          </span>
                        ) : (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={10} /> Complete
                          </span>
                        )}
                      </button>

                      {!isCollapsed && (
                      <div className="p-4 space-y-4">
                      <div className="bg-slate-50/50 p-6 rounded-2xl border border-dashed border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <ImageIcon size={18} className="text-indigo-500" />
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Media for {color}
                            </h4>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById(
                                `file-input-${color}`
                              ) as HTMLInputElement;
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

                        <div className="flex items-center gap-2 mb-4">
                          <input
                            type="text"
                            value={imageUrlInputByColor[color] || ""}
                            onChange={(e) =>
                              setImageUrlInputByColor((prev) => ({
                                ...prev,
                                [color]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addColorImageUrl(color, imageUrlInputByColor[color] || "");
                                setImageUrlInputByColor((prev) => ({ ...prev, [color]: "" }));
                              }
                            }}
                            placeholder="Paste image URL (https://...)"
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addColorImageUrl(color, imageUrlInputByColor[color] || "");
                              setImageUrlInputByColor((prev) => ({ ...prev, [color]: "" }));
                            }}
                            className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-all shadow-sm shrink-0"
                          >
                            Add URL
                          </button>
                        </div>

                        {(colorMedia[color]?.previews.length || 0) > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {colorMedia[color].previews.map((src, idx) => (
                              <div
                                key={idx}
                                draggable
                                onDragStart={() =>
                                  setDragIndex({ color, index: idx })
                                }
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => handleColorImageDrop(color, idx)}
                                className={`relative group rounded-xl border-2 overflow-hidden transition-all cursor-grab active:cursor-grabbing ${
                                  dragIndex?.color === color &&
                                  dragIndex?.index === idx
                                    ? "border-indigo-400 opacity-50 scale-95"
                                    : idx === 0
                                      ? "border-indigo-500 shadow-md shadow-indigo-500/10"
                                      : "border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <img
                                  src={getImageUrl(src)}
                                  className="w-full aspect-square object-cover"
                                  alt={`Preview ${idx + 1}`}
                                  draggable={false}
                                />

                                {idx === 0 && (
                                  <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[7px] font-bold shadow-lg">
                                    <Star size={7} fill="currentColor" /> Cover
                                  </div>
                                )}

                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                  {idx !== 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setColorImageAsCover(color, idx)
                                      }
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

                                <div className="absolute bottom-1 right-1 px-1 bg-black/50 backdrop-blur-sm text-white rounded-md text-[7px] font-bold">
                                  {idx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              const input = document.getElementById(
                                `file-input-${color}`
                              ) as HTMLInputElement;
                              if (input) input.click();
                            }}
                            className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                          >
                            <div className="p-3 bg-white rounded-full shadow-sm border border-slate-100 text-slate-400 group-hover:text-indigo-500 mb-2">
                              <ImageIcon size={20} />
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold group-hover:text-indigo-600">
                              Click to upload images for {color}
                            </p>
                            <p className="text-[8px] text-slate-400 mt-1">
                              First image will be the cover image
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="border border-slate-300 px-1.5 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-10 text-center">
                                #
                              </th>
                              <th className="border border-slate-300 px-2 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider min-w-[180px]">
                                <div className="flex flex-col gap-0.5">
                                  <span>Item Variation Name</span>
                                  <span className="text-indigo-500 normal-case font-semibold">Carton SKU <span className="text-rose-500">*</span></span>
                                </div>
                              </th>
                              <th className="border border-slate-300 px-2 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-24">
                                <div className="flex flex-col gap-1 text-indigo-600">
                                  <span>Cost Price</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToAll("costPrice", color)}
                                    className="flex items-center gap-1 text-[8px] hover:text-indigo-800 transition-colors uppercase"
                                  >
                                    <ArrowUp
                                      size={10}
                                      className="rotate-180"
                                    />{" "}
                                    Copy All
                                  </button>
                                </div>
                              </th>
                              <th className="border border-slate-300 px-2 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-24">
                                <div className="flex flex-col gap-1 text-indigo-600">
                                  <span>Online MRP</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToAll("onlineMrp", color)}
                                    className="flex items-center gap-1 text-[8px] hover:text-indigo-800 transition-colors uppercase"
                                  >
                                    <ArrowUp
                                      size={10}
                                      className="rotate-180"
                                    />{" "}
                                    Copy All
                                  </button>
                                </div>
                              </th>
                              <th className="border border-slate-300 px-2 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-24">
                                <div className="flex flex-col gap-1 text-indigo-600">
                                  <span>Offline MRP</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToAll("offlineMrp", color)}
                                    className="flex items-center gap-1 text-[8px] hover:text-indigo-800 transition-colors uppercase"
                                  >
                                    <ArrowUp
                                      size={10}
                                      className="rotate-180"
                                    />{" "}
                                    Copy All
                                  </button>
                                </div>
                              </th>

                              {colorSizes.map((size) => (
                                <th
                                  key={size}
                                  className="border border-slate-300 px-1.5 py-1.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider w-16 text-center bg-indigo-50/40"
                                >
                                  <div className="flex flex-col gap-1">
                                    <span>Size {size}</span>
                                    <button
                                      type="button"
                                      onClick={() => copySizeToAll(color, size)}
                                      className="flex items-center gap-1 text-[8px] text-indigo-600 hover:text-indigo-800 transition-colors uppercase justify-center"
                                    >
                                      <ArrowUp
                                        size={10}
                                        className="rotate-180"
                                      />{" "}
                                      Apply
                                    </button>
                                  </div>
                                </th>
                              ))}

                              <th className="border border-slate-300 px-1.5 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-20 text-center">
                                Total Pairs
                              </th>
                              <th className="border border-slate-300 px-1.5 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider w-12 text-center">
                                Actions
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {colorVariants.map((v, idx) => {
                              const sizesInRange = parseSizeRange(
                                v.sizeRange || ""
                              );

                              return (
                                <tr
                                  key={v.id}
                                  className="hover:bg-blue-50/40 transition-colors group"
                                >
                                  <td className="border border-slate-200 px-1.5 py-1 text-[10px] font-bold text-slate-400 text-center">
                                    {idx + 1}
                                  </td>

                                  <td className="border border-slate-200 p-0">
                                    <div className="flex flex-col">
                                      <input
                                        type="text"
                                        disabled={loading}
                                        className="w-full text-[10px] font-bold text-slate-700 bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1"
                                        value={v.itemName}
                                        onChange={(e) =>
                                          updateVariantField(
                                            v.id,
                                            "itemName",
                                            e.target.value
                                          )
                                        }
                                      />
                                      <span className="text-[9px] text-slate-400 font-medium px-1.5 italic">
                                        Range: {v.sizeRange}
                                      </span>
                                      {(() => {
                                        const skuMissing = !v.sku?.trim();
                                        return (
                                          <input
                                            type="text"
                                            disabled={loading}
                                            placeholder="Carton SKU e.g. ECH-BLK-M-5-8"
                                            className={`w-full text-[10px] font-bold bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1 ${
                                              skuMissing
                                                ? "text-rose-600 placeholder:text-rose-300"
                                                : "text-slate-700"
                                            }`}
                                            value={v.sku || ""}
                                            onChange={(e) =>
                                              updateVariantField(v.id, "sku", e.target.value)
                                            }
                                          />
                                        );
                                      })()}
                                    </div>
                                  </td>

                                  <td className="border border-slate-200 p-0">
                                    <input
                                      type="number"
                                      className="w-full h-full text-[10px] font-bold text-indigo-600 bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1.5"
                                      value={v.costPrice || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          v.id,
                                          "costPrice",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="border border-slate-200 p-0">
                                    <input
                                      type="number"
                                      className="w-full h-full text-[10px] font-bold text-indigo-600 bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1.5"
                                      value={v.onlineMrp || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          v.id,
                                          "onlineMrp",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>

                                  <td className="border border-slate-200 p-0">
                                    <input
                                      type="number"
                                      className="w-full h-full text-[10px] font-bold text-indigo-600 bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1.5"
                                      value={v.offlineMrp || ""}
                                      onChange={(e) =>
                                        updateVariantField(
                                          v.id,
                                          "offlineMrp",
                                          Number(e.target.value)
                                        )
                                      }
                                    />
                                  </td>

                                  {colorSizes.map((size) => {
                                    const isAvailable =
                                      sizesInRange.includes(size);

                                    return (
                                      <td
                                        key={size}
                                        className={`border border-slate-200 p-0 ${
                                          !isAvailable ? "bg-slate-50" : ""
                                        }`}
                                      >
                                        {isAvailable ? (
                                          <input
                                            type="number"
                                            placeholder="Qty"
                                            className="w-full h-full text-center text-[10px] font-bold text-slate-700 bg-transparent border-none outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500 px-1.5 py-1.5"
                                            value={v.sizeQuantities[size] || ""}
                                            onChange={(e) => {
                                              const newQtys = {
                                                ...v.sizeQuantities,
                                                [size]: Number(e.target.value),
                                              };
                                              updateVariantField(
                                                v.id,
                                                "sizeQuantities",
                                                newQtys
                                              );
                                            }}
                                          />
                                        ) : (
                                          <div className="flex items-center justify-center py-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}

                                  <td className="border border-slate-200 px-1.5 py-1 text-center">
                                    {(() => {
                                      const total = Object.values(
                                        v.sizeQuantities
                                      ).reduce((sum, q) => sum + (q || 0), 0);
                                      const isGood =
                                        total === 0 || total % 24 === 0;
                                      return (
                                        <div
                                          className={`text-[10px] font-black ${
                                            isGood
                                              ? "text-emerald-500"
                                              : "text-rose-500"
                                          }`}
                                        >
                                          {total}
                                          {!isGood && (
                                            <p className="text-[8px] font-medium leading-tight">
                                              Must be ÷24
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>

                                  <td className="border border-slate-200 px-1.5 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeVariant(v.id)}
                                      className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Add range only for this color */}
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          placeholder={`Add size range only for ${color} (e.g. 2-4)`}
                          className="flex-1 p-2 text-xs border border-dashed border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400 bg-slate-50"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addRangeForColor(color, (e.target as HTMLInputElement).value.trim());
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                        />
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Press Enter</span>
                      </div>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 md:px-8 flex justify-between items-center shrink-0">
          <p className="text-xs text-slate-400 font-medium hidden sm:block">
            Please review all details before saving. Required fields are marked
            with <span className="text-rose-500">*</span>
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {editingId && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all shadow-sm"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save as Draft
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none px-8 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>{editingId ? "Update Product" : "Save Product"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProductMaster;
