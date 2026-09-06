import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Image as ImageIcon,
  Tag,
  Layers,
  Heart,
  CalendarDays,
  Package,
  ChevronDown,
  Palette,
  Loader2,
  Upload,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { Article, AssortmentType } from "../../types";
import { COMPANY_CONFIG } from "../../constants";
import Switch from "../ui/Switch";
import { masterCatalogService } from "../../services/masterCatalogService";
import { getImageUrl } from "../../utils/imageUtils";
import { formatAssortment } from "../../utils/assortmentUtils";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

type CatalogueForm = {
  name: string;
  category: AssortmentType;
  onlineMrp: number;
  offlineMrp: number;
  sizeRange: string;
  sizeBreakup: Record<string, number>;
  images: File[];
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
  scrollToArticleId?: string | null;
  onScrollRestored?: () => void;
}

// ─── CSV Types ──────────────────────────────────────────────────────────────────
interface CsvRow {
  name: string;
  color: string;
  size: string;
  sku_ctn?: string;
  online_mrp?: string;
  offline_mrp?: string;
  cost_price?: string;
  hsn?: string;
  gender?: string;
  category?: string;
  brand?: string;
  manufacturer?: string;
  unit?: string;
  image?: string;
  sole_color?: string;
  [key: string]: string | boolean | undefined;
}


// Generate per-size SKUs from carton SKU — same 2-strategy logic as backend + VariantDetailsPage
// Strategy 1: if ctnSku ends with sizeRange (e.g. "amr-gry-7-11" ends with "7-11"), strip it
// Strategy 2: regex /^(.*)-\d+-\d+$/ — handles cases where sizeRange is empty/missing in DB
function stripGenderFromBase(base: string): string {
  const withoutTrail = base.endsWith("-") ? base.slice(0, -1) : base;
  const segments = withoutTrail.split("-");
  const last = segments[segments.length - 1] || "";
  if (last.length === 1 && /^[A-Za-z]$/.test(last)) {
    return withoutTrail.slice(0, -(last.length + 1)) + "-";
  }
  return base;
}

function generateSizeSkus(
  ctnSku: string,
  sizeRange: string,
  sizeKeys: string[]
): Record<string, string> {
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
    base = stripGenderFromBase(base);
    sizeKeys.forEach((sz) => {
      result[sz] = `${base}${sz}`;
    });
  } else {
    sizeKeys.forEach((sz) => {
      result[sz] = `${ctnSku}-${sz}`;
    });
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

// Reads size_5, size_6 ... columns → { "5": 6, "6": 8 }. Kids wrap-around
// ranges (e.g. "11-1") keep the post-13 segment as a plain unpadded number
// too — same as every other size, no special-casing.
function extractSizeQty(row: CsvRow): Record<string, number> {
  const result: Record<string, number> = {};
  Object.keys(row).forEach((key) => {
    const match = key.match(/^size_(\d+(?:\.\d+)?)$/);
    if (match && row[key]) {
      const qty = Number(row[key]);
      if (qty > 0) result[String(Number(match[1]))] = qty;
    }
  });
  return result;
}

// SKU is the primary duplicate signal — a repeated sku_ctn with the EXACT
// same size assortment is a true duplicate row (second+ occurrence dropped).
// A repeated sku_ctn with a DIFFERENT assortment is not a duplicate — an
// unusual but legitimate distinct variant sharing that SKU — both rows are
// kept. sku_ctn is mandatory: a row with no sku_ctn at all is dropped,
// never imported.
function dedupeBySku(rows: CsvRow[]): { kept: CsvRow[]; skipped: CsvRow[] } {
  const seenAssortmentsBySku = new Map<string, Set<string>>();
  const kept: CsvRow[] = [];
  const skipped: CsvRow[] = [];
  rows.forEach((r) => {
    const sku = (r.sku_ctn || "").trim();
    if (!sku) {
      skipped.push(r);
      return;
    }
    const fp = assortFp(extractSizeQty(r));
    const seen = seenAssortmentsBySku.get(sku);
    if (seen && seen.has(fp)) {
      skipped.push(r);
      return;
    }
    if (seen) seen.add(fp);
    else seenAssortmentsBySku.set(sku, new Set([fp]));
    kept.push(r);
  });
  return { kept, skipped };
}

// Variant uniqueness key — sku_ctn + size assortment ONLY. Same SKU + same
// assortment = the same variant (duplicate). Same SKU + a different
// assortment = a genuinely different variant, kept. Color/sizeRange are not
// part of the identity at all — only used as a fallback when a row has no
// sku_ctn, so blank-SKU rows don't all collapse into one "duplicate".
function makeVariantKey(r: CsvRow): string {
  const sku = (r.sku_ctn || "").trim();
  const fp = assortFp(extractSizeQty(r));
  if (sku) return `sku:${sku}|||${fp}`;
  return `nosku:${(r.color || "").toLowerCase().trim()}|||${(
    r.size || ""
  ).trim()}|||${fp}`;
}

// Same composite key, built from an existing DB variant instead of a CSV row
function existingVariantKey(v: {
  color?: string;
  sizeRange?: string;
  sizeQuantities?: Record<string, number>;
  sku?: string;
}): string {
  const sku = (v.sku || "").trim();
  const fp = assortFp(v.sizeQuantities || {});
  if (sku) return `sku:${sku}|||${fp}`;
  return `nosku:${(v.color || "").toLowerCase().trim()}|||${(
    v.sizeRange || ""
  ).trim()}|||${fp}`;
}

const SUFFIX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Appends -A, -B, -C... to a variant's itemName ONLY when the computed name
// (`${article}-${color}-${sizeRange}`) actually collides with another
// variant's name — i.e. same color + same sizeRange as an existing DB
// variant or an earlier variant in this same import. This is a DIFFERENT
// question from duplicate detection (which is sku_ctn + assortment based,
// see makeVariantKey/existingVariantKey): two rows can share a sku_ctn but
// have different color/sizeRange (a genuinely different, non-colliding
// variant — e.g. a SKU mistakenly reused across two different size ranges
// in the source CSV) and need no suffix at all, since their names already
// differ. Conversely two rows with DIFFERENT sku_ctn but the same
// color+sizeRange (e.g. a re-issued SKU for the same size range) DO need a
// suffix, since their names would otherwise be identical.
function disambiguateItemNames(
  newVariants: { itemName: string; color: string; sizeRange: string }[],
  existingVariants: { itemName?: string; color: string; sizeRange: string }[] = []
): void {
  const slotKey = (v: { color: string; sizeRange: string }) =>
    `${(v.color || "").toLowerCase().trim()}|||${(v.sizeRange || "").trim()}`;
  const occurrences: Record<string, number> = {};
  existingVariants.forEach((v) => {
    const k = slotKey(v);
    occurrences[k] = (occurrences[k] || 0) + 1;
  });
  newVariants.forEach((v) => {
    const k = slotKey(v);
    const priorCount = occurrences[k] || 0;
    if (priorCount > 0) {
      v.itemName = `${v.itemName}-${
        SUFFIX_LETTERS[priorCount - 1] || priorCount
      }`;
    }
    occurrences[k] = priorCount + 1;
  });
}

// A carton SKU must uniquely identify one (color + sizeRange) combination —
// reusing the same sku_ctn for two DIFFERENT color/sizeRange slots is
// corrupt source data (e.g. a copy-paste mistake in the CSV), not a
// legitimate distinct variant. Rows whose SKU is already bound to a
// different slot — either by an existing DB variant, or by an earlier row
// in this same CSV batch — are rejected outright rather than imported
// under an auto-renamed (-A/-B/-C) name. The same SKU reused for the SAME
// slot (e.g. an online/offline pair) is unaffected — that's still allowed.
function findSkuSlotConflicts(
  rows: CsvRow[],
  existingVariants: { sku?: string; color?: string; sizeRange?: string }[] = []
): { valid: CsvRow[]; rejected: { row: CsvRow; conflictSlot: string }[] } {
  const skuToSlot = new Map<string, string>();
  existingVariants.forEach((v) => {
    const sku = (v.sku || "").trim();
    if (!sku || skuToSlot.has(sku)) return;
    skuToSlot.set(
      sku,
      `${(v.color || "").toLowerCase().trim()}|||${(v.sizeRange || "").trim()}`
    );
  });
  const valid: CsvRow[] = [];
  const rejected: { row: CsvRow; conflictSlot: string }[] = [];
  rows.forEach((r) => {
    const sku = (r.sku_ctn || "").trim();
    if (!sku) {
      valid.push(r);
      return;
    }
    const slot = `${(r.color || "").toLowerCase().trim()}|||${(
      r.size || ""
    ).trim()}`;
    const boundSlot = skuToSlot.get(sku);
    if (boundSlot && boundSlot !== slot) {
      rejected.push({ row: r, conflictSlot: boundSlot });
      return;
    }
    if (!boundSlot) skuToSlot.set(sku, slot);
    valid.push(r);
  });
  return { valid, rejected };
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
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i).trim());
        break;
      }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

// Column header aliases — maps flexible user-written names to canonical CsvRow keys
const CSV_HEADER_ALIASES: Record<string, string> = {
  sku: "sku_ctn",
  "sole color": "sole_color",
  "cost price": "cost_price",
  "online mrp": "online_mrp",
  "offline mrp": "offline_mrp",
};

function normalizeHeader(h: string): string {
  const lower = h.trim().toLowerCase();
  return CSV_HEADER_ALIASES[lower] ?? lower;
}

// Required columns (after alias normalization) for the import to proceed
const CSV_REQUIRED_COLUMNS: {
  key: string;
  label: string;
  check: (headers: string[]) => boolean;
}[] = [
  { key: "name", label: "name", check: (hs) => hs.includes("name") },
  { key: "color", label: "color", check: (hs) => hs.includes("color") },
  {
    key: "sku_ctn",
    label: "sku  (carton SKU)",
    check: (hs) => hs.includes("sku_ctn"),
  },
  {
    key: "size",
    label: "size  (size range, e.g. 6-10)",
    check: (hs) => hs.includes("size"),
  },
  {
    key: "gender",
    label: "gender  (MEN / WOMEN / KIDS)",
    check: (hs) => hs.includes("gender"),
  },
  {
    key: "size_assortment",
    label: "size assortment columns  (e.g. size_5, size_6 …)",
    check: (hs) => hs.some((h) => /^size_[\d]/.test(h)),
  },
];

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]).map(normalizeHeader);
  return lines
    .slice(1)
    .map((line) => {
      const vals = parseCsvRow(line);
      const row: any = {};
      headers.forEach((h, i) => {
        row[h] = vals[i] ?? "";
      });
      // Article name and SKU are always treated as uppercase, everywhere.
      if (row.name) row.name = String(row.name).trim().toUpperCase();
      if (row.sku_ctn) row.sku_ctn = String(row.sku_ctn).trim().toUpperCase();
      return row as CsvRow;
    })
    .filter((r) => r.name);
}

// Returns list of missing required column labels given the raw first-line text
function getMissingColumns(firstLine: string): string[] {
  const headers = parseCsvRow(firstLine).map(normalizeHeader);
  return CSV_REQUIRED_COLUMNS.filter((rc) => !rc.check(headers)).map(
    (rc) => rc.label
  );
}

// Normalize gender for grouping/identity purposes.
function resolveGender(raw: string | undefined): string {
  return (raw || "MEN").trim().toUpperCase();
}

// Article identity = name + gender. Two entries differing on either are
// legitimately different articles, not duplicates/conflicts.
function findExistingMaster(
  articles: Article[],
  name: string,
  gender: string
): Article | undefined {
  return articles.find(
    (a) =>
      a.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      resolveGender(a.category) === gender
  );
}

// Groups CSV rows purely by name + gender — that's what determines which
// article a row belongs to. No collision detection, no auto-splitting into
// "Name2", no renaming of any kind. Two rows that land in the same
// color+sizeRange slot with different assortments just both become variants
// of the same article (see makeVariantKey/existingVariantKey for how
// duplicates — same sku_ctn + same assortment — are actually detected).
function groupCsvByName(rows: CsvRow[]): Record<string, CsvRow[]> {
  const result: Record<string, CsvRow[]> = {};
  rows.forEach((r) => {
    const gender = resolveGender(r.gender as string | undefined);
    const key = `${r.name}|||${gender}`;
    (result[key] = result[key] || []).push(r);
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
  scrollToArticleId,
  onScrollRestored,
}) => {
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
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingImageCsv, setExportingImageCsv] = useState(false);
  const [uploadingImageCsv, setUploadingImageCsv] = useState(false);
  const imageCsvInputRef = useRef<HTMLInputElement | null>(null);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useRef("");
  const didScrollRef = useRef(false);

  useEffect(() => {
    didScrollRef.current = false;
  }, [scrollToArticleId]);

  useEffect(() => {
    if (
      !scrollToArticleId ||
      didScrollRef.current ||
      localArticles.length === 0
    )
      return;
    const el = document.getElementById(`article-${scrollToArticleId}`);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "center" });
      didScrollRef.current = true;
      onScrollRestored?.();
    }
  }, [localArticles, scrollToArticleId, onScrollRestored]);

  // ── CSV Import State ─────────────────────────────────────────────────────────
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvMissingCols, setCsvMissingCols] = useState<string[]>([]);
  const [taxonomy, setTaxonomy] = useState<{
    categories: any[];
    brands: any[];
    manufacturers: any[];
    units: any[];
  }>({ categories: [], brands: [], manufacturers: [], units: [] });

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
      toast.error(
        "Failed to load taxonomy. Please close and reopen the modal."
      );
    }
  };

  const openCsvModal = () => {
    setCsvOpen(true);
    setCsvText("");
    setCsvMissingCols([]);
    loadTaxonomy();
  };
  const closeCsvModal = () => {
    setCsvOpen(false);
    setCsvText("");
    setCsvMissingCols([]);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Single direct action: paste/upload → import. No preview step, no skip/
  // conflict decisions — everything importable imports immediately. Rows
  // that are true duplicates (same sku_ctn + identical size assortment, or
  // variants already existing in the DB) are silently dropped rather than
  // surfaced for a manual choice.
  const handleCsvImport = async () => {
    const firstLine = csvText.trim().split(/\r?\n/).find(Boolean) || "";
    const missing = getMissingColumns(firstLine);
    if (missing.length > 0) {
      setCsvMissingCols(missing);
      return;
    }
    setCsvMissingCols([]);

    const rawRows = parseCsv(csvText);
    if (!rawRows.length) {
      toast.error(
        "No valid rows found. Check CSV format: name,sku,color,size,online_mrp,offline_mrp,..."
      );
      return;
    }

    // Silent SKU-based dedup — same sku_ctn + identical size assortment is a
    // true duplicate (dropped); same sku_ctn with a different assortment is
    // kept (not a duplicate).
    const { kept: dedupedRows } = dedupeBySku(rawRows);

    // Groups by name+gender; also auto-splits a same color+size combo that
    // carries different assortments into separate masters.
    const groups = groupCsvByName(dedupedRows);
    const keys = Object.keys(groups);
    if (!keys.length) {
      toast.error("Nothing to import.");
      return;
    }
    setCsvLoading(true);

    const importPromise = async () => {
      // Local mutable copies so newly-created docs are reused within same import
      const localCats = [...taxonomy.categories];
      const localBrands = [...taxonomy.brands];
      const localMans = [...taxonomy.manufacturers];
      const localUnits = [...taxonomy.units];
      // Same pattern for articles: the `articles` prop only refreshes via an
      // async socket round-trip, so it can still be stale for the NEXT group
      // in this very loop. Without a locally-updated list, two CSV groups
      // that both resolve to the same article (e.g. split across non-adjacent
      // row-blocks) would each see "no existing master" and both call
      // createMasterItem — producing duplicate top-level articles instead of
      // one merged article. Seed from the current prop, then keep in sync
      // with every create/update below.
      const localArticles: any[] = [...articles];
      const normalizeSavedArticle = (raw: any) => ({
        id: raw._id,
        name: raw.articleName,
        category: raw.gender, // `articles` prop entries store gender under `.category` too
        variants: (raw.variants || []).map((v: any) => ({ ...v, id: v._id })),
      });

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

      // Groups run sequentially, on purpose — NOT a performance oversight.
      // The existing-vs-new decision below reads `localArticles`, which is
      // only ever up to date immediately after the previous group's
      // create/update finished. Running groups concurrently was tried and
      // reverted: two groups for the SAME article name (e.g. rows that
      // disagree on gender — a CSV data issue, not code) would both read
      // "no existing article yet" at the same instant and each independently
      // create one, producing duplicate/fragmented articles. Speed instead
      // comes from each save being `silent` (see fd.append below) — no
      // per-master toast/refetch storm slowing things down between saves.
      for (const groupKey of keys) {
        // groupKey = "ArticleName|||MEN" (etc.)
        const [name] = groupKey.split("|||");
        const rows = groups[groupKey];
        const firstRow = rows[0];

        const gender = (firstRow.gender || "MEN").toUpperCase();
        const catName = (firstRow.category || "").trim();
        const brdName = (firstRow.brand || "").trim();
        const manName = (firstRow.manufacturer || "").trim();
        const unitName = (firstRow.unit || "").trim();

        const catDoc = await findOrCreate(
          localCats,
          (i: any) => i.name?.toLowerCase() === catName.toLowerCase(),
          () => masterCatalogService.createCategory(catName),
          () =>
            masterCatalogService.listCategories(
              `?q=${encodeURIComponent(catName)}&limit=10`
            )
        );

        // Brand requires categoryId — pass catDoc._id on create
        const brandDoc = await findOrCreate(
          localBrands,
          (i: any) =>
            i.name?.toLowerCase() === brdName.toLowerCase() &&
            String(i.categoryId) === String(catDoc._id),
          () => masterCatalogService.createBrand(brdName, catDoc._id),
          () =>
            masterCatalogService.listBrands(
              catDoc._id,
              `?q=${encodeURIComponent(brdName)}&limit=10`
            )
        );

        const manDoc = await findOrCreate(
          localMans,
          (i: any) => i.name?.toLowerCase() === manName.toLowerCase(),
          () => masterCatalogService.createManufacturer(manName),
          () =>
            masterCatalogService.listManufacturers(
              `?q=${encodeURIComponent(manName)}&limit=10`
            )
        );

        const unitDoc = await findOrCreate(
          localUnits,
          (i: any) => i.name?.toLowerCase() === unitName.toLowerCase(),
          () => masterCatalogService.createUnit(unitName),
          () =>
            masterCatalogService.listUnits(
              `?q=${encodeURIComponent(unitName)}&limit=10`
            )
        );

        const colors = Array.from(
          new Set(rows.map((r) => r.color).filter(Boolean))
        );
        const sizes = Array.from(
          new Set(rows.map((r) => r.size).filter(Boolean))
        );
        // Master MRP = max of every variant's online/offline MRP — every
        // variant carries both prices, so both count toward the article-level
        // headline figure.
        const mrp = Math.max(
          0,
          ...rows.flatMap((r) => [
            Number(r.online_mrp) || 0,
            Number(r.offline_mrp) || 0,
          ])
        );

        // Build color → image URL map from CSV
        const colorImageUrls: Record<string, string> = {};
        rows.forEach((r) => {
          if (r.color && r.image) colorImageUrls[r.color] = r.image;
        });

        // Build variants: each CSV row = one variant (no cartesian product)
        const buildVariant = (r: CsvRow) => {
          const sizeQuantities = extractSizeQty(r);
          const sizeMap: Record<string, { qty: number; sku: string }> = {};
          const ctnSku = r.sku_ctn?.trim() || "";
          const onlineMrp = Number(r.online_mrp) || 0;
          const offlineMrp = Number(r.offline_mrp) || 0;
          const variantMrp = Math.max(onlineMrp, offlineMrp);
          // Auto-generate per-size SKUs from carton SKU
          const sizeSkus = generateSizeSkus(
            ctnSku,
            r.size,
            Object.keys(sizeQuantities)
          );
          // sizeMap: initialize qty=0 (inventory populated via GRN)
          Object.keys(sizeQuantities).forEach((sz) => {
            sizeMap[sz] = { qty: 0, sku: sizeSkus[sz] || "" };
          });
          return {
            itemName: `${name}-${r.color}-${r.size}`,
            color: r.color,
            sizeRange: r.size,
            costPrice: Number(r.cost_price) || 0,
            sellingPrice: 0,
            mrp: variantMrp,
            hsnCode: r.hsn?.trim() || "",
            sizeQuantities,
            sizeSkus,
            sizeMap,
            sku: ctnSku,
            onlineMrp,
            offlineMrp,
          };
        };

        // Deduplicate CSV rows before building variants (prevents duplicate variants in DB on new article create)
        // sku_ctn is mandatory — a row without one is never imported.
        const seenVariantKeys = new Set<string>();
        const dedupedGroupRows = rows.filter((r) => {
          if (!r.color || !r.size || !r.sku_ctn?.trim()) return false;
          const vk = makeVariantKey(r);
          if (seenVariantKeys.has(vk)) return false;
          seenVariantKeys.add(vk);
          return true;
        });
        // Reject rows whose sku_ctn is reused across a different color/size
        // slot within this same batch (e.g. a copy-pasted SKU) — corrupt
        // data, not a legitimate new variant.
        const { valid: skuValidRows, rejected: skuConflictRows } =
          findSkuSlotConflicts(dedupedGroupRows);
        if (skuConflictRows.length > 0) {
          skuConflictRows.forEach(({ row, conflictSlot }) => {
            warnings.push(
              `"${name}" — skipped ${row.color} (${row.size}): SKU "${row.sku_ctn}" is already used for ${conflictSlot.replace("|||", " (")}) — fix the CSV and re-import.`
            );
          });
        }
        const variants = skuValidRows.map(buildVariant);
        disambiguateItemNames(variants);

        const soleColor = firstRow.sole_color?.trim() || "";

        // Match existing master by name + gender (article identity is both,
        // not name alone — two rows for the same name but different gender
        // are legitimately different articles, not a merge target for each
        // other). Reads localArticles (kept in sync below after every
        // create/update), not the `articles` prop, so a later group in this
        // SAME run correctly finds an article created by an EARLIER group
        // instead of creating a duplicate.
        const existingMaster = localArticles.find(
          (a) =>
            a.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            resolveGender(a.category) === gender
        );

        const fd = new FormData();
        fd.append("articleName", name);
        fd.append("mrp", String(mrp || 0));
        fd.append("gender", gender);
        fd.append("categoryId", catDoc._id);
        fd.append("brandId", brandDoc._id);
        fd.append("manufacturerCompanyId", manDoc._id);
        fd.append("unitId", unitDoc._id);
        // Suppresses the per-master realtime toast + full article/order
        // refetch on every client — a bulk import of N masters would
        // otherwise stack N toasts and N heavy refetches. One manual
        // refresh happens after the whole batch completes instead.
        fd.append("silent", "true");
        if (soleColor) fd.append("soleColor", soleColor);
        if (Object.keys(colorImageUrls).length > 0) {
          fd.append("colorImageUrls", JSON.stringify(colorImageUrls));
        }

        if (existingMaster) {
          // ── Duplicate check: sku_ctn + size assortment ONLY ──────────
          // Same sku_ctn + same assortment → true duplicate (skip).
          // Same sku_ctn + different assortment → new variant (OK).
          // sku_ctn is mandatory — rows without one are never imported.
          const existingVariantKeys = new Set(
            (existingMaster.variants || []).map(existingVariantKey)
          );

          const duplicateRows = rows.filter(
            (r) =>
              r.color &&
              r.sku_ctn?.trim() &&
              existingVariantKeys.has(makeVariantKey(r))
          );
          const newRows = rows.filter(
            (r) =>
              r.color &&
              r.size &&
              r.sku_ctn?.trim() &&
              !existingVariantKeys.has(makeVariantKey(r))
          );

          const duplicateLabels = Array.from(
            new Set(duplicateRows.map((r) => `${r.color} (${r.size})`))
          );

          // Duplicate rows aren't recreated as new variants, but a CSV row can still carry
          // a corrected SKU for an otherwise-identical existing variant — update it in place
          // rather than silently discarding the new sku_ctn value.
          const duplicateRowByKey = new Map(
            duplicateRows.map((r) => [makeVariantKey(r), r])
          );
          const skuUpdateLabels: string[] = [];

          // All variants already exist → nothing new, but SKUs may still need updating
          if (newRows.length === 0) {
            skipped++;
            warnings.push(
              `"${name}" skipped — all variants already exist: ${duplicateLabels.join(
                ", "
              )}`
            );
            continue;
          }

          // Some variants already exist → inform
          if (duplicateLabels.length > 0) {
            warnings.push(
              `"${name}" — skipped existing variants: ${duplicateLabels.join(
                ", "
              )}`
            );
          }

          // ── Merge: preserve existing variants with their inventory ───
          const existingVariants = (existingMaster.variants || []).map((v) => ({
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
            onlineMrp: v.onlineMrp || 0,
            offlineMrp: v.offlineMrp || 0,
            sku: v.sku || "",
          }));

          // ── Build variants for new (non-duplicate) rows only ────────
          // Duplicate = same sku_ctn + same size assortment (handled above).
          // A new row whose color+sizeRange matches an existing variant's
          // (e.g. same slot, different assortment or a re-issued sku_ctn)
          // gets -A/-B/-C appended to its itemName so the two are
          // distinguishable in the UI.
          const colorSizeRows = newRows.filter((r) => r.color && r.size);
          // Reject rows whose sku_ctn is already bound to a DIFFERENT
          // color/sizeRange slot — either an existing DB variant of this
          // article, or an earlier row in this same batch.
          const { valid: skuValidNewRows, rejected: skuConflictNewRows } =
            findSkuSlotConflicts(colorSizeRows, existingVariants);
          if (skuConflictNewRows.length > 0) {
            skuConflictNewRows.forEach(({ row, conflictSlot }) => {
              warnings.push(
                `"${name}" — skipped ${row.color} (${row.size}): SKU "${row.sku_ctn}" is already used for ${conflictSlot.replace("|||", " (")}) — fix the CSV and re-import.`
              );
            });
          }
          // Every new row was rejected for a SKU/slot conflict — nothing
          // left to add, don't fire a no-op update.
          if (colorSizeRows.length > 0 && skuValidNewRows.length === 0) {
            skipped++;
            continue;
          }

          const newVariantsOnly = skuValidNewRows.map((r) => buildVariant(r));
          disambiguateItemNames(newVariantsOnly, existingVariants);

          const allVariants = [...existingVariants, ...newVariantsOnly];
          const allColors = Array.from(
            new Set(
              [
                ...(existingMaster.variants || []).map((v) => v.color),
                ...newRows.map((r) => r.color),
              ].filter(Boolean)
            )
          );
          const allSizes = Array.from(
            new Set(
              [
                ...(existingMaster.variants || []).map((v) => v.sizeRange),
                ...newRows.map((r) => r.size),
              ].filter(Boolean)
            )
          );

          fd.append("productColors", JSON.stringify(allColors));
          fd.append("sizeRanges", JSON.stringify(allSizes));
          fd.append("variants", JSON.stringify(allVariants));
          const updateRes = await masterCatalogService.updateMasterItem(
            existingMaster.id,
            fd
          );
          // Replace the stale entry so a THIRD group targeting this same
          // article (e.g. more new variants) sees the just-merged variant
          // list, not the pre-merge snapshot.
          const updatedNorm = normalizeSavedArticle(updateRes?.data || {});
          const idx = localArticles.findIndex(
            (a) => a.id === existingMaster.id
          );
          if (idx >= 0) localArticles[idx] = updatedNorm;
        } else {
          fd.append("productColors", JSON.stringify(colors));
          fd.append("sizeRanges", JSON.stringify(sizes));
          fd.append("variants", JSON.stringify(variants));
          const createRes = await masterCatalogService.createMasterItem(fd);
          localArticles.push(normalizeSavedArticle(createRes?.data || {}));
        }
        created++;
      }
      return { created, skipped, warnings };
    };

    toast.promise(
      importPromise().finally(() => setCsvLoading(false)),
      {
        loading: `Importing ${keys.length} article(s)...`,
        success: (result: any) => {
          closeCsvModal();
          onSuccess?.();
          loadTaxonomy();
          // One manual refresh for the whole batch — each individual
          // create/update call ran silent (see fd.append("silent", ...)).
          window.dispatchEvent(new CustomEvent("catalogRefetch"));
          const parts = [];
          if (result.created > 0) parts.push(`${result.created} imported`);
          if (result.skipped > 0)
            parts.push(`${result.skipped} already existed (skipped)`);
          return parts.join(" · ") || "Done";
        },
        error: (err: any) => err.message || "Import failed",
      }
    );
  };

  const [formData, setFormData] = useState<CatalogueForm>({
    name: "",
    category: AssortmentType.MEN,
    onlineMrp: 0,
    offlineMrp: 0,
    sizeRange: "",
    sizeBreakup: {},
    images: [],
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
      return {
        ...v,
        id: v._id || Math.random().toString(36).substr(2, 9),
        sizeSkus,
        sizeQuantities,
      };
    });
    return {
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
      variants: normalizedVariants,
      isActive: item.isActive !== false,
    };
  };

  // ---------- Backend-paginated data fetch ----------
  const fetchLocalArticles = useCallback(
    async (
      page: number,
      q: string,
      append = false,
      gender = genderFilter,
      sort = sortOption
    ) => {
      if (page === 1) setPageLoading(true);
      else setLoadingMore(true);
      try {
        const res = await masterCatalogService.listMasterItems({
          page,
          limit: BATCH_SIZE,
          q: q || undefined,
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
    },
    [genderFilter, sortOption]
  );

  // Trigger fresh fetch when gender / sort changes
  useEffect(() => {
    setCurrentPage(1);
    fetchLocalArticles(1, debouncedSearch.current, false, genderFilter, sortOption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, sortOption]);

  // Debounced search: 400ms delay, resets to page 1
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const nextSearchTerm = searchTerm.trim();
      debouncedSearch.current = nextSearchTerm;
      setAppliedSearchTerm(nextSearchTerm);
      setCurrentPage(1);
      fetchLocalArticles(1, nextSearchTerm, false, genderFilter, sortOption);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Real-time refresh on socket events. Beyond catalogRefetch (direct
  // catalog edits), a PO being created/approved or a GRN being submitted
  // changes the poPendingPairs/plannedPairs/preBookedPairs shown per variant
  // here — those controllers don't emit catalogUpdated themselves, so this
  // list would otherwise go stale until a manual reload.
  useEffect(() => {
    const handler = () =>
      fetchLocalArticles(1, debouncedSearch.current, false, genderFilter, sortOption);
    window.addEventListener("catalogRefetch", handler);
    window.addEventListener("poRefetch", handler);
    window.addEventListener("billRefetch", handler);
    window.addEventListener("grnRefetch", handler);
    return () => {
      window.removeEventListener("catalogRefetch", handler);
      window.removeEventListener("poRefetch", handler);
      window.removeEventListener("billRefetch", handler);
      window.removeEventListener("grnRefetch", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, sortOption]);

  // Load Next Page for Infinite Scroll (reactive pattern matching Shop.tsx)
  const loadNextPage = useCallback(() => {
    if (!hasMorePages || loadingMore || pageLoading) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    console.log(`[Catalogue Scroll] Loading page ${nextPage}`);
    fetchLocalArticles(
      nextPage,
      debouncedSearch.current,
      true,
      genderFilter,
      sortOption
    );
  }, [
    currentPage,
    hasMorePages,
    loadingMore,
    pageLoading,
    genderFilter,
    sortOption,
    fetchLocalArticles,
  ]);

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
  const isGlobalSearchActive = appliedSearchTerm.length > 0;

  // ---------- Detailed Excel export ----------
  const exportCatalogueExcel = async () => {
    setExportingExcel(true);
    try {
      const exportSearch = appliedSearchTerm.trim();
      const exportGender = genderFilter !== "ALL" ? genderFilter : undefined;
      const exportLimit = 1000;
      const allItems: any[] = [];
      let page = 1;
      let totalPages = 1;

      // The API accepts up to 1,000 records per page, so walk every page to
      // export the complete dataset rather than only loaded rows.
      do {
        const res = await masterCatalogService.listMasterItems({
          page,
          limit: exportLimit,
          q: exportSearch || undefined,
          gender: exportGender,
          sort: sortOption,
        });
        allItems.push(...(res.data || []));
        totalPages = Math.max(1, Number(res.meta?.totalPages) || 1);
        page += 1;
      } while (page <= totalPages);

      const bookedMapResponse = await masterCatalogService.getBookedMap();
      const bookedPairsByVariant = bookedMapResponse?.data || {};

      const exportRows: Array<Record<string, string | number | boolean>> = [];
      let serialNumber = 0;

      allItems.forEach((item: any) => {
        const variants = item.variants || [];

        variants.forEach((variant: any) => {
          const sizeMap = variant.sizeMap || {};
          const livePairs: number = Object.values(sizeMap).reduce<number>(
            (sum: number, cell: any) => sum + (Number(cell?.qty) || 0),
            0
          );
          const quantityPairs = livePairs;
          const bookedPairs = Number(bookedPairsByVariant[String(variant._id)] || 0);
          const poPendingPairs = Number(variant.poPendingPairs || 0);
          const sizeQuantities =
            variant.sizeQuantities &&
            Object.keys(variant.sizeQuantities).length > 0
              ? variant.sizeQuantities
              : Object.fromEntries(
                  Object.entries(sizeMap).map(([size, cell]: [string, any]) => [
                    size,
                    Number(cell?.qty) || 0,
                  ])
                );

          serialNumber += 1;
          exportRows.push({
            sno: serialNumber,
            article: item.articleName || "",
            gender: item.gender || "",
            productCategory: item.categoryId?.name || "",
            brand: item.brandId?.name || "",
            manufacturer: item.manufacturerCompanyId?.name || "",
            unit: item.unitId?.name || "",
            variant: variant.itemName || `${item.articleName || ""} - ${variant.color || ""}`,
            variantSku: variant.sku || "",
            color: variant.color || "",
            sizeRange: variant.sizeRange || "",
            assortment: formatAssortment(sizeQuantities),
            onlineMrp: Number(variant.onlineMrp ?? item.onlineMrp ?? 0),
            offlineMrp: Number(variant.offlineMrp ?? item.offlineMrp ?? 0),
            costPerPair: Number(variant.costPrice || 0),
            mrpPerPair: Number(variant.mrp || item.mrp || 0),
            quantityPairs,
            quantityCartons: Math.floor(quantityPairs / 24),
            bookedPairs,
            bookedCartons: Math.floor(bookedPairs / 24),
            poPendingPairs,
            poPendingCartons: Math.floor(poPendingPairs / 24),
            active: variant.isActive !== false ? "YES" : "NO",
          });
        });
      });

      if (exportRows.length === 0) {
        toast.error("No catalogue items to export");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Catalogue");
      const columns = [
        ["S.No", "sno", 8],
        ["Article", "article", 28],
        ["Gender", "gender", 12],
        ["Product Category", "productCategory", 20],
        ["Brand", "brand", 20],
        ["Manufacturer", "manufacturer", 24],
        ["Unit", "unit", 16],
        ["Variant", "variant", 32],
        ["Variant SKU", "variantSku", 20],
        ["Color", "color", 16],
        ["Size Range", "sizeRange", 14],
        ["Size Assortment", "assortment", 28],
        ["Online MRP / Pair", "onlineMrp", 16],
        ["Offline MRP / Pair", "offlineMrp", 16],
        ["Cost / Pair", "costPerPair", 14],
        ["MRP / Pair", "mrpPerPair", 14],
        ["Live Stock Pairs", "quantityPairs", 18],
        ["Live Stock Cartons", "quantityCartons", 20],
        ["Booked Pairs", "bookedPairs", 14],
        ["Booked Cartons", "bookedCartons", 16],
        ["PO Pending Pairs", "poPendingPairs", 18],
        ["PO Pending Cartons", "poPendingCartons", 20],
        ["Active", "active", 10],
      ] as const;
      const headers = columns.map((column) => column[0]);

      worksheet.columns = columns.map(([, key, width]) => ({ key, width }));
      const reportScope = exportSearch ? "Global Search" : "All";
      worksheet.insertRow(1, [COMPANY_CONFIG.name.toUpperCase()]);
      worksheet.insertRow(2, [
        `${COMPANY_CONFIG.brand} | MASTER CATALOGUE REPORT`,
      ]);
      worksheet.insertRow(3, [
        COMPANY_CONFIG.invoiceTo,
      ]);
      worksheet.insertRow(4, [
        `GSTIN: ${COMPANY_CONFIG.gst || "-"} | PAN: ${COMPANY_CONFIG.pan || "-"} | Phone: ${COMPANY_CONFIG.phone || "-"} | Email: ${COMPANY_CONFIG.email || "-"}`,
      ]);
      worksheet.insertRow(5, [
        `Generated On: ${new Date().toLocaleString("en-IN")} | Report Scope: ${reportScope}`,
      ]);
      worksheet.insertRow(6, [
        `Search: ${exportSearch || "All items"} | Gender: ${exportGender || "All"} | Total Variants: ${exportRows.length}`,
      ]);
      worksheet.insertRow(7, []);
      worksheet.getRow(8).values = headers;

      worksheet.mergeCells(1, 1, 1, columns.length);
      worksheet.mergeCells(2, 1, 2, columns.length);
      worksheet.mergeCells(3, 1, 3, columns.length);
      worksheet.mergeCells(4, 1, 4, columns.length);
      worksheet.mergeCells(5, 1, 5, columns.length);
      worksheet.mergeCells(6, 1, 6, columns.length);

      const titleRow = worksheet.getRow(1);
      titleRow.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
      titleRow.alignment = { horizontal: "center", vertical: "middle" };
      titleRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      titleRow.height = 36;

      const reportTitleRow = worksheet.getRow(2);
      reportTitleRow.font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
      reportTitleRow.alignment = { horizontal: "center", vertical: "middle" };
      reportTitleRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFF6FF" },
      };
      reportTitleRow.height = 28;

      [3, 4, 5, 6].forEach((rowNumber) => {
        const row = worksheet.getRow(rowNumber);
        row.font = {
          bold: rowNumber >= 5,
          size: 10,
          color: { argb: rowNumber >= 5 ? "FF334155" : "FF64748B" },
        };
        row.alignment = { horizontal: "left", vertical: "middle" };
        row.height = 22;
      });

      const headerRow = worksheet.getRow(8);
      headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      headerRow.height = 32;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF334155" },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      });

      exportRows.forEach((row) => worksheet.addRow(row));
      const currencyColumns = new Set([13, 14, 15, 16]);
      const numericColumns = new Set([1, 17, 18, 19, 20, 21, 22]);

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 8) return;
        row.height = 22;
        row.eachCell((cell, columnNumber) => {
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
          if (rowNumber % 2 === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8FAFC" },
            };
          }
          if (numericColumns.has(columnNumber)) {
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
          if (currencyColumns.has(columnNumber)) {
            cell.numFmt = '₹#,##0.00';
          }
        });
      });

      worksheet.views = [{ state: "frozen", ySplit: 8 }];
      worksheet.autoFilter = {
        from: { row: 8, column: 1 },
        to: { row: 8, column: columns.length },
      };
      worksheet.properties.tabColor = { argb: "FF1E3A8A" };
      worksheet.pageSetup = {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      };
      worksheet.headerFooter.oddFooter = `&L${COMPANY_CONFIG.name}&CPage &P of &N&RGenerated ${new Date().toLocaleDateString("en-IN")}`;

      const buffer = await workbook.xlsx.writeBuffer();
      const scopeName = exportSearch ? "global-search" : "all";
      const date = new Date().toISOString().split("T")[0];
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `catalogue_${scopeName}_${date}.xlsx`
      );
      toast.success(`Exported ${exportRows.length} catalogue variants`);
    } catch (err: any) {
      console.error("Catalogue Excel export failed:", err);
      toast.error(err?.message || "Failed to export catalogue Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  // ---------- Image CSV export/import ----------
  // Export: Article Name + SKU per variant, with a blank Image URL column to
  // fill in. Re-import matches by SKU only — a row can be left blank (no
  // change), filled in for just one variant, or filled in for all of them;
  // rows without a URL are simply skipped, never treated as an error.
  const exportImageCsvTemplate = async () => {
    setExportingImageCsv(true);
    try {
      const allItems: any[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await masterCatalogService.listMasterItems({
          page,
          limit: 1000,
          sort: sortOption,
        });
        allItems.push(...(res.data || []));
        totalPages = Math.max(1, Number(res.meta?.totalPages) || 1);
        page += 1;
      } while (page <= totalPages);

      const lines = ["Article Name,SKU,Color,Size Range,Image URL"];
      allItems.forEach((item: any) => {
        (item.variants || []).forEach((v: any) => {
          if (!v.sku) return;
          lines.push(
            `"${(item.articleName || "").replace(/"/g, '""')}","${v.sku}","${(v.color || "").replace(/"/g, '""')}","${v.sizeRange || ""}",`
          );
        });
      });

      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catalogue_image_template.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${lines.length - 1} SKU rows`);
    } catch {
      toast.error("Failed to build image template");
    } finally {
      setExportingImageCsv(false);
    }
  };

  const handleImageCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingImageCsv(true);
    try {
      const text = await file.text();
      // Deliberately NOT using the main catalog-import parseCsv() here — its
      // header aliasing and required-name filter are built around the full
      // article-import CSV shape, not this simpler sku+image-url one.
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      const headers = lines.length ? parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase()) : [];
      const skuIdx = headers.indexOf("sku");
      const urlIdx = headers.indexOf("image url");
      if (skuIdx === -1 || urlIdx === -1) {
        toast.error("CSV must have SKU and Image URL columns — use the exported template.");
        return;
      }
      const rows = lines
        .slice(1)
        .map((line) => {
          const cells = parseCsvRow(line);
          return { sku: (cells[skuIdx] || "").trim(), imageUrl: (cells[urlIdx] || "").trim() };
        })
        .filter((r) => r.sku && r.imageUrl);

      if (!rows.length) {
        toast.error("No rows with both a SKU and an Image URL were found in this CSV.");
        return;
      }

      const res: any = await masterCatalogService.bulkImageUpdateBySku(rows);
      const unmatchedCount = res?.data?.unmatched?.length || 0;
      toast.success(res?.message || `${rows.length} row(s) processed`);
      if (unmatchedCount > 0) {
        toast.warning(
          `${unmatchedCount} SKU(s) didn't match any catalog variant: ${res.data.unmatched
            .slice(0, 5)
            .map((u: any) => u.sku)
            .join(", ")}${unmatchedCount > 5 ? "…" : ""}`
        );
      }
      fetchLocalArticles(1, debouncedSearch.current, false, genderFilter, sortOption);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update images");
    } finally {
      setUploadingImageCsv(false);
    }
  };

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

      // Derive onlineMrp/offlineMrp from the first variant (not article.mrp
      // which drifts) — every variant carries both prices directly now, and
      // saving this form propagates whatever's entered here to all of them.
      const variants: any[] = (article as any).variants || [];
      const firstVariant = variants[0];
      const fallbackMrp = Number((article as any).mrp || 0);
      const onlineMrp = Number(
        firstVariant?.onlineMrp || firstVariant?.mrp || fallbackMrp || 0
      );
      const offlineMrp = Number(
        firstVariant?.offlineMrp || fallbackMrp || 0
      );

      setFormData({
        name: article.name || "",
        category: article.category,
        onlineMrp,
        offlineMrp,
        sizeRange: String((article as any).sizeRange || ""),
        sizeBreakup: (article as any).sizeBreakup || {},
        images: [],
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
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error("Article name required");
    if (formData.onlineMrp <= 0 && formData.offlineMrp <= 0)
      return toast.error("At least one MRP (Online or Offline) must be > 0");
    if (
      Object.keys(formData.sizeBreakup || {}).length > 0 &&
      !isValidMultiple
    ) {
      return toast.error("Total pairs must be 24, 48, 72... (multiple of 24)");
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
      mrp: Math.max(
        Number(formData.onlineMrp || 0),
        Number(formData.offlineMrp || 0)
      ),
      // @ts-ignore
      sizeRange: String(formData.sizeRange || "").trim(),
      // @ts-ignore
      sizeBreakup: formData.sizeBreakup || {},
      // @ts-ignore
      images: storedImages,
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
              {pageLoading
                ? "Loading…"
                : `${totalItems} Master${totalItems !== 1 ? "s" : ""}`}
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
          <button
            onClick={() => exportCatalogueExcel()}
            disabled={exportingExcel || pageLoading || loadingMore}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-semibold text-sm hover:bg-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingExcel ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {exportingExcel ? "Exporting..." : "Export Excel"}
          </button>
          <button
            onClick={() => exportImageCsvTemplate()}
            disabled={exportingImageCsv || pageLoading || loadingMore}
            title="Download a CSV of Article Name + SKU with a blank Image URL column to fill in"
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-semibold text-sm hover:bg-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingImageCsv ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ImageIcon size={16} />
            )}
            {exportingImageCsv ? "Exporting..." : "Image CSV Template"}
          </button>
          <button
            onClick={() => imageCsvInputRef.current?.click()}
            disabled={uploadingImageCsv}
            title="Upload the filled-in Image CSV to update images by SKU"
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-semibold text-sm hover:bg-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingImageCsv ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {uploadingImageCsv ? "Uploading..." : "Upload Image CSV"}
          </button>
          <input
            ref={imageCsvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImageCsvUpload}
          />
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

      {/* Search + filters bar (same as distributor Shop) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            type="text"
            placeholder="Search article or SKU across the whole catalogue..."
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
            <Loader2
              className="mx-auto text-indigo-400 mb-3 animate-spin"
              size={32}
            />
            <p className="text-slate-400 font-medium text-sm">
              Loading catalogue…
            </p>
          </div>
        )}
        {!pageLoading && filteredMasters.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-2 text-center">
            <Package className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-400 font-medium">
              {isGlobalSearchActive
                ? "No matching catalogue items found."
                : "No catalogue items found."}
            </p>
          </div>
        )}

        {filteredMasters.map((article) => {
          const tabVariants = article.variants || [];
          if (tabVariants.length === 0) return null;

          const isExpanded = expandedIds.has(article.id);
          const variantCount = tabVariants.length;
          const cover = imgSrc(article.imageUrl);

          // Calculate price ranges (per-carton = per-pair × 24)
          const costPrices =
            tabVariants.map((v) => v.costPrice || 0).filter((p) => p > 0) || [];
          const mrpPrices =
            tabVariants.map((v) => v.mrp || 0).filter((p) => p > 0) || [];

          const formatCtnRange = (prices: number[], fallback: number) => {
            const pts = prices.length ? prices : fallback > 0 ? [fallback] : [];
            if (!pts.length) return { ctn: "—", pr: "—" };
            const min = Math.min(...pts) * 24;
            const max = Math.max(...pts) * 24;
            const minPr = Math.min(...pts);
            const maxPr = Math.max(...pts);
            return {
              ctn:
                min === max
                  ? `₹${min.toLocaleString()}`
                  : `₹${min.toLocaleString()} – ₹${max.toLocaleString()}`,
              pr:
                minPr === maxPr
                  ? `₹${minPr.toLocaleString()}`
                  : `₹${minPr.toLocaleString()} – ₹${maxPr.toLocaleString()}`,
            };
          };

          const costRange = formatCtnRange(costPrices, 0);
          const mrpRange = formatCtnRange(mrpPrices, article.mrp || 0);

          // Unique colors across variants
          const variantColors = Array.from(
            new Set(tabVariants.map((v) => v.color).filter(Boolean))
          );

          return (
            <div
              key={article.id}
              id={`article-${article.id}`}
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
                  </div>

                  {/* Compact Stats Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5">
                    <StatItem
                      label="Brand"
                      value={article.brand || "Internal"}
                    />
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] leading-tight">
                        <span className="font-black text-slate-400 uppercase tracking-widest">
                          Cost{" "}
                        </span>
                        <span className="font-black text-slate-700">
                          {costRange.ctn}
                        </span>
                        <span className="text-slate-400"> /ctn</span>
                        <span className="block text-[9px] text-slate-400">
                          {costRange.pr}/pr
                        </span>
                      </div>
                      <div className="text-[10px] leading-tight border-l border-slate-100 pl-2">
                        <span className="font-black text-slate-400 uppercase tracking-widest">
                          MRP{" "}
                        </span>
                        <span className="font-black text-indigo-700">
                          {mrpRange.ctn}
                        </span>
                        <span className="text-slate-400"> /ctn</span>
                        <span className="block text-[9px] text-slate-400">
                          {mrpRange.pr}/pr
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Color chips */}
                  {variantColors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {variantColors.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold border border-slate-200/60 uppercase tracking-wide"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
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
                                  Cost
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Online MRP
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Offline MRP
                                </th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {tabVariants.map((v) => {
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
                                        const colorMedia =
                                          article.colorMedia || [];
                                        const matched = colorMedia.find(
                                          (cm) =>
                                            cm.color.toLowerCase() ===
                                            v.color.toLowerCase()
                                        );
                                        // Only fall back to the article-level cover when this
                                        // article has NO per-color images at all — if other
                                        // colors do have dedicated photos, a blank here should
                                        // stay blank rather than borrow another color's image.
                                        const vImg =
                                          matched &&
                                          matched.images &&
                                          matched.images.length > 0
                                            ? matched.images[0].url
                                            : colorMedia.length === 0
                                            ? article.imageUrl
                                            : "";

                                        return vImg ? (
                                          <img
                                            src={imgSrc(vImg)}
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
                                        );
                                      })()}
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="font-bold text-sm text-slate-800 truncate max-w-[220px]">
                                        {vName}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                        {v.sku || article.sku || ""}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 tracking-wider">
                                        {formatAssortment(v.sizeQuantities)}
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
                                      <p className="text-sm font-bold text-slate-700">
                                        ₹
                                        {(
                                          (v.costPrice || 0) * 24
                                        ).toLocaleString()}
                                        <span className="text-[10px] font-normal text-slate-400">
                                          {" "}
                                          /ctn
                                        </span>
                                      </p>
                                      <p className="text-[10px] text-slate-400">
                                        ₹{(v.costPrice || 0).toLocaleString()}
                                        /pr
                                      </p>
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="text-sm font-bold text-indigo-700">
                                        ₹
                                        {(
                                          (v.onlineMrp || v.mrp || 0) * 24
                                        ).toLocaleString()}
                                        <span className="text-[10px] font-normal text-slate-400">
                                          {" "}
                                          /ctn
                                        </span>
                                      </p>
                                      <p className="text-[10px] text-slate-400">
                                        ₹
                                        {(v.onlineMrp || v.mrp || 0).toLocaleString()}
                                        /pr
                                      </p>
                                    </td>
                                    <td className="px-6 py-3">
                                      <p className="text-sm font-bold text-emerald-700">
                                        ₹
                                        {(
                                          (v.offlineMrp || v.mrp || 0) * 24
                                        ).toLocaleString()}
                                        <span className="text-[10px] font-normal text-slate-400">
                                          {" "}
                                          /ctn
                                        </span>
                                      </p>
                                      <p className="text-[10px] text-slate-400">
                                        ₹
                                        {(v.offlineMrp || v.mrp || 0).toLocaleString()}
                                        /pr
                                      </p>
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
                          {tabVariants.map((v) => {
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
                                    const matched = colorMedia.find(
                                      (cm) =>
                                        cm.color.toLowerCase() ===
                                        v.color.toLowerCase()
                                    );
                                    const vImg =
                                      matched &&
                                      matched.images &&
                                      matched.images.length > 0
                                        ? matched.images[0].url
                                        : colorMedia.length === 0
                                        ? article.imageUrl
                                        : "";

                                    return vImg ? (
                                      <img
                                        src={imgSrc(vImg)}
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
                                    );
                                  })()}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-bold text-sm text-slate-800">
                                          {vName}
                                        </p>
                                        <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                                          {v.sku || article.sku || ""}
                                        </p>
                                        <p className="text-[10px] font-mono text-slate-400 tracking-wider">
                                          {formatAssortment(v.sizeQuantities)}
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
                                        ₹
                                        {(
                                          (v.onlineMrp || v.mrp || 0) * 24
                                        ).toLocaleString()}
                                        <span className="text-[9px] font-normal text-slate-400">
                                          /ctn online
                                        </span>
                                      </span>
                                      <span className="text-xs font-bold text-emerald-600">
                                        ₹
                                        {(
                                          (v.offlineMrp || v.mrp || 0) * 24
                                        ).toLocaleString()}
                                        <span className="text-[9px] font-normal text-slate-400">
                                          /ctn offline
                                        </span>
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
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeCsvModal}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-emerald-600 p-5 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet size={20} /> Import Articles from CSV
              </h3>
              <button
                onClick={closeCsvModal}
                className="text-white/70 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-5 text-center">
                    <FileSpreadsheet
                      size={36}
                      className="mx-auto text-emerald-500 mb-2"
                    />
                    <p className="text-sm font-semibold text-slate-700 mb-1">
                      Upload CSV file or paste CSV text
                    </p>
                    <p className="text-xs text-slate-400 mb-1">
                      <span className="font-bold text-red-500">Required: </span>
                      <code className="bg-slate-100 px-1 rounded">
                        name, color, sku, size, gender, size_5 / size_6 …
                      </code>
                    </p>
                    <p className="text-xs text-slate-400 mb-3">
                      <span className="font-bold text-slate-500">
                        Optional:{" "}
                      </span>
                      <code className="bg-slate-100 px-1 rounded">
                        online_mrp, offline_mrp, cost_price, hsn, category,
                        brand, manufacturer, unit, image, sole_color
                      </code>
                    </p>
                    <a
                      href="/sample_catalog.csv"
                      download="sample_catalog.csv"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-all mb-4"
                    >
                      <Download size={13} /> Download Sample CSV
                    </a>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-emerald-700 transition-all">
                      <Upload size={15} /> Choose CSV File
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleCsvFileUpload}
                      />
                    </label>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                    <p>
                      <b>Format:</b> First row = header. Same <code>name</code>{" "}
                      ke multiple rows = same article, Different color variants.
                    </p>
                    <p>
                      <b>sku_ctn</b> = carton-level SKU (e.g.{" "}
                      <code>slk-blk-5-9</code> or <code>kid-pnk-11-03</code>).
                      Per-size SKUs auto-generate honge. Har variant ke{" "}
                      <b>online_mrp</b> + <b>offline_mrp</b> dono set karo —
                      distributor apne channel ke hisaab se sahi price
                      dekhega.
                    </p>
                    <p>
                      <b>Kids sizes</b>: <code>11-03</code> (11→12→13→01→02→03).
                      CSV columns: <code>size_11</code>, <code>size_12</code>,{" "}
                      <code>size_13</code>, <code>size_01</code>,{" "}
                      <code>size_02</code>, <code>size_03</code>.
                    </p>
                  </div>

                  {csvMissingCols.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-xs font-black text-red-700 uppercase tracking-wider mb-2">
                        Missing required columns — please add them to your file:
                      </p>
                      <ul className="space-y-1">
                        {csvMissingCols.map((col) => (
                          <li
                            key={col}
                            className="flex items-center gap-2 text-xs text-red-700"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono font-bold">
                              {col}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={handleCsvImport}
                    disabled={!csvText.trim() || csvLoading}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {csvLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Importing...
                      </>
                    ) : (
                      "Import Now"
                    )}
                  </button>
                </div>
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
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        MRP (per pair)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-indigo-500 font-bold mb-1">
                            Online MRP
                          </p>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-indigo-600 placeholder:text-slate-300 text-sm"
                            value={
                              formData.onlineMrp === 0
                                ? ""
                                : String(formData.onlineMrp)
                            }
                            onChange={(e) => {
                              const val =
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value) || 0;
                              setFormData((p) => ({ ...p, onlineMrp: val }));
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-amber-500 font-bold mb-1">
                            Offline MRP
                          </p>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-amber-600 placeholder:text-slate-300 text-sm"
                            value={
                              formData.offlineMrp === 0
                                ? ""
                                : String(formData.offlineMrp)
                            }
                            onChange={(e) => {
                              const val =
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value) || 0;
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
                      <span>
                        {editingArticle ? "Updating..." : "Creating..."}
                      </span>
                    </>
                  ) : editingArticle ? (
                    "Save Changes"
                  ) : (
                    "Create Master"
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
