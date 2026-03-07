import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Eye, EyeOff, Loader2, Mail, User, Lock } from "lucide-react";
import { User as UserType } from "../types";
import { userService } from "../services/userService";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  onProfileUpdate: (updatedUser: UserType) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onProfileUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  useEffect(() => {
    if (isOpen && user) {
      setProfileForm({
        name: user.name,
        email: user.email,
      });
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  }, [isOpen, user]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!profileForm.email.trim()) {
      toast.error("Email is required");
      return;
    }

    setLoading(true);
    const updatePromise = userService.updateProfile({
      name: profileForm.name,
      email: profileForm.email,
    });

    toast.promise(updatePromise, {
      loading: "Updating profile...",
      success: "Profile updated successfully",
      error: (err: any) => err.message || "Failed to update profile",
    });

    updatePromise
      .then((updatedUser) => {
        onProfileUpdate(updatedUser);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordForm.oldPassword) {
      toast.error("Old password is required");
      return;
    }

    if (!passwordForm.newPassword) {
      toast.error("New password is required");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setLoading(true);
    const changePromise = userService.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });

    toast.promise(changePromise, {
      loading: "Changing password...",
      success: "Password changed successfully",
      error: (err: any) => err.message || "Failed to change password",
    });

    changePromise
      .then(() => {
        setPasswordForm({
          oldPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-slate-900">My Profile</h3>
            <p className="text-sm text-slate-500">
              Manage your account settings
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-all ${
              activeTab === "profile"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <User size={16} />
              Profile
            </div>
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-all ${
              activeTab === "password"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Lock size={16} />
              Password
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "profile" ? (
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    disabled={loading}
                    value={profileForm.name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, name: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                    placeholder="Your name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="email"
                    disabled={loading}
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, email: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {loading ? "Updating..." : "Update Profile"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type={showPasswords.old ? "text" : "password"}
                    disabled={loading}
                    value={passwordForm.oldPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        oldPassword: e.target.value,
                      })
                    }
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({
                        ...showPasswords,
                        old: !showPasswords.old,
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.old ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    disabled={loading}
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        newPassword: e.target.value,
                      })
                    }
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({
                        ...showPasswords,
                        new: !showPasswords.new,
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.new ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    disabled={loading}
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirmPassword: e.target.value,
                      })
                    }
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({
                        ...showPasswords,
                        confirm: !showPasswords.confirm,
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.confirm ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {loading ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
