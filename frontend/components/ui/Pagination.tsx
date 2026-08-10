import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "../../utils/usePageSize";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  onPageSizeChange?: (size: number) => void;
}

// Windowed page list with ellipsis, e.g. current=6,total=10 -> [1,'…',5,6,7,'…',10]
function getPageList(current: number, total: number): (number | "…")[] {
  const delta = 1;
  const range: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }
  const withDots: (number | "…")[] = [];
  let last = 0;
  for (const i of range) {
    if (last) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last > 1) withDots.push("…");
    }
    withDots.push(i);
    last = i;
  }
  return withDots;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  onPageSizeChange,
}) => {
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const startIdx = (currentPage - 1) * (itemsPerPage || 0) + 1;
  const endIdx = Math.min(currentPage * (itemsPerPage || 0), totalItems || 0);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-100 flex-wrap gap-2">
      {/* Left: results info + page size */}
      <div className="flex items-center gap-3">
        {totalItems !== undefined && itemsPerPage !== undefined && (
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{startIdx}</span>–
            <span className="font-semibold text-slate-700">{endIdx}</span> of{" "}
            <span className="font-semibold text-slate-700">{totalItems}</span>
          </p>
        )}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Show</span>
            <select
              value={itemsPerPage}
              onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">per page</span>
          </div>
        )}
      </div>

      {/* Right: page navigation */}
      {totalPages > 1 && (
        <nav className="flex items-center gap-0.5">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="inline-flex items-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={16} />
          </button>

          {getPageList(currentPage, totalPages).map((page, i) =>
            page === "…" ? (
              <span key={`dots-${i}`} className="px-2 py-1.5 text-sm text-slate-400">…</span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  currentPage === page
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            )
          )}

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex items-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
};

export default Pagination;
