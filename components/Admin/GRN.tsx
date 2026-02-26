import React, { useMemo, useState } from "react";
import {
  Barcode,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Layers,
  Search,
  Trash2,
  XCircle,
  RotateCcw,
  PackageCheck,
  Package,
} from "lucide-react";

type RefType = "PO" | "CAT";

type RefItem = {
  id: string; // "PO-1023"
  refType: RefType; // PO | CAT
  refNo: string; // "1023"
  party?: string;
  article?: string;
};

type Carton = {
  cartonBarcode: string;
  pairBarcodes: string[];
  lockedAt: string; // iso string
};

type GRNHistoryItem = {
  grnNo: string;
  refId: string;
  cartons: number;
  createdAt: string; // iso
};

const PAIRS_PER_CARTON = 24;

const todayYYYYMMDD = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

const makeCartonBarcode = (refType: RefType, refNo: string, serial: number) => {
  // Example: CTN-20260226-PO-1023-001
  return `CTN-${todayYYYYMMDD()}-${refType}-${refNo}-${String(serial).padStart(3, "0")}`;
};

// Demo refs (API se aayega)
const demoRefs: RefItem[] = [
  { id: "PO-1023", refType: "PO", refNo: "1023", party: "ABC Manufacturing", article: "SNEAKER-A1" },
  { id: "CAT-2045", refType: "CAT", refNo: "2045", party: "Internal Catalog", article: "RUNNER-B2" },
];

const GRN: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRefId, setSelectedRefId] = useState<string>("");
  const selectedRef = useMemo(
    () => demoRefs.find((r) => r.id === selectedRefId) || null,
    [selectedRefId]
  );

  // Current carton scanning
  const [pairInput, setPairInput] = useState("");
  const [currentPairs, setCurrentPairs] = useState<string[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [cartonSerial, setCartonSerial] = useState<number>(1);

  // global scanned in this GRN (duplicates block)
  const [globalScanned, setGlobalScanned] = useState<Set<string>>(new Set());

  // UI states
  const [expandedCarton, setExpandedCarton] = useState<string | null>(null);

  // GRN History (dummy - API se ayega)
  const [grnHistory, setGrnHistory] = useState<GRNHistoryItem[]>([
    { grnNo: "GRN-20260226-101", refId: "CAT-2045", cartons: 5, createdAt: new Date().toISOString() },
    { grnNo: "GRN-20260225-099", refId: "PO-1023", cartons: 10, createdAt: new Date(Date.now() - 86400000).toISOString() },
  ]);

  const filteredRefs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return demoRefs;
    return demoRefs.filter(
      (r) => r.id.toLowerCase().includes(q) || (r.party || "").toLowerCase().includes(q)
    );
  }, [searchTerm]);

  const currentCount = currentPairs.length;

  const canSubmit = !!selectedRef && cartons.length > 0 && currentPairs.length === 0;

  const resetAll = () => {
    setPairInput("");
    setCurrentPairs([]);
    setCartons([]);
    setCartonSerial(1);
    setGlobalScanned(new Set());
    setExpandedCarton(null);
  };

  const onSelectRef = (id: string) => {
    // Safety: new GRN start
    setSelectedRefId(id);
    resetAll();
    setSelectedRefId(id);
  };

  const validatePair = (codeRaw: string) => {
    const code = (codeRaw || "").trim();
    if (!selectedRef) return "Please select PO/Catalog first.";
    if (!code) return "Pair barcode required.";
    if (currentPairs.includes(code)) return "Duplicate in current carton not allowed.";
    if (globalScanned.has(code)) return "Duplicate in this GRN not allowed.";
    return "";
  };

  const lockCurrentCarton = (pairs: string[]) => {
    if (!selectedRef) return;

    const cartonBarcode = makeCartonBarcode(selectedRef.refType, selectedRef.refNo, cartonSerial);

    const newCarton: Carton = {
      cartonBarcode,
      pairBarcodes: pairs,
      lockedAt: new Date().toISOString(),
    };

    setCartons((prev) => [newCarton, ...prev]);
    setCartonSerial((s) => s + 1);
    setCurrentPairs([]);
    setExpandedCarton(cartonBarcode);
  };

  const handleScan = () => {
    const code = (pairInput || "").trim();
    const err = validatePair(code);
    if (err) {
      alert(err);
      return;
    }

    setCurrentPairs((prev) => {
      const next = [...prev, code];

      setGlobalScanned((setPrev) => {
        const nextSet = new Set(setPrev);
        nextSet.add(code);
        return nextSet;
      });

      if (next.length === PAIRS_PER_CARTON) {
        lockCurrentCarton(next);
        setPairInput("");
        return [];
      }

      setPairInput("");
      return next;
    });
  };

  const rescanCarton = () => {
    setGlobalScanned((setPrev) => {
      const nextSet = new Set(setPrev);
      currentPairs.forEach((p) => nextSet.delete(p));
      return nextSet;
    });
    setCurrentPairs([]);
    setPairInput("");
  };

  const removeCompletedCarton = (cartonBarcode: string) => {
    const target = cartons.find((c) => c.cartonBarcode === cartonBarcode);
    if (!target) return;

    if (!window.confirm(`Remove carton ${cartonBarcode}?`)) return;

    setGlobalScanned((setPrev) => {
      const nextSet = new Set(setPrev);
      target.pairBarcodes.forEach((p) => nextSet.delete(p));
      return nextSet;
    });

    setCartons((prev) => prev.filter((c) => c.cartonBarcode !== cartonBarcode));
    if (expandedCarton === cartonBarcode) setExpandedCarton(null);
  };

  const submitGRN = () => {
    if (!canSubmit || !selectedRef) return;

    // TODO: API call
    // POST /grn/submit { refId, cartons[] } -> stock entries carton-wise

    alert(
      `GRN Submitted ✅\nReference: ${selectedRef.id}\nCartons: ${cartons.length}\n(Stock entry carton-wise will be created)`
    );

    // Add to history
    setGrnHistory((prev) => [
      {
        grnNo: `GRN-${todayYYYYMMDD()}-${Math.floor(Math.random() * 900 + 100)}`,
        refId: selectedRef.id,
        cartons: cartons.length,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    // reset scanning (keep ref selected)
    resetAll();
    setSelectedRefId(selectedRef.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <ClipboardList className="text-emerald-600" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">GRN (Goods Receipt Note)</h3>
            <p className="text-sm text-slate-500">
              Pair Scan → 24/24 Carton Lock → Stock Entry Carton-wise
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search PO/Catalog..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            title="Reset GRN"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Step 1 - Dropdown Reference */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="text-indigo-600" size={18} />
            <p className="font-bold text-slate-900">Step 1: Select PO / Catalogue Reference</p>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            SELECTED: <span className="text-slate-800">{selectedRef ? selectedRef.id : "None"}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Select Product / Reference (Dropdown)
            </label>

            <select
              value={selectedRefId}
              onChange={(e) => onSelectRef(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
            >
              <option value="">-- Select PO / Catalog --</option>
              {filteredRefs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} • {r.party || "—"} • {r.article || "—"}
                </option>
              ))}
            </select>

            {!selectedRef && (
              <div className="mt-3 text-sm text-rose-600 font-bold">
                ⚠ Select a reference to start scanning.
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                Selected Details
              </p>
              <div className="text-sm text-slate-700">
                <div className="font-black text-slate-900">{selectedRef?.id || "—"}</div>
                <div className="mt-1">
                  Party: <span className="font-semibold">{selectedRef?.party || "—"}</span>
                </div>
                <div>
                  Article: <span className="font-semibold">{selectedRef?.article || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2 - Scanning Section */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Barcode className="text-slate-900" size={18} />
            <p className="font-bold text-slate-900">Step 2: Pair Barcode Scanning</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-black px-3 py-1 rounded-full ${
                currentCount === 0
                  ? "bg-slate-100 text-slate-600"
                  : currentCount < 24
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              Current Carton: {currentCount}/{PAIRS_PER_CARTON}
            </span>

            <button
              type="button"
              onClick={rescanCarton}
              disabled={currentCount === 0}
              className={`px-3 py-2 rounded-xl font-bold text-sm border transition ${
                currentCount === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              }`}
              title="Clear current carton and rescan"
            >
              Rescan Carton
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Scan input */}
          <div className="lg:col-span-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Scan Pair Barcode (Enter)
            </label>
            <input
              type="text"
              placeholder={selectedRef ? "Scan / type barcode..." : "Select PO/CAT first"}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono tracking-widest"
              value={pairInput}
              onChange={(e) => setPairInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScan();
                }
              }}
              disabled={!selectedRef}
            />

            <p className="mt-2 text-[11px] text-slate-500">
              ✅ Duplicate scan blocked • ✅ 24 complete → carton auto lock
            </p>

            {currentCount > 0 && currentCount < 24 && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-bold text-amber-800">⚠ Partial carton not allowed</p>
                <p className="text-amber-700">
                  Current carton must reach <b>24/24</b>, otherwise GRN Submit will remain disabled.
                </p>
              </div>
            )}
          </div>

          {/* Current carton 24 slots */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Current Carton Pair Slots (24)
              </p>
              <span className="text-xs text-slate-500">{currentCount} scanned</span>
            </div>

            <div className="mt-2 p-3 rounded-2xl border border-slate-200 bg-slate-50">
              <PairSlots24 pairs={currentPairs} />
              {currentPairs.length === 0 && (
                <div className="mt-3 text-sm text-slate-400 italic">
                  Scan barcodes and they will fill these 24 slots.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Step 3 - Completed Cartons */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Boxes className="text-indigo-600" size={18} />
            <p className="font-bold text-slate-900">Step 3: Completed Cartons (24/24 locked)</p>
          </div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Total Cartons: <span className="text-slate-800">{cartons.length}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Carton Barcode</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pairs</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {cartons.map((c) => {
                const isOpen = expandedCarton === c.cartonBarcode;
                return (
                  <React.Fragment key={c.cartonBarcode}>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-900 font-mono">{c.cartonBarcode}</div>
                        <div className="text-xs text-slate-400">
                          Locked: {new Date(c.lockedAt).toLocaleString()}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
                          {c.pairBarcodes.length}/{PAIRS_PER_CARTON}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-xs font-black px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
                          LOCKED
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedCarton(isOpen ? null : c.cartonBarcode)}
                            className="px-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-700 hover:bg-slate-50"
                          >
                            {isOpen ? "Hide" : "View"}
                          </button>

                          <button
                            type="button"
                            onClick={() => removeCompletedCarton(c.cartonBarcode)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Remove carton"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={4} className="px-6 pb-6">
                          <div className="mt-2 p-4 rounded-2xl border border-slate-200 bg-slate-50">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                Pair Barcodes ({c.pairBarcodes.length})
                              </p>
                              <span className="text-xs text-slate-500 font-mono">{c.cartonBarcode}</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {c.pairBarcodes.map((p) => (
                                <span
                                  key={p}
                                  className="text-xs font-bold bg-white border border-slate-200 px-3 py-1 rounded-full font-mono"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {cartons.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">
                    No cartons locked yet. Scan 24 pairs to create a carton.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 4 - Submit */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <PackageCheck className="text-slate-900" size={22} />
            </div>
            <div>
              <p className="font-bold text-slate-900">Step 4: GRN Submit</p>
              <p className="text-sm text-slate-500">
                Submit only when all cartons are complete and current carton is empty.
                <br />
                <b>Stock entry will be created carton-wise</b> (not pair-wise).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {!selectedRef ? (
              <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-sm flex items-center gap-2">
                <XCircle size={16} />
                Select PO/Catalog to enable submit
              </div>
            ) : currentPairs.length !== 0 ? (
              <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm flex items-center gap-2">
                <XCircle size={16} />
                Current carton incomplete ({currentCount}/{PAIRS_PER_CARTON})
              </div>
            ) : cartons.length === 0 ? (
              <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2">
                <XCircle size={16} />
                Add at least 1 carton
              </div>
            ) : (
              <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm flex items-center gap-2">
                <CheckCircle2 size={16} />
                Ready to submit
              </div>
            )}

            <button
              type="button"
              onClick={submitGRN}
              disabled={!canSubmit}
              className={`px-6 py-3 rounded-2xl font-black transition-all shadow-xl ${
                canSubmit
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-transparent"
              }`}
            >
              Submit GRN
            </button>
          </div>
        </div>
      </div>

      {/* GRN History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Package className="text-indigo-600" size={18} />
            <p className="font-bold text-slate-900">GRN History</p>
          </div>

          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Total: <span className="text-slate-800">{grnHistory.length}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">GRN No</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cartons</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {grnHistory.map((h) => (
                <tr key={h.grnNo} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-900">{h.grnNo}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      {h.refId}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      {h.cartons}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(h.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}

              {grnHistory.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">
                    No GRN history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GRN;

/** 24 Slots Component */
const PairSlots24: React.FC<{ pairs: string[] }> = ({ pairs }) => {
  return (
    <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-2">
      {Array.from({ length: 24 }).map((_, i) => {
        const val = pairs[i] || "";
        return (
          <div
            key={i}
            className={`h-10 rounded-xl border text-[10px] font-mono flex items-center justify-center px-2 text-center
              ${
                val
                  ? "bg-white border-emerald-200 text-slate-900"
                  : "bg-slate-100 border-slate-200 text-slate-400"
              }`}
            title={val ? val : `Slot ${i + 1}`}
          >
            {val ? val : i + 1}
          </div>
        );
      })}
    </div>
  );
};