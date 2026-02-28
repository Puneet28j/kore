const User = require("../models/User");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const ALLOWED_ROLES = ["admin", "staff"]; // 👈 superadmin API se create nahi hoga
const SALT_ROUNDS = 10;

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
};

exports.createUser = async ({ name, email, password, role }) => {
  // ✅ Basic validation (service level safety)
  if (!name || String(name).trim().length < 2) {
    const err = new Error("Name is required (min 2 characters)");
    err.status = 400;
    throw err;
  }

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes("@")) {
    const err = new Error("Valid email is required");
    err.status = 400;
    throw err;
  }

  if (!password || String(password).length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.status = 400;
    throw err;
  }

  // ✅ Role safety: superadmin create disabled
  const cleanRole = role ? String(role).toLowerCase().trim() : "staff";
  if (!ALLOWED_ROLES.includes(cleanRole)) {
    const err = new Error(`Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`);
    err.status = 400;
    throw err;
  }

  // ✅ Check unique email
  const exists = await User.findOne({ email: cleanEmail }).lean();
  if (exists) {
    const err = new Error("Email already exists");
    err.status = 400;
    throw err;
  }

  // ✅ Hash password
  const hashed = await bcrypt.hash(String(password), SALT_ROUNDS);

  // ✅ Create user
  const user = await User.create({
    name: String(name).trim(),
    email: cleanEmail,
    password: hashed,
    role: cleanRole,
  });

  return sanitizeUser(user);
};

exports.listUsers = async ({
  page = 1,
  limit = 20,
  search = "",
  role = "",
} = {}) => {
  // ✅ Safe pagination
  page = Math.max(parseInt(page, 10) || 1, 1);
  limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const q = {};
  const cleanSearch = String(search || "").trim();
  if (cleanSearch) {
    q.$or = [
      { name: { $regex: cleanSearch, $options: "i" } },
      { email: { $regex: cleanSearch, $options: "i" } },
    ];
  }

  const cleanRole = String(role || "")
    .trim()
    .toLowerCase();
  if (cleanRole) q.role = cleanRole;

  // ✅ Never list passwords anyway (model select:false already)
  const [items, total] = await Promise.all([
    User.find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(q),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

exports.getUserById = async (id) => {
  const user = await User.findById(id).lean();
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  return user;
};

exports.updateUserRole = async (actorUserId, targetUserId, role) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    const err = new Error("Invalid user ID");
    err.status = 400;
    throw err;
  }

  const cleanRole = String(role || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_ROLES.includes(cleanRole)) {
    const err = new Error(`Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`);
    err.status = 400;
    throw err;
  }

  // ✅ Fetch target user first for protection checks
  const target = await User.findById(targetUserId).lean();
  if (!target) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  // ✅ Block changes on superadmin
  if (target.role === "superadmin") {
    const err = new Error("Cannot change superadmin role");
    err.status = 403;
    throw err;
  }

  // ✅ Block self role change (safety)
  if (String(actorUserId) === String(targetUserId)) {
    const err = new Error("You cannot change your own role");
    err.status = 403;
    throw err;
  }

  const updated = await User.findByIdAndUpdate(
    targetUserId,
    { role: cleanRole },
    { new: true, runValidators: true },
  );

  return sanitizeUser(updated);
};

exports.deleteUser = async (actorUserId, targetUserId) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    const err = new Error("Invalid user ID");
    err.status = 400;
    throw err;
  }

  const target = await User.findById(targetUserId).lean();
  if (!target) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  // ✅ Block deleting superadmin
  if (target.role === "superadmin") {
    const err = new Error("Cannot delete superadmin");
    err.status = 403;
    throw err;
  }

  // ✅ Block self delete (safety)
  if (String(actorUserId) === String(targetUserId)) {
    const err = new Error("You cannot delete your own account");
    err.status = 403;
    throw err;
  }

  await User.findByIdAndDelete(targetUserId);
  return true;
};
exports.getMe = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  return user;
};

exports.updateMe = async (userId, { name, email }) => {
  const update = {};

  if (name) {
    const cleanName = String(name).trim();
    if (cleanName.length < 2) {
      const err = new Error("Name must be at least 2 characters");
      err.status = 400;
      throw err;
    }
    update.name = cleanName;
  }

  if (email) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.includes("@")) {
      const err = new Error("Valid email is required");
      err.status = 400;
      throw err;
    }

    const exists = await User.findOne({
      email: cleanEmail,
      _id: { $ne: userId },
    }).lean();
    if (exists) {
      const err = new Error("Email already in use");
      err.status = 400;
      throw err;
    }
    update.email = cleanEmail;
  }

  const user = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  }).lean();

  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  return user;
};

exports.changePassword = async (userId, { oldPassword, newPassword }) => {
  if (!oldPassword || !newPassword) {
    const err = new Error("Old password and new password are required");
    err.status = 400;
    throw err;
  }

  if (String(newPassword).length < 6) {
    const err = new Error("New password must be at least 6 characters");
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId).select("+password");
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const isMatch = await bcrypt.compare(String(oldPassword), user.password);
  if (!isMatch) {
    const err = new Error("Old password is incorrect");
    err.status = 400;
    throw err;
  }

  user.password = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  await user.save();
  return true;
};
