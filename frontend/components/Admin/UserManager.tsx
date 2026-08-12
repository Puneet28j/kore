import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Mail,
  Phone,
  AlertCircle,
  CheckCircle2,
  X,
  Edit3,
  Edit,
  Loader2,
  Plus,
  ChevronDown,
  Check,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { userService, roleService } from "../../services/userService";
import { User, UserRole } from "../../types";
import Switch from "../ui/Switch";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

interface RoleOption { name: string; label: string; base: boolean; id?: string }

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700",
  admin:      "bg-indigo-100 text-indigo-700",
  manager:    "bg-emerald-100 text-emerald-700",
  supervisor: "bg-amber-100 text-amber-700",
  accountant: "bg-rose-100 text-rose-700",
  investor:   "bg-cyan-100 text-cyan-700",
  staff:      "bg-slate-100 text-slate-600",
};
const colorFor = (name: string) => ROLE_COLORS[name] || "bg-violet-100 text-violet-700";

// ── Custom Role Dropdown ────────────────────────────────────────────────────
const RoleSelect: React.FC<{
  value: string;
  onChange: (val: string) => void;
  roles: RoleOption[];
  onRoleCreated: (r: RoleOption) => void;
  disabled?: boolean;
}> = ({ value, onChange, roles, onRoleCreated, disabled }) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false); setAdding(false); setNewLabel("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openDrop = () => {
    if (disabled) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setOpen(o => !o);
  };

  const selected = roles.find(r => r.name === value);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    try {
      setCreating(true);
      const created = await roleService.create(newLabel.trim());
      onRoleCreated(created);
      onChange(created.name);
      setAdding(false); setNewLabel(""); setOpen(false);
      toast.success(`Role "${created.label}" created`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create role");
    } finally { setCreating(false); }
  };

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={openDrop}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50">
        <span className="flex items-center gap-2">
          {selected
            ? <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${colorFor(selected.name)}`}>{selected.label}</span>
            : <span className="text-slate-400 text-sm">Select role...</span>}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="max-h-48 overflow-y-auto">
            {roles.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">Loading roles...</div>
            )}
            {roles.map(r => (
              <button key={r.name} type="button"
                onClick={() => { onChange(r.name); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors ${value === r.name ? 'bg-indigo-50/70' : ''}`}>
                <span className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${colorFor(r.name)}`}>{r.label}</span>
                  {!r.base && <span className="text-[9px] text-slate-400 font-semibold italic">custom</span>}
                </span>
                {value === r.name && <Check size={13} className="text-indigo-600 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100">
            {adding ? (
              <div className="flex items-center gap-2 px-3 py-2.5">
                <input autoFocus type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setAdding(false); setNewLabel(""); } }}
                  placeholder="e.g. Warehouse Manager"
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400" />
                <button type="button" onClick={handleCreate} disabled={creating || !newLabel.trim()}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1 shrink-0">
                  {creating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Add
                </button>
                <button type="button" onClick={() => { setAdding(false); setNewLabel(""); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg shrink-0">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
                <Plus size={13} /> Add New Role
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = usePageSize("userManager", 20);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    roleService.list().then(setRoles).catch(() => {});
  }, []);
  // --- Draft Persistence ---
  const savedUserDraftStr = localStorage.getItem("kore_user_draft");
  const savedUserDraft = savedUserDraftStr
    ? JSON.parse(savedUserDraftStr)
    : null;

  // Do not restore modal state to prevent sticky modals when changing tabs
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(
    savedUserDraft?.editingUser || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Password column + update credentials modal state
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null);
  const [showCredModal, setShowCredModal] = useState(false);
  const [credTargetUser, setCredTargetUser] = useState<User | null>(null);
  const [credPassword, setCredPassword] = useState("");
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [isUpdatingCred, setIsUpdatingCred] = useState(false);

  // Form State
  const [formData, setFormData] = useState(
    savedUserDraft?.formData || {
      name: "",
      email: "",
      password: "",
      role: "manager",
      phone: "",
    }
  );

  useEffect(() => {
    if (showModal) {
      localStorage.setItem(
        "kore_user_draft",
        JSON.stringify({
          showModal,
          editingUser,
          formData,
        })
      );
    } else {
      localStorage.removeItem("kore_user_draft");
    }
  }, [showModal, editingUser, formData]);

  const roleBadgeClass = (r: string) => colorFor(r);
  const roleLabel = (r: string) => roles.find(x => x.name === r)?.label || r;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.listUsers({ search, page, limit: pageSize });
      setUsers(response.data);
      setTotalPages(response.meta?.totalPages || response.meta?.pages || 1);
      setTotal(response.meta?.total || 0);
    } catch (err: any) {
      setError(err.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search, page]);

  // Real-time: refresh when user created/updated/deleted
  useEffect(() => {
    const handler = () => fetchUsers();
    window.addEventListener("userRefetch", handler);
    return () => window.removeEventListener("userRefetch", handler);
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({ name: "", email: "", password: "", role: "manager", phone: "" });
    setShowModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      phone: (user as any).phone || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const submitPromise = async () => {
      if (editingUser) {
        // Update
        const userId = editingUser.id || (editingUser as any)._id;
        if (!userId) {
          throw new Error("Cannot update: User ID is missing");
        }

        const updateData: any = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          phone: (formData as any).phone || null,
        };
        await userService.updateUser(userId, updateData);
      } else {
        // Create
        await userService.createUser(formData);
      }
      setShowModal(false);
      setFormData({ name: "", email: "", password: "", role: "manager", phone: "" });
      fetchUsers();
    };

    const promise = submitPromise();
    toast.promise(promise, {
      loading: editingUser ? "Updating user..." : "Creating user...",
      success: editingUser
        ? "User updated successfully"
        : "User created successfully",
      error: (err: any) =>
        err.message || `Failed to ${editingUser ? "update" : "create"} user`,
    });

    promise.finally(() => {
      setIsSubmitting(false);
    });
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credTargetUser) return;
    const userId = credTargetUser.id || (credTargetUser as any)._id;
    setIsUpdatingCred(true);
    const promise = userService.adminResetPassword(userId, credPassword).then(() => {
      setShowCredModal(false);
      setCredPassword("");
      setShowCredPassword(false);
      setCredTargetUser(null);
    });
    toast.promise(promise, {
      loading: "Updating password...",
      success: "Password updated successfully",
      error: (err: any) => err.message || "Failed to update password",
    });
    promise.finally(() => setIsUpdatingCred(false));
  };

  const handleStatusToggle = async (user: User, newStatus: boolean) => {
    const userId = user.id || (user as any)._id;
    if (!userId) return;

    try {
      await userService.updateUser(userId, { isActive: newStatus });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId || (u as any)._id === userId
            ? { ...u, isActive: newStatus }
            : u
        )
      );
      toast.success(
        `User ${newStatus ? "activated" : "deactivated"} successfully`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <button
          onClick={handleOpenAdd}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <UserPlus size={20} />
          )}
          Add New User
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X size={18} />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl">
          <CheckCircle2 size={20} />
          <p className="text-sm font-medium">{success}</p>
          <button onClick={() => setSuccess("")} className="ml-auto">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Users List (Mobile Card View & Desktop Table View) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Mobile View: Cards (Hidden on sm and larger) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm">Fetching users...</p>
              </div>
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              <Users size={48} className="mx-auto mb-3 opacity-20" />
              <p>No users found matching your search.</p>
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="p-4 space-y-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 uppercase">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.role !== UserRole.SUPERADMIN && (
                      <>
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Edit User"
                        >
                          <Edit3 size={18} />
                        </button>
                        <Switch
                          checked={user.isActive !== false}
                          onCheckedChange={(checked) =>
                            handleStatusToggle(user, checked)
                          }
                          className="scale-90"
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleBadgeClass(user.role)}`}>
                    <Shield size={10} />
                    {roleLabel(user.role)}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">
                    Joined:{" "}
                    {(user as any).createdAt
                      ? new Date((user as any).createdAt).toLocaleDateString()
                      : "N/A"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View: Table (Hidden on mobile) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  User
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Role
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Join Date
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Password
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm">Fetching users...</p>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    <Users size={48} className="mx-auto mb-3 opacity-20" />
                    <p>No users found matching your search.</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 uppercase">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {user.name}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleBadgeClass(user.role)}`}>
                        <Shield size={12} />
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {(user as any).createdAt
                        ? new Date((user as any).createdAt).toLocaleDateString()
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-slate-800">
                          {visiblePasswordId === (user.id || (user as any)._id)
                            ? ((user as any).passwordPlain || "—")
                            : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const uid = user.id || (user as any)._id;
                            setVisiblePasswordId((prev: string | null) => prev === uid ? null : uid);
                          }}
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          {visiblePasswordId === (user.id || (user as any)._id)
                            ? <EyeOff size={14} />
                            : <Eye size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.role !== UserRole.SUPERADMIN && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Edit User Role"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => {
                                setCredTargetUser(user);
                                setCredPassword("");
                                setShowCredPassword(false);
                                setShowCredModal(true);
                              }}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Update Password"
                            >
                              <KeyRound size={18} />
                            </button>
                            <Switch
                              checked={user.isActive !== false}
                              onCheckedChange={(checked) =>
                                handleStatusToggle(user, checked)
                              }
                              className="scale-90"
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={pageSize} onPageSizeChange={setPageSize} />
        </div>
      </div>

      {/* Update Credentials Modal */}
      {showCredModal && credTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Update Password</h3>
                <p className="text-sm text-slate-500">For {credTargetUser.name}</p>
              </div>
              <button
                onClick={() => setShowCredModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateCredentials} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showCredPassword ? "text" : "password"}
                    required
                    minLength={6}
                    disabled={isUpdatingCred}
                    value={credPassword}
                    onChange={e => setCredPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPassword((v: boolean) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    {showCredPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCredModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingCred || credPassword.length < 6}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center"
                >
                  {isUpdatingCred
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal (Add/Edit) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {editingUser ? "Edit User" : "Add New User"}
                </h3>
                <p className="text-sm text-slate-500">
                  {editingUser
                    ? `Updating details for ${editingUser.name}`
                    : "Create a new system user or staff."}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="John Doe"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    disabled={isSubmitting}
                    minLength={6}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Minimum 6 characters"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  System Role
                </label>
                <RoleSelect
                  value={formData.role}
                  onChange={val => setFormData({ ...formData, role: val })}
                  roles={roles}
                  onRoleCreated={r => setRoles(prev => [...prev, r])}
                  disabled={isSubmitting}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Superadmin accounts cannot be created or converted via this interface.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Mobile Number <span className="text-slate-400 font-normal text-xs">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="tel"
                    disabled={isSubmitting}
                    value={(formData as any).phone || ""}
                    onChange={e => setFormData({ ...formData, phone: e.target.value } as any)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">WhatsApp notifications ke liye use hoga</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : editingUser ? (
                    "Update User"
                  ) : (
                    "Create User"
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

export default UserManager;
