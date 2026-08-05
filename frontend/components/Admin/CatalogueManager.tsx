import React, { useState, useMemo,useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Image as ImageIcon,
  Tag,
  Layers,
  CheckCircle2,
  Heart,
  ArrowRightLeft,
  CalendarDays,
  Package,
  ChevronDown,
  Palette,
  Loader2,
  Upload,
  FileSpreadsheet,
  Download,
  Clock,
} from "lucide-react";
import { Article, AssortmentType } from "../../types";
import Switch from "../ui/Switch";
import { masterCatalogService } from "../../services/masterCatalogService";
import { getImageUrl } from "../../utils/imageUtils";
import { formatAssortment } from "../../utils/assortmentUtils";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

type CatalogStatus = "AVAILABLE" | "WISHLIST";

type CatalogueForm = {
  name: string;
  category: AssortmentType;
  onlineMrp: number;
  offlineMrp: number;
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
  onSuccess?: () => void;
  onAddNewMaster?: () => void;
}

// ─── CSV Types ──────────────────────────────────────────────────────────────────
interface CsvRow {
  name: string; color: string; size: string;
  sku_ctn?: string;
  online_mrp?: string; offline_mrp?: string;
  tag?: string;
  cost_price?: string; hsn?: string;
  gender?: string; category?: string; brand?: string; manufacturer?: string; unit?: string; image?: string;
  sole_color?: string; listing_status?: string; expected_date?: string;
  _isAutoRenamed?: boolean; // true when name was auto-suffixed due to assortment collision
  [key: string]: string | boolean | undefined;
}

// Flexible date parser — accepts DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, etc.
function parseFlexibleDate(input: string | undefined): string {
  if (!input?.trim()) return "";
  const s = input.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return s.replace(/\//g, "-").split("-").map((p, i) => i > 0 ? p.padStart(2, "0") : p).join("-");
  // DD/MM/YYYY or D/M/YYYY  (Indian slash = day first)
  const slashDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDMY) return `${slashDMY[3]}-${slashDMY[2].padStart(2, "0")}-${slashDMY[1].padStart(2, "0")}`;
  // DD-MM-YYYY (if first part ≤ 2 digits, third is 4 digits)
  const dashDMY = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashDMY) return `${dashDMY[3]}-${dashDMY[2].padStart(2, "0")}-${dashDMY[1].padStart(2, "0")}`;
  // DD.MM.YYYY
  const dotDMY = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotDMY) return `${dotDMY[3]}-${dotDMY[2].padStart(2, "0")}-${dotDMY[1].padStart(2, "0")}`;
  // Fallback: try native Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return s;
}

// ─── CSV Conflict Detection ───────────────────────────────────────────────────
// "skip"/"import" = user decision required; "info" = informational only, always imports
type ConflictResolution = "skip" | "import" | "info";
interface CsvConflict {
  key: string;  // groupKey "Name|||STAGE" for blocking; "⚠type:..." for info
  name: string;
  csvStage: "AVAILABLE" | "WISHLIST";
  type:
    | "db-cross-stage"      // DB has same name in opposite stage
    | "csv-both-stages"     // CSV has same name in both stages
    | "auto-rename"         // Name was auto-suffixed due to assortment collision
    | "duplicate-sku"       // Same sku_ctn used in multiple articles
    | "zero-mrp"            // Online/offline row has MRP = 0
    | "csv-duplicate-row";  // Exact duplicate rows in CSV (auto-merged)
  detail: string;
  resolution: ConflictResolution;
}

// Generate per-size SKUs from carton SKU — same 2-strategy logic as backend + VariantDetailsPage
// Strategy 1: if ctnSku ends with sizeRange (e.g. "amr-gry-7-11" ends with "7-11"), strip it
// Strategy 2: regex /^(.*)-\d+-\d+$/ — handles cases where sizeRange is empty/missing in DB
function generateSizeSkus(ctnSku: string, sizeRange: string, sizeKeys: string[]): Record<string, string> {
  if (!ctnSku || !sizeKeys.length) return {};
  const result: Record<string, string> = {};
  let base: string | null = null;
  if (sizeRange && ctnSku.endsWith(sizeRange)) {
    base = ctnSku.slice(0, ctnSku.length - sizeRange.length);
  }
  if (base === null) {
    const m = ctnSku.match(/^(.*)-\d+-\d+$/);
    if (m) base = m[1] + "-";
  }
  if (base !== null) {
    sizeKeys.forEach(sz => { result[sz] = `${base}${sz}`; });
  } else {
    sizeKeys.forEach(sz => { result[sz] = `${ctnSku}-${sz}`; });
  }
  return result;
}

// Assortment fingerprint — canonical sorted string of size:qty pairs
// Used to distinguish same-color/sizeRange variants with different per-size distributions
function assortFp(sizeQty: Record<string, number>): string {
  return Object.entries(sizeQty)
    .sort(([a], [b]) => sortSizeKey(a, b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

// Reads size_5, size_6 ... columns → { "5": 6, "6": 8 }
function extractSizeQty(row: CsvRow): Record<string, number> {
  const result: Record<string, number> = {};
  Object.keys(row).forEach(key => {
    const match = key.match(/^size_(\d+(?:\.\d+)?)$/);
    if (match && row[key]) {
      const qty = Number(row[key]);
      if (qty > 0) result[match[1]] = qty;
    }
  });
  return result;
}

// Kids-aware size sort: zero-padded junior sizes (01, 02) sort AFTER 13
function sortSizeKey(a: string, b: string): number {
  const aJunior = a.startsWith("0") && a.length === 2;
  const bJunior = b.startsWith("0") && b.length === 2;
  if (aJunior && !bJunior) return 1;
  if (!aJunior && bJunior) return -1;
  return Number(a) - Number(b);
}

function formatSizeQtyDisplay(row: CsvRow): string {
  const sizes = extractSizeQty(row);
  const entries = Object.entries(sizes).sort(([a], [b]) => sortSizeKey(a, b));
  if (!entries.length) return "—";
  return entries.map(([sz, qty]) => `${sz}→${qty}`).join(", ");
}

// RFC 4180 compliant CSV parser — handles quoted fields containing commas and escaped quotes ("")
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; }
          else { i++; break; }
        } else { field += line[i++]; }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = parseCsvRow(line);
    const row: any = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row as CsvRow;
  }).filter(r => r.name);
}

// function groupCsvByName(rows: CsvRow[]): Record<string, CsvRow[]> {
//   const g: Record<string, CsvRow[]> = {};
//   rows.forEach(r => { (g[r.name] = g[r.name] || []).push(r); });
//   return g;
// }

// Normalize listing_status → "WISHLIST" or "AVAILABLE"
// Accepts: wishlist, preorder, pre-order, pre_order, "pre order" → all = WISHLIST
function resolveStage(raw: string | undefined): "AVAILABLE" | "WISHLIST" {
  const s = (raw || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  return (s === "wishlist" || s === "preorder") ? "WISHLIST" : "AVAILABLE";
}

// Group by (name + stage) — key format: "ArticleName|||AVAILABLE" or "ArticleName|||WISHLIST"
// ALSO splits same-name groups where the same color+size appears with DIFFERENT assortments
// into separate masters: "ArticleName", "ArticleName2", "ArticleName3", etc. (not "ArticleName-2")
function groupCsvByNameAndStage(rows: CsvRow[]): Record<string, CsvRow[]> {
  // Step 1: basic grouping by name + stage
  const raw: Record<string, CsvRow[]> = {};
  rows.forEach(r => {
    const stage = resolveStage(r.listing_status as string | undefined);
    const key = `${r.name}|||${stage}`;
    (raw[key] = raw[key] || []).push(r);
  });

  const getVarKey = (r: CsvRow) =>
    `${(r.color || "").toLowerCase().trim()}|||${(r.size || "").trim()}`;

  // Step 2: for each group, detect assortment collisions and split into sub-groups
  const result: Record<string, CsvRow[]> = {};
  Object.entries(raw).forEach(([key, groupRows]) => {
    const [name, stage] = key.split("|||");

    // Assign each row to the first sub-group where its color+size isn't already taken
    // with a different assortment. Same color+size + same assortment = same variant (OK).
    const subGroups: CsvRow[][] = [];
    groupRows.forEach(r => {
      const vk = getVarKey(r);
      const fp = assortFp(extractSizeQty(r));
      let placed = false;
      for (const sg of subGroups) {
        const conflict = sg.some(
          x => getVarKey(x) === vk && assortFp(extractSizeQty(x)) !== fp
        );
        if (!conflict) { sg.push(r); placed = true; break; }
      }
      if (!placed) subGroups.push([r]);
    });

    // First sub-group keeps the original name; overflow groups get numeric suffix
    subGroups.forEach((sg, idx) => {
      const newName = idx === 0 ? name : `${name}${idx + 1}`;
      const renamed = sg.map(r =>
        idx === 0 ? r : { ...r, name: newName, _isAutoRenamed: true }
      );
      result[`${newName}|||${stage}`] = renamed;
    });
  });

  return result;
}

// BASE_URL removed in favor of getImageUrl utility

const CatalogueManager: React.FC<CatalogueManagerProps> = ({
  articles,
  addArticle,
  updateArticle,
  deleteArticle,
  onEditArticle,
  onViewVariant,
  expandedIds,
  setExpandedIds,
  onSuccess,
  onAddNewMaster,
}) => {
  const [activeTab, setActiveTab] = useState<CatalogStatus>("AVAILABLE");
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<string>("name_asc");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Infinite Scroll state ────────────────────────────────────────────────
  const BATCH_SIZE = 20; // 20 items per batch
  const [localArticles, setLocalArticles] = useState<Article[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useRef("");

  // ── CSV Import State ─────────────────────────────────────────────────────────
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2>(1); // 1=upload, 2=preview+import
  const [csvConflicts, setCsvConflicts] = useState<CsvConflict[]>([]);
  const [taxonomy, setTaxonomy] = useState<{ categories: any[]; brands: any[]; manufacturers: any[]; units: any[] }>({ categories: [], brands: [], manufacturers: [], units: [] });

  const loadTaxonomy = async () => {
    try {
      const [catRes, brandRes, manRes, unitRes] = await Promise.all([
        masterCatalogService.listCategories("?limit=1000"),
        masterCatalogService.listBrands(undefined, "?limit=1000"),
        masterCatalogService.listManufacturers("?limit=1000"),
        masterCatalogService.listUnits("?limit=1000"),
      ]);
      setTaxonomy({
        categories: catRes.data || [],
        brands: brandRes.data || [],
        manufacturers: manRes.data || [],
        units: unitRes.data || [],
      });
    } catch (e) {
      toast.error("Failed to load taxonomy. Please close and reopen the modal.");
    }
  };

  const openCsvModal = () => { setCsvOpen(true); setCsvStep(1); setCsvText(""); setCsvRows([]); setCsvConflicts([]); loadTaxonomy(); };
  const closeCsvModal = () => { setCsvOpen(false); setCsvRows([]); setCsvText(""); setCsvStep(1); setCsvConflicts([]); };

  const handleCsvParse = () => {
    const rawRows = parseCsv(csvText);
    if (!rawRows.length) return toast.error("No valid rows found. Check CSV format: name,sku,color,size,online_mrp,offline_mrp,tag,...");

    // Run grouping (which applies assortment-based splitting + auto-renaming)
    const groups = groupCsvByNameAndStage(rawRows);
    // Flatten back to rows — names may have been updated (e.g. "Nike-Air2")
    const processedRows = Object.values(groups).flat();

    // ── Conflict detection ──────────────────────────────────────────────────
    const conflicts: CsvConflict[] = [];

    // Check: same article name exists in opposite stage in DB
    Object.keys(groups).forEach(key => {
      const [name, stage] = key.split("|||");
      const opposite = stage === "AVAILABLE" ? "WISHLIST" : "AVAILABLE";
      const existsInOpposite = articles.some(
        a => a.name.trim().toLowerCase() === name.trim().toLowerCase() &&
             (a.status || "AVAILABLE") === opposite
      );
      if (existsInOpposite) {
        conflicts.push({
          key, name,
          csvStage: stage as "AVAILABLE" | "WISHLIST",
          type: "db-cross-stage",
          detail: `"${name}" already exists as ${opposite} in the database. Importing as ${stage} will create a duplicate cross-stage entry.`,
          resolution: "import",
        });
      }
    });

    // Check: same article name in both stages in this CSV
    const nameToKeys: Record<string, string[]> = {};
    Object.keys(groups).forEach(key => {
      const [name] = key.split("|||");
      (nameToKeys[name] = nameToKeys[name] || []).push(key);
    });
    Object.entries(nameToKeys).forEach(([name, keys]) => {
      if (keys.length > 1) {
        keys.forEach(key => {
          if (!conflicts.find(c => c.key === key && c.type === "db-cross-stage")) {
            conflicts.push({
              key, name,
              csvStage: key.split("|||")[1] as "AVAILABLE" | "WISHLIST",
              type: "csv-both-stages",
              detail: `"${name}" appears in both AVAILABLE and WISHLIST in this CSV.`,
              resolution: "import",
            });
          }
        });
      }
    });

    // ── A6: Auto-rename → conflict card (skip/import choice) ─────────────────
    const renamedGroups = Object.keys(groups).filter(k => groups[k].some(r => r._isAutoRenamed));
    renamedGroups.forEach(k => {
      const [name, stage] = k.split("|||");
      if (!conflicts.find(c => c.key === k)) {
        conflicts.push({
          key: k, name,
          csvStage: stage as "AVAILABLE" | "WISHLIST",
          type: "auto-rename",
          detail: `"${name}" was auto-renamed — the original article already had the same color+size with a different assortment distribution. Importing creates a new separate master. Skip to ignore and fix your CSV instead.`,
          resolution: "import",
        });
      }
    });

    // ── D1/D2: Zero MRP → info warning ────────────────────────────────────
    const zeroMrpByArticle: Record<string, string[]> = {};
    processedRows.forEach(r => {
      const tag = (r.tag || "online").toLowerCase().trim();
      const mrpVal = tag === "offline" ? Number(r.offline_mrp) : Number(r.online_mrp);
      if (!mrpVal || mrpVal <= 0) {
        const label = `${r.color} ${r.size} (${tag})`;
        (zeroMrpByArticle[r.name] = zeroMrpByArticle[r.name] || []).push(label);
      }
    });
    Object.entries(zeroMrpByArticle).forEach(([name, labels]) => {
      conflicts.push({
        key: `⚠zero:${name}`, name,
        csvStage: "AVAILABLE",
        type: "zero-mrp",
        detail: `"${name}" — ${labels.length} row(s) have MRP = 0: ${labels.join(", ")}. Check online_mrp / offline_mrp columns.`,
        resolution: "info",
      });
    });

    // ── D3: Duplicate sku_ctn across different articles → info warning ──────
    const skuToNames: Record<string, Set<string>> = {};
    processedRows.forEach(r => {
      if (!r.sku_ctn?.trim()) return;
      const sku = r.sku_ctn.trim();
      if (!skuToNames[sku]) skuToNames[sku] = new Set();
      skuToNames[sku].add(r.name.trim());
    });
    Object.entries(skuToNames).forEach(([sku, names]) => {
      if (names.size > 1) {
        conflicts.push({
          key: `⚠sku:${sku}`, name: sku,
          csvStage: "AVAILABLE",
          type: "duplicate-sku",
          detail: `SKU "${sku}" appears in multiple articles: ${Array.from(names).join(", ")}. Per-size SKUs will collide — fix the sku_ctn column.`,
          resolution: "info",
        });
      }
    });

    // ── A4: Duplicate CSV rows within same group → info warning ───────────
    Object.entries(groups).forEach(([key, groupRows]) => {
      const [name, stage] = key.split("|||");
      const seen = new Set<string>();
      const dups: string[] = [];
      groupRows.forEach(r => {
        const vk = `${(r.color || "").toLowerCase()}|||${(r.size || "").trim()}|||${assortFp(extractSizeQty(r))}|||${(r.tag || "online").toLowerCase()}`;
        if (seen.has(vk)) dups.push(`${r.color} ${r.size} (${r.tag || "online"})`);
        else seen.add(vk);
      });
      if (dups.length > 0) {
        conflicts.push({
          key: `⚠dup:${key}`, name,
          csvStage: stage as "AVAILABLE" | "WISHLIST",
          type: "csv-duplicate-row",
          detail: `"${name}" has ${dups.length} duplicate row(s) in CSV — auto-merged on import: ${Array.from(new Set(dups)).join(", ")}.`,
          resolution: "info",
        });
      }
    });

    setCsvConflicts(conflicts);
    setCsvRows(processedRows);
    setCsvStep(2);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const text = ev.target?.result as string; setCsvText(text); };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCsvImport = async () => {
    const groups = groupCsvByNameAndStage(csvRows);
    // Build set of group keys the user chose to SKIP
    const skippedKeys = new Set(
      csvConflicts.filter(c => c.resolution === "skip").map(c => c.key)
    );
    const keys = Object.keys(groups).filter(k => !skippedKeys.has(k));
    if (!keys.length) { toast.error("All groups skipped — nothing to import."); return; }
    setCsvLoading(true);

    const importPromise = async () => {
      // Local mutable copies so newly-created docs are reused within same import
      const localCats = [...taxonomy.categories];
      const localBrands = [...taxonomy.brands];
      const localMans = [...taxonomy.manufacturers];
      const localUnits = [...taxonomy.units];

      // Generic: find in list → try create → on 409 re-fetch → push to list
      const findOrCreate = async (
        list: any[],
        predicate: (i: any) => boolean,
        createFn: () => Promise<any>,
        fetchFn: () => Promise<any>
      ) => {
        let doc = list.find(predicate);
        if (!doc) {
          try {
            const res = await createFn();
            doc = res.data;
          } catch {
            // Already exists (409) or other — try fetching by name
            const res = await fetchFn();
            doc = (res.data || []).find(predicate);
          }
          if (doc) list.push(doc);
        }
        if (!doc) throw new Error("Could not find or create taxonomy item");
        return doc;
      };

      let created = 0;
      let skipped = 0;
      const warnings: string[] = [];

      for (const groupKey of keys) {
        // groupKey = "ArticleName|||AVAILABLE" or "ArticleName|||WISHLIST"
        const [name, groupStage] = groupKey.split("|||");
        const rows = groups[groupKey];
        const firstRow = rows[0];

        const gender = (firstRow.gender || "MEN").toUpperCase();
        const catName  = (firstRow.category     || "").trim();
        const brdName  = (firstRow.brand         || "").trim();
        const manName  = (firstRow.manufacturer  || "").trim();
        const unitName = (firstRow.unit          || "").trim();

        const catDoc = await findOrCreate(
          localCats,
          (i: any) => i.name?.toLowerCase() === catName.toLowerCase(),
          () => masterCatalogService.createCategory(catName),
          () => masterCatalogService.listCategories(`?q=${encodeURIComponent(catName)}&limit=10`)
        );

        // Brand requires categoryId — pass catDoc._id on create
        const brandDoc = await findOrCreate(
          localBrands,
          (i: any) => i.name?.toLowerCase() === brdName.toLowerCase() && String(i.categoryId) === String(catDoc._id),
          () => masterCatalogService.createBrand(brdName, catDoc._id),
          () => masterCatalogService.listBrands(catDoc._id, `?q=${encodeURIComponent(brdName)}&limit=10`)
        );

        const manDoc = await findOrCreate(
          localMans,
          (i: any) => i.name?.toLowerCase() === manName.toLowerCase(),
          () => masterCatalogService.createManufacturer(manName),
          () => masterCatalogService.listManufacturers(`?q=${encodeURIComponent(manName)}&limit=10`)
        );

        const unitDoc = await findOrCreate(
          localUnits,
          (i: any) => i.name?.toLowerCase() === unitName.toLowerCase(),
          () => masterCatalogService.createUnit(unitName),
          () => masterCatalogService.listUnits(`?q=${encodeURIComponent(unitName)}&limit=10`)
        );

        const colors = Array.from(new Set(rows.map(r => r.color).filter(Boolean)));
        const sizes  = Array.from(new Set(rows.map(r => r.size).filter(Boolean)));
        // Master MRP = max of each variant's effective MRP
        // For online items, only online_mrp matters; for offline, only offline_mrp matters
        const mrp = Math.max(...rows.map(r => {
          const t = (r.tag || "online").toLowerCase().trim();
          return t === "offline" ? (Number(r.offline_mrp) || 0) : (Number(r.online_mrp) || 0);
        }));

        // Build color → image URL map from CSV
        const colorImageUrls: Record<string, string> = {};
        rows.forEach(r => { if (r.color && r.image) colorImageUrls[r.color] = r.image; });

        // Build variants: each CSV row = one variant (no cartesian product)
        const buildVariant = (r: CsvRow) => {
          const sizeQuantities = extractSizeQty(r);
          const sizeMap: Record<string, { qty: number; sku: string }> = {};
          const ctnSku = r.sku_ctn?.trim() || "";
          const rawTag = (r.tag || "online").toLowerCase().trim();
          const tag = (["online", "offline"].includes(rawTag) ? rawTag : "online") as "online" | "offline";
          const onlineMrp  = Number(r.online_mrp)  || 0;
          const offlineMrp = Number(r.offline_mrp) || 0;
          // Tag-aware MRP: online items use online_mrp only; offline items use offline_mrp only
          // Absence of the other field has no impact
          const variantMrp = tag === "offline" ? offlineMrp : onlineMrp;
          // Auto-generate per-size SKUs from carton SKU
          const sizeSkus = generateSizeSkus(ctnSku, r.size, Object.keys(sizeQuantities));
          // sizeMap: initialize qty=0 (inventory populated via GRN)
          Object.keys(sizeQuantities).forEach(sz => {
            sizeMap[sz] = { qty: 0, sku: sizeSkus[sz] || "" };
          });
          return {
            itemName:    `${name}-${r.color}-${r.size}`,
            color:       r.color,
            sizeRange:   r.size,
            costPrice:   Number(r.cost_price) || 0,
            sellingPrice: 0,
            mrp:         variantMrp,
            hsnCode:     r.hsn?.trim() || "",
            sizeQuantities,
            sizeSkus,
            sizeMap,
            sku:         ctnSku,
            tag,
            onlineMrp,
            offlineMrp,
          };
        };

        // Variant uniqueness key: color + sizeRange + assortment + tag
        // Tag included so "Black 5-10 online" and "Black 5-10 offline" are treated as distinct variants
        const makeVariantKey = (r: CsvRow) =>
          `${(r.color || "").toLowerCase().trim()}|||${(r.size || "").trim()}|||${assortFp(extractSizeQty(r))}|||${(r.tag || "online").toLowerCase().trim()}`;

        // Deduplicate CSV rows before building variants (prevents duplicate variants in DB on new article create)
        const seenVariantKeys = new Set<string>();
        const variants = rows.filter(r => {
          if (!r.color || !r.size) return false;
          const vk = makeVariantKey(r);
          if (seenVariantKeys.has(vk)) return false;
          seenVariantKeys.add(vk);
          return true;
        }).map(buildVariant);

        const soleColor = firstRow.sole_color?.trim() || "";
        const stage = groupStage as "AVAILABLE" | "WISHLIST";
        // Flexible date: accept any format, convert to YYYY-MM-DD
        const expectedDate = parseFlexibleDate(firstRow.expected_date);

        // Match existing master by BOTH name AND stage
        const existingMaster = articles.find(
          a =>
            a.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            (a.status || "AVAILABLE") === stage
        );

        const fd = new FormData();
        fd.append("articleName", name);
        fd.append("mrp", String(mrp || 0));
        fd.append("gender", gender);
        fd.append("categoryId", catDoc._id);
        fd.append("brandId", brandDoc._id);
        fd.append("manufacturerCompanyId", manDoc._id);
        fd.append("unitId", unitDoc._id);
        fd.append("stage", stage);
        if (soleColor) fd.append("soleColor", soleColor);
        if (stage === "WISHLIST" && expectedDate) fd.append("expectedAvailableDate", expectedDate);
        if (Object.keys(colorImageUrls).length > 0) {
          fd.append("colorImageUrls", JSON.stringify(colorImageUrls));
        }

        if (existingMaster) {
          // ── Duplicate check: color + sizeRange + assortment + tag composite key ─
          // Same color + DIFFERENT sizeRange → new variant (OK)
          // Same color + same sizeRange + DIFFERENT assortment → new variant (OK, different product)
          // Same color + same sizeRange + same assortment + DIFFERENT tag → new variant (OK, online vs offline)
          // Same color + same sizeRange + same assortment + same tag → true duplicate (skip)
          const existingVariantKeys = new Set(
            (existingMaster.variants || []).map(v =>
              `${(v.color || "").toLowerCase().trim()}|||${(v.sizeRange || "").trim()}|||${assortFp(v.sizeQuantities || {})}|||${(v.tag || "online").toLowerCase()}`
            )
          );

          const duplicateRows = rows.filter(r => r.color && existingVariantKeys.has(makeVariantKey(r)));
          const newRows       = rows.filter(r => r.color && r.size && !existingVariantKeys.has(makeVariantKey(r)));

          const duplicateLabels = Array.from(new Set(
            duplicateRows.map(r => `${r.color} (${r.size})`)
          ));

          // All variants already exist → skip entirely
          if (newRows.length === 0) {
            skipped++;
            warnings.push(`"${name}" skipped — all variants already exist: ${duplicateLabels.join(", ")}`);
            continue;
          }

          // Some variants already exist → inform
          if (duplicateLabels.length > 0) {
            warnings.push(`"${name}" — skipped existing variants: ${duplicateLabels.join(", ")}`);
          }

          // ── Build variants ONLY for new color+sizeRange combos ──────
          const newVariantsOnly = newRows.filter(r => r.color && r.size).map(buildVariant);

          // ── Merge: preserve existing variants with their inventory ───
          const existingVariants = (existingMaster.variants || []).map(v => ({
            _id: v.id,
            itemName: v.itemName,
            color: v.color,
            sizeRange: v.sizeRange,
            costPrice: v.costPrice || 0,
            sellingPrice: v.sellingPrice || 0,
            mrp: v.mrp || 0,
            hsnCode: v.hsnCode || "",
            sizeQuantities: v.sizeQuantities || {},
            sizeSkus: v.sizeSkus || {},
            sizeMap: v.sizeMap || {},
            isActive: v.isActive !== false,
            tag: v.tag || "online",
            onlineMrp: v.onlineMrp || 0,
            offlineMrp: v.offlineMrp || 0,
            sku: v.sku || "",
          }));

          const allVariants = [...existingVariants, ...newVariantsOnly];
          const allColors = Array.from(new Set([
            ...(existingMaster.variants || []).map(v => v.color),
            ...newRows.map(r => r.color),
          ].filter(Boolean)));
          const allSizes = Array.from(new Set([
            ...(existingMaster.variants || []).map(v => v.sizeRange),
            ...newRows.map(r => r.size),
          ].filter(Boolean)));

          fd.append("productColors", JSON.stringify(allColors));
          fd.append("sizeRanges", JSON.stringify(allSizes));
          fd.append("variants", JSON.stringify(allVariants));
          await masterCatalogService.updateMasterItem(existingMaster.id, fd);

        } else {
          fd.append("productColors", JSON.stringify(colors));
          fd.append("sizeRanges", JSON.stringify(sizes));
          fd.append("variants", JSON.stringify(variants));
          await masterCatalogService.createMasterItem(fd);
        }
        created++;
      }
      return { created, skipped, warnings };
    };

    toast.promise(importPromise().finally(() => setCsvLoading(false)), {
      loading: `Importing ${keys.length} group(s)...`,
      success: (result: any) => {
        closeCsvModal();
        onSuccess?.();
        loadTaxonomy();
        // Show any warnings as separate toasts
        if (result.warnings?.length) {
          setTimeout(() => {
            result.warnings.forEach((w: string) =>
              toast.warning(w, { duration: 7000 })
            );
          }, 500);
        }
        const parts = [];
        if (result.created > 0) parts.push(`${result.created} imported`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (duplicate)`);
        return parts.join(" · ") || "Done";
      },
      error: (err: any) => err.message || "Import failed",
    });
  };

  const [formData, setFormData] = useState<CatalogueForm>({
    name: "",
    category: AssortmentType.MEN,
    onlineMrp: 0,
    offlineMrp: 0,
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
      // PERSIST TO BACKEND
      await masterCatalogService.updateMasterItemFields(article.id, {
        stage: "AVAILABLE",
        expectedAvailableDate: "",
      });
      // Update local state
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

  // ---------- Article mapping helper ----------
  const mapItem = (item: any): Article => {
    const normalizedVariants = (item.variants || []).map((v: any) => {
      const sizeSkus: Record<string, string> = v.sizeSkus || {};
      const sizeQuantities: Record<string, number> = v.sizeQuantities || {};
      if (Object.keys(sizeQuantities).length === 0 && v.sizeMap) {
        Object.entries(v.sizeMap).forEach(([sz, cell]: [string, any]) => {
          sizeSkus[sz] = cell.sku || "";
          sizeQuantities[sz] = cell.qty || 0;
        });
      }
      return { ...v, id: v._id || Math.random().toString(36).substr(2, 9), sizeSkus, sizeQuantities };
    });
    return {
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
  };

  // ---------- Backend-paginated data fetch ----------
  const fetchLocalArticles = useCallback(async (
    page: number,
    q: string,
    tab: CatalogStatus,
    append = false,
    gender = genderFilter,
    sort = sortOption,
  ) => {
    if (page === 1) setPageLoading(true);
    else setLoadingMore(true);
    try {
    
      const res = await masterCatalogService.listMasterItems({
        page,
        limit: BATCH_SIZE,
        q: q || undefined,
        stage: tab,
        gender: gender !== "ALL" ? gender : undefined,
        sort,
      });
      
      const mapped: Article[] = (res.data || []).map(mapItem);
      if (append) {
        setLocalArticles((prev) => [...prev, ...mapped]);
      } else {
        setLocalArticles(mapped);
      }
      const meta = res.meta || {};
      setTotalItems(meta.total ?? mapped.length);
      setHasMorePages(page < (meta.totalPages ?? 1));
    } catch (err) {
      console.error("Failed to fetch catalogue page", err);
    } finally {
      setPageLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, sortOption]);

  // Trigger fresh fetch when tab / gender / sort changes
  useEffect(() => {
    setCurrentPage(1);
    fetchLocalArticles(1, debouncedSearch.current, activeTab, false, genderFilter, sortOption);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, genderFilter, sortOption]);

  // Debounced search: 400ms delay, resets to page 1
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      debouncedSearch.current = searchTerm.trim();
      setCurrentPage(1);
      fetchLocalArticles(1, searchTerm.trim(), activeTab, false, genderFilter, sortOption);
    }, 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Real-time refresh on catalogRefetch socket event
  useEffect(() => {
    const handler = () => fetchLocalArticles(1, debouncedSearch.current, activeTab, false, genderFilter, sortOption);
    window.addEventListener("catalogRefetch", handler);
    return () => window.removeEventListener("catalogRefetch", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, genderFilter, sortOption]);

  // Load Next Page for Infinite Scroll (reactive pattern matching Shop.tsx)
  const loadNextPage = useCallback(() => {
    if (!hasMorePages || loadingMore || pageLoading) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    console.log(`[Catalogue Scroll] Loading page ${nextPage}`);
    fetchLocalArticles(nextPage, debouncedSearch.current, activeTab, true, genderFilter, sortOption);
  }, [currentPage, hasMorePages, loadingMore, pageLoading, activeTab, genderFilter, sortOption, fetchLocalArticles]);

  // Observer matches Shop.tsx precisely, re-binding on loading/page transitions
  useEffect(() => {
    if (!hasMorePages || loadingMore || pageLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "300px" }
    );
    const el = observerRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasMorePages, loadingMore, pageLoading, loadNextPage]);

  // Keep App-level articles in sync when a save/delete happens (so modals etc. work)
  const filteredMasters = localArticles;

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

      // Derive onlineMrp/offlineMrp from variants (not article.mrp which drifts)
      const variants: any[] = (article as any).variants || [];
      const onlineVariant = variants.find((v: any) => v.tag === "online" || v.tag === "ONLINE");
      const offlineVariant = variants.find((v: any) => v.tag === "offline" || v.tag === "OFFLINE");
      const fallbackMrp = Number((article as any).mrp || 0);
      const onlineMrp = Number(onlineVariant?.onlineMrp || onlineVariant?.mrp || fallbackMrp || 0);
      const offlineMrp = Number(offlineVariant?.offlineMrp || offlineVariant?.mrp || fallbackMrp || 0);

      setFormData({
        name: article.name || "",
        category: article.category,
        onlineMrp,
        offlineMrp,
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
        onlineMrp: 0,
        offlineMrp: 0,
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
    if (formData.onlineMrp <= 0 && formData.offlineMrp <= 0) return toast.error("At least one MRP (Online or Offline) must be > 0");
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
      onlineMrp: Number(formData.onlineMrp || 0),
      // @ts-ignore
      offlineMrp: Number(formData.offlineMrp || 0),
      // @ts-ignore
      mrp: Math.max(Number(formData.onlineMrp || 0), Number(formData.offlineMrp || 0)),
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
      setLoading(true);
      try {
        if (editingArticle) {
          // Direct backend persistence for quick-edit
          await masterCatalogService.updateMasterItemFields(editingArticle.id, {
            articleName: payload.name,
            gender: payload.category,
            onlineMrp: (payload as any).onlineMrp,
            offlineMrp: (payload as any).offlineMrp,
            mrp: (payload as any).mrp,
            sizeRanges: [payload.sizeRange],
            stage: payload.status,
            expectedAvailableDate: payload.expectedAvailableDate || null,
          });
          updateArticle(payload);
        } else {
          // For now follow existing pattern, though creation is usually via ProductMaster
          addArticle(payload);
        }
        setIsModalOpen(false);
        onSuccess?.();
      } catch (err: any) {
        console.error("Save failure:", err);
        throw new Error(err.message || "Failed to persist changes");
      } finally {
        setLoading(false);
      }
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
    return getImageUrl(url);
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
              {pageLoading ? "Loading…" : `${totalItems} Master${totalItems !== 1 ? "s" : ""}`} •{" "}
              <b>{activeTab === "AVAILABLE" ? "Available" : "Pre-Order"}</b>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <button
            onClick={openCsvModal}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-semibold text-sm hover:bg-emerald-100 transition-all"
          >
            <FileSpreadsheet size={16} /> Import CSV
          </button>
          {onAddNewMaster && (
            <button
              onClick={onAddNewMaster}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
            >
              <Plus size={16} /> Add New Master
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm flex gap-2">
        <button
          onClick={() => { setActiveTab("AVAILABLE"); setCurrentPage(1); }}
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
          onClick={() => { setActiveTab("WISHLIST"); setCurrentPage(1); }}
          className={`flex-1 px-4 py-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
            activeTab === "WISHLIST"
              ? "bg-amber-500 text-white shadow"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Clock size={16} />
          Pre-Order
        </button>
      </div>

      {/* Search + filters bar (same as distributor Shop) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            type="text"
            placeholder="Search article or SKU..."
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center justify-between md:justify-end">
          {/* Gender Filter Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            {["ALL", "MEN", "WOMEN", "KIDS"].map((g) => (
              <button
                key={g}
                onClick={() => setGenderFilter(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  genderFilter === g
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {g === "ALL" ? "All" : g.charAt(0) + g.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            <option value="default">Sort: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Master Articles List */}
      <div className="space-y-3">
        {pageLoading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <Loader2 className="mx-auto text-indigo-400 mb-3 animate-spin" size={32} />
            <p className="text-slate-400 font-medium text-sm">Loading catalogue…</p>
          </div>
        )}
        {!pageLoading && filteredMasters.length === 0 && (
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

          // Calculate price ranges (per-carton = per-pair × 24)
          const costPrices =
            article.variants
              ?.map((v) => v.costPrice || 0)
              .filter((p) => p > 0) || [];
          const mrpPrices =
            article.variants?.map((v) => v.mrp || 0).filter((p) => p > 0) || [];

          const formatCtnRange = (prices: number[], fallback: number) => {
            const pts = prices.length ? prices : fallback > 0 ? [fallback] : [];
            if (!pts.length) return { ctn: "—", pr: "—" };
            const min = Math.min(...pts) * 24;
            const max = Math.max(...pts) * 24;
            const minPr = Math.min(...pts);
            const maxPr = Math.max(...pts);
            return {
              ctn: min === max ? `₹${min.toLocaleString()}` : `₹${min.toLocaleString()} – ₹${max.toLocaleString()}`,
              pr: minPr === maxPr ? `₹${minPr.toLocaleString()}` : `₹${minPr.toLocaleString()} – ₹${maxPr.toLocaleString()}`,
            };
          };

          const costRange = formatCtnRange(costPrices, 0);
          const mrpRange = formatCtnRange(mrpPrices, article.mrp || 0);

          // Unique colors across variants
          const variantColors = Array.from(new Set(article.variants?.map(v => v.color).filter(Boolean)));

          // Master-level total stock
          const masterTotalPairs = article.variants?.reduce((s, v) =>
            s + Object.values(v.sizeMap || {}).reduce((ss: number, c: any) => ss + (Number(c?.qty) || 0), 0), 0) || 0;
          const masterTotalCtns = Math.floor(masterTotalPairs / 24);

          return (
            <div
              key={article.id}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all"
            >
              {/* Master Row */}
              <div
                className="flex items-center gap-4 p-4 md:ps-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5">
                    <StatItem label="Brand" value={article.brand || "Internal"} />
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] leading-tight">
                        <span className="font-black text-slate-400 uppercase tracking-widest">Cost </span>
                        <span className="font-black text-slate-700">{costRange.ctn}</span>
                        <span className="text-slate-400"> /ctn</span>
                        <span className="block text-[9px] text-slate-400">{costRange.pr}/pr</span>
                      </div>
                      <div className="text-[10px] leading-tight border-l border-slate-100 pl-2">
                        <span className="font-black text-slate-400 uppercase tracking-widest">MRP </span>
                        <span className="font-black text-indigo-700">{mrpRange.ctn}</span>
                        <span className="text-slate-400"> /ctn</span>
                        <span className="block text-[9px] text-slate-400">{mrpRange.pr}/pr</span>
                      </div>
                    </div>
                  </div>
                  {/* Color chips */}
                  {variantColors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {variantColors.map(c => (
                        <span key={c} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold border border-slate-200/60 uppercase tracking-wide">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Variant count badge */}
                <div className="hidden lg:block shrink-0 px-4 border-l border-slate-100">
                  <div className="text-center">
                    <span className="text-xl font-black text-green-600 block leading-tight">
                      {masterTotalCtns}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      ctn
                    </span>

                        <span className="block text-[9px] text-slate-400">{masterTotalPairs.toLocaleString()} pairs</span>
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
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all text-[10px] font-bold"
                      title="Move Pre-Order → Available Catalogue"
                    >
                      <ArrowRightLeft size={13} />
                      Make Available
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
                                  Stock
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
                                      {(() => {
                                        const colorMedia = article.colorMedia || [];
                                        const matched = colorMedia.find(cm => cm.color.toLowerCase() === v.color.toLowerCase());
                                        const vImg = (matched && matched.images && matched.images.length > 0) 
                                          ? matched.images[0].url 
                                          : article.imageUrl;
                                        
                                        return vImg ? (
                                          <img
                                            src={imgSrc(vImg)}
                                            alt={v.color}
                                            className="w-10 h-10 rounded-lg object-cover border border-slate-100"
                                          />
                                        ) : (
                                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-100">
                                            <ImageIcon size={16} className="text-slate-400" />
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="font-bold text-sm text-slate-800 truncate max-w-[220px]">
                                        {vName}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                        {v.sku || article.sku || ""} · {formatAssortment(v.sizeQuantities)}
                                      </p>
                                    </td>
                                    <td className="px-6 py-3">
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                        {/* <span
                                          className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                                          style={{
                                            backgroundColor:
                                              v.color?.toLowerCase() || "#ccc",
                                          }}
                                        /> */}
                                        {v.color || "—"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3">
                                      {(() => {
                                        const vPairs = Object.values(v.sizeMap || {}).reduce((s: number, c: any) => s + (Number(c?.qty) || 0), 0);
                                        const vCtns = Math.floor(vPairs / 24);
                                        return (
                                          <>
                                            <p className="text-sm font-bold text-emerald-600">{vCtns} <span className="text-[10px] font-normal text-slate-400">ctn</span></p>
                                            <p className="text-[10px] text-slate-400">{vPairs.toLocaleString()} pairs</p>
                                          </>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="text-sm font-bold text-slate-700">₹{((v.costPrice || 0) * 24).toLocaleString()}<span className="text-[10px] font-normal text-slate-400"> /ctn</span></p>
                                      <p className="text-[10px] text-slate-400">₹{(v.costPrice || 0).toLocaleString()}/pr</p>
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="text-sm font-bold text-indigo-700">₹{((v.mrp || 0) * 24).toLocaleString()}<span className="text-[10px] font-normal text-slate-400"> /ctn</span></p>
                                      <p className="text-[10px] text-slate-400">₹{(v.mrp || 0).toLocaleString()}/pr</p>
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
                                    {(() => {
                                      const colorMedia = article.colorMedia || [];
                                      const matched = colorMedia.find(cm => cm.color.toLowerCase() === v.color.toLowerCase());
                                      const vImg = (matched && matched.images && matched.images.length > 0) 
                                        ? matched.images[0].url 
                                        : article.imageUrl;

                                      return vImg ? (
                                        <img
                                          src={imgSrc(vImg)}
                                          alt={v.color}
                                          className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0"
                                        />
                                      ) : (
                                        <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-100 shrink-0">
                                          <ImageIcon size={20} className="text-slate-400" />
                                        </div>
                                      );
                                    })()}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-bold text-sm text-slate-800">
                                          {vName}
                                        </p>
                                        <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                          {v.sku || article.sku || ""} · {formatAssortment(v.sizeQuantities)}
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
                                        ₹{((v.mrp || 0) * 24).toLocaleString()}<span className="text-[9px] font-normal text-slate-400">/ctn</span>
                                      </span>
                                      {(() => {
                                        const vPairs = Object.values(v.sizeMap || {}).reduce((s: number, c: any) => s + (Number(c?.qty) || 0), 0);
                                        const vCtns = Math.floor(vPairs / 24);
                                        return (
                                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                            {vCtns} ctn · {vPairs} prs
                                          </span>
                                        );
                                      })()}
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

        {/* Infinite Scroll Sentinel */}
        {localArticles.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-4">
            {loadingMore && (
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                <Loader2 size={16} className="animate-spin" />
                Loading more items...
              </div>
            )}
            {!hasMorePages && (
              <p className="text-xs font-bold text-slate-400 border-t border-slate-100 w-full text-center pt-4">
                🎉 All {totalItems} items loaded
              </p>
            )}
            <div ref={observerRef} className="h-4 w-full" />
          </div>
        )}
      </div>

      {/* ── CSV Import Modal ─────────────────────────────────────────────────── */}
      {csvOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeCsvModal}>
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-emerald-600 p-5 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet size={20} /> Import Articles from CSV
              </h3>
              <button onClick={closeCsvModal} className="text-white/70 hover:text-white"><X size={22} /></button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
              {/* Step 1: Upload */}
              {csvStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-5 text-center">
                    <FileSpreadsheet size={36} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 mb-1">Upload CSV file or paste CSV text</p>
                    <p className="text-xs text-slate-400 mb-3">Columns: <code className="bg-slate-100 px-1 rounded">name, sku_ctn, color, size, online_mrp, offline_mrp, tag, cost_price, hsn, gender, category, brand, manufacturer, unit, image, sole_color, listing_status, expected_date, size_5 ... size_13, size_01, size_02 ...</code></p>
                    <a
                      href="/sample_catalog.csv"
                      download="sample_catalog.csv"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all mb-4"
                    >
                      <Download size={13} /> Download Sample CSV
                    </a>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-emerald-700 transition-all">
                      <Upload size={15} /> Choose CSV File
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileUpload} />
                    </label>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                    <p><b>Format:</b> First row = header. Same <code>name</code> ke multiple rows = same article, Different color variants.</p>
                    <p><b>sku_ctn</b> = carton-level SKU (e.g. <code>slk-blk-5-9</code> or <code>kid-pnk-11-03</code>). Per-size SKUs auto-generate honge. <b>tag</b> = <code>online</code> ya <code>offline</code>. <b>online_mrp</b> + <b>offline_mrp</b>.</p>
                    <p><b>Kids sizes</b>: <code>11-03</code> (11→12→13→01→02→03). CSV columns: <code>size_11</code>, <code>size_12</code>, <code>size_13</code>, <code>size_01</code>, <code>size_02</code>, <code>size_03</code>.</p>
                    <p><b>listing_status</b> = <code>available</code> ya <code>wishlist</code> ya <code>preorder</code>. <b>expected_date</b> = any format (DD/MM/YYYY, YYYY-MM-DD, etc.).</p>
                  </div>

                  <button
                    onClick={handleCsvParse}
                    disabled={!csvText.trim()}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    Parse & Continue →
                  </button>
                </div>
              )}

              {/* Step 2: Preview + Import */}
              {csvStep === 2 && (
                <div className="space-y-5">
                  <button onClick={() => setCsvStep(1)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                    ← Back
                  </button>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
                    {(() => {
                      const groups = groupCsvByNameAndStage(csvRows);
                      const names = Object.keys(groups).map(k => k.split("|||")[0]);
                      const autoRenamed = csvRows.filter(r => r._isAutoRenamed).length;
                      const addon = names.filter(n => articles.some(a => a.name.trim().toLowerCase() === n.trim().toLowerCase())).length;
                      const newCount = names.length - addon;
                      return (
                        <>
                          <b>{names.length} article(s)</b> ready to import ({csvRows.length} variant rows).
                          {addon > 0 && <span className="ml-1 text-amber-700 font-bold">{addon} existing will get new variants added.</span>}
                          {newCount > 0 && <span className="ml-1 text-emerald-700 font-bold">{newCount} will be created new.</span>}
                          {autoRenamed > 0 && <span className="ml-1 text-purple-700 font-bold">{autoRenamed} row(s) auto-renamed (different assortment).</span>}
                        </>
                      );
                    })()}
                  </div>

                  {/* ── Conflict Warnings ── */}
                  {csvConflicts.length > 0 && (
                    <div className="space-y-3">

                      {/* Blocking conflicts — user must decide skip or import */}
                      {(() => {
                        const blocking = Array.from(new Map(
                          csvConflicts.filter(c => c.resolution !== "info").map(c => [c.key, c])
                        ).values());
                        if (!blocking.length) return null;
                        return (
                          <div className="space-y-2">
                            <p className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                              ⚠ Conflicts — Decide per group
                            </p>
                            {blocking.map(conflict => (
                              <div
                                key={conflict.key}
                                className={`rounded-xl border p-3 text-xs flex items-start justify-between gap-3 ${
                                  conflict.type === "db-cross-stage"
                                    ? "bg-rose-50 border-rose-200 text-rose-800"
                                    : conflict.type === "auto-rename"
                                      ? "bg-purple-50 border-purple-200 text-purple-800"
                                      : "bg-amber-50 border-amber-200 text-amber-800"
                                }`}
                              >
                                <div className="flex-1">
                                  <p className="font-black text-[10px] uppercase tracking-wider mb-0.5 opacity-60">
                                    {conflict.type === "db-cross-stage" ? "DB Conflict"
                                      : conflict.type === "auto-rename" ? "Auto Renamed"
                                      : "Both Stages"}
                                  </p>
                                  <p className="leading-relaxed">{conflict.detail}</p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => setCsvConflicts(prev =>
                                      prev.map(c => c.key === conflict.key ? { ...c, resolution: "skip" } : c)
                                    )}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                      conflict.resolution === "skip"
                                        ? "bg-rose-500 text-white"
                                        : "bg-white border border-rose-300 text-rose-600 hover:bg-rose-50"
                                    }`}
                                  >Skip</button>
                                  <button
                                    onClick={() => setCsvConflicts(prev =>
                                      prev.map(c => c.key === conflict.key ? { ...c, resolution: "import" } : c)
                                    )}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                      conflict.resolution === "import"
                                        ? "bg-emerald-500 text-white"
                                        : "bg-white border border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                                    }`}
                                  >Import</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Info-only warnings — always import, just informational */}
                      {(() => {
                        const infoItems = csvConflicts.filter(c => c.resolution === "info");
                        if (!infoItems.length) return null;
                        return (
                          <div className="space-y-2">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
                              ℹ Warnings (import continues)
                            </p>
                            {infoItems.map(conflict => (
                              <div
                                key={conflict.key}
                                className={`rounded-xl border p-3 text-xs ${
                                  conflict.type === "duplicate-sku"
                                    ? "bg-orange-50 border-orange-200 text-orange-800"
                                    : conflict.type === "zero-mrp"
                                      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                                      : "bg-slate-50 border-slate-200 text-slate-500"
                                }`}
                              >
                                <p className="font-black text-[10px] uppercase tracking-wider mb-0.5 opacity-50">
                                  {conflict.type === "duplicate-sku" ? "Duplicate SKU"
                                    : conflict.type === "zero-mrp" ? "Zero MRP"
                                    : "Duplicate Row (auto-merged)"}
                                </p>
                                <p className="leading-relaxed">{conflict.detail}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                    </div>
                  )}

                  {/* Preview Table */}
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Preview</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Name</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">SKU (Ctn)</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Color</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Size</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Tag</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Online MRP</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Offline MRP</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Cost ₹</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">HSN</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Size Qty</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Gender</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Brand</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Image</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {csvRows.slice(0, 20).map((r, i) => {
                            const isWishlist = resolveStage(r.listing_status as string | undefined) === "WISHLIST";
                            const groupKey = `${r.name}|||${isWishlist ? "WISHLIST" : "AVAILABLE"}`;
                            const conflict = csvConflicts.find(c => c.key === groupKey);
                            const isSkipped = conflict?.resolution === "skip";
                            return (
                            <tr key={i} className={`hover:bg-slate-50 ${isSkipped ? "opacity-40" : ""}`}>
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {isSkipped && <span className="text-[9px] font-black text-rose-500 mr-1">SKIP</span>}
                                {r._isAutoRenamed && (
                                  <span className="text-[9px] font-black text-purple-600 bg-purple-50 border border-purple-200 rounded px-1 mr-1" title="Name auto-suffixed: same name had different assortment">AUTO</span>
                                )}
                                {r.name}
                              </td>
                              <td className="px-3 py-2 font-mono text-[10px] text-indigo-600">{r.sku_ctn || <span className="text-slate-300 italic">—</span>}</td>
                              <td className="px-3 py-2 text-slate-600">{r.color}</td>
                              <td className="px-3 py-2 text-slate-600 font-mono">{r.size}</td>
                              <td className="px-3 py-2">
                                {r.tag ? (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.tag === "online" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                    {r.tag}
                                  </span>
                                ) : <span className="text-slate-300 text-[10px]">—</span>}
                              </td>
                              <td className="px-3 py-2 font-bold text-blue-600">{r.online_mrp ? `₹${r.online_mrp}` : "—"}</td>
                              <td className="px-3 py-2 font-bold text-amber-600">{r.offline_mrp ? `₹${r.offline_mrp}` : "—"}</td>
                              <td className="px-3 py-2 text-slate-600">₹{r.cost_price || "—"}</td>
                              <td className="px-3 py-2 font-mono text-slate-500">{r.hsn || "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-600">{formatSizeQtyDisplay(r)}</td>
                              <td className="px-3 py-2 text-slate-500">{r.gender || "—"}</td>
                              <td className="px-3 py-2 text-slate-500">{r.brand || "—"}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isWishlist ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {isWishlist ? "WISHLIST" : "AVAILABLE"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {r.image
                                  ? <img src={r.image} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  : <span className="text-slate-300 italic">—</span>
                                }
                              </td>
                            </tr>
                            );
                          })}
                          {csvRows.length > 20 && (
                            <tr><td colSpan={14} className="px-3 py-2 text-slate-400 italic text-center">...and {csvRows.length - 20} more rows</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    onClick={handleCsvImport}
                    disabled={csvLoading}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {csvLoading
                      ? <><Loader2 size={16} className="animate-spin" /> Importing...</>
                      : <>Import {Object.keys(groupCsvByNameAndStage(csvRows)).filter(k => !csvConflicts.find(c => c.key === k && c.resolution === "skip")).length} Group(s)</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MRP (per pair)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-indigo-500 font-bold mb-1">Online MRP</p>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-indigo-600 placeholder:text-slate-300 text-sm"
                            value={formData.onlineMrp === 0 ? "" : String(formData.onlineMrp)}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                              setFormData((p) => ({ ...p, onlineMrp: val }));
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-amber-500 font-bold mb-1">Offline MRP</p>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-amber-600 placeholder:text-slate-300 text-sm"
                            value={formData.offlineMrp === 0 ? "" : String(formData.offlineMrp)}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                              setFormData((p) => ({ ...p, offlineMrp: val }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
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
                  disabled={loading}
                  className="flex-2 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{editingArticle ? "Updating..." : "Creating..."}</span>
                    </>
                  ) : (
                    editingArticle ? "Save Changes" : "Create Master"
                  )}
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
