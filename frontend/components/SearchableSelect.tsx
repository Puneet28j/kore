import React, { useState, useRef, useEffect } from "react";
import { Search, Plus, Trash2, ChevronDown, X } from "lucide-react";

interface SearchableSelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onAdd: (newValue: string) => void;
  onDelete: (valueToDelete: string) => void;
  placeholder?: string;
  required?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  value,
  onChange,
  onAdd,
  onDelete,
  placeholder = "Select...",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsAdding(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (opt: string) => {
    onChange(opt);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleAddNew = () => {
    if (newValue.trim()) {
      onAdd(newValue.trim());
      onChange(newValue.trim());
      setNewValue("");
      setIsAdding(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-colors ${isOpen ? 'ring-2 ring-indigo-500/20 border-indigo-500' : ''}`}
      >
        <span className={value ? "text-slate-900 font-medium" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={16} className="text-slate-400 ml-2" />
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              className="w-full p-2 outline-none text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-pointer group"
                  onClick={() => handleSelect(opt)}
                >
                  <span className={`text-sm ${value === opt ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>
                    {opt}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(opt);
                    }}
                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                No items found
              </div>
            )}
          </div>

          <div className="p-2 border-t border-slate-100 bg-slate-50/50">
            {isAdding ? (
              <div className="flex items-center gap-2 p-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Enter new name..."
                  className="flex-1 p-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <button
                  onClick={handleAddNew}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-sm"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAdding(true);
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition"
              >
                <Plus size={16} />
                Add New
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
