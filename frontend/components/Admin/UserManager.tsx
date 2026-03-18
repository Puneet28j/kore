import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Mail,
  Trash2,
  MoreVertical,
  AlertCircle,
  CheckCircle2,
  X,
  Edit3,
  Edit,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { userService } from "../../services/userService";
import { User, UserRole } from "../../types";
import Switch from "../ui/Switch";

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  // Form State
  const [formData, setFormData] = useState(
    savedUserDraft?.formData || {
      name: "",
      email: "",
      password: "",
      role: "manager",
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

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.listUsers({ search });
      setUsers(response.data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({ name: "", email: "", password: "", role: "manager" });
    setShowModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "", // Password not editable here for simplicity/security
      role: user.role,
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
        };
        await userService.updateUser(userId, updateData);
      } else {
        // Create
        await userService.createUser(formData);
      }
      setShowModal(false);
      setFormData({ name: "", email: "", password: "", role: "manager" });
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
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.role === UserRole.SUPERADMIN
                        ? "bg-purple-100 text-purple-700"
                        : user.role === UserRole.ADMIN
                        ? "bg-indigo-100 text-indigo-700"
                        : user.role === UserRole.MANAGER
                        ? "bg-emerald-100 text-emerald-700"
                        : user.role === UserRole.SUPERVISOR
                        ? "bg-amber-100 text-amber-700"
                        : user.role === UserRole.ACCOUNTANT
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Shield size={10} />
                    {user.role}
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
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
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
                    colSpan={4}
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
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          user.role === UserRole.SUPERADMIN
                            ? "bg-purple-100 text-purple-700"
                            : user.role === UserRole.ADMIN
                            ? "bg-indigo-100 text-indigo-700"
                            : user.role === UserRole.MANAGER
                            ? "bg-emerald-100 text-emerald-700"
                            : user.role === UserRole.SUPERVISOR
                            ? "bg-amber-100 text-amber-700"
                            : user.role === UserRole.ACCOUNTANT
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <Shield size={12} />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {(user as any).createdAt
                        ? new Date((user as any).createdAt).toLocaleDateString()
                        : "N/A"}
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
        </div>
      </div>

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
                <select
                  disabled={isSubmitting}
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%2364748b%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-size-[1.25rem_1.25rem] bg-position-[right_0.5rem_center] bg-no-repeat disabled:opacity-50"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="accountant">Accountant</option>
                  {editingUser?.role === UserRole.SUPERADMIN && (
                    <option value="superadmin">Superadmin</option>
                  )}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Superadmin accounts cannot be created or converted via this
                  interface.
                </p>
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
