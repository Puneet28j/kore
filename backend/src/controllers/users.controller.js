const usersService = require("../services/users.service");
const { created, ok, fail } = require("../utils/apiResponse");
const mongoose = require("mongoose");

/* --------------------------------------------------
   👤 CREATE USER (Superadmin Only)
-------------------------------------------------- */
exports.createUser = async (req, res, next) => {
  try {
    const user = await usersService.createUser(req.body);
    return created(res, { message: "User created successfully", data: user });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   📋 LIST USERS (Admin / Superadmin)
-------------------------------------------------- */
exports.listUsers = async (req, res, next) => {
  try {
    const data = await usersService.listUsers(req.query);

    return ok(res, {
      message: "Users fetched successfully",
      data: data.items,
      meta: data.meta,
    });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   👤 GET MY PROFILE
-------------------------------------------------- */
exports.me = async (req, res, next) => {
  try {
    const user = await usersService.getMe(req.user.id);
    return ok(res, { message: "Profile fetched", data: user });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   ✏ UPDATE PROFILE
-------------------------------------------------- */
exports.updateMe = async (req, res, next) => {
  try {
    const user = await usersService.updateMe(req.user.id, req.body);
    return ok(res, { message: "Profile updated successfully", data: user });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   🔐 CHANGE PASSWORD
-------------------------------------------------- */
exports.changePassword = async (req, res, next) => {
  try {
    await usersService.changePassword(req.user.id, req.body);
    return ok(res, { message: "Password updated successfully", data: null });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   🔄 UPDATE USER ROLE (Superadmin)
-------------------------------------------------- */
exports.updateUserRole = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const actorUserId = req.user?.id;

    if (!actorUserId) {
      return fail(res, { status: 401, message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return fail(res, { status: 400, message: "Invalid user ID" });
    }

    const user = await usersService.updateUserRole(
      actorUserId,
      targetUserId,
      req.body.role
    );

    return ok(res, { message: "User role updated", data: user });
  } catch (err) {
    next(err);
  }
};

/* --------------------------------------------------
   🗑 DELETE USER (Superadmin)
-------------------------------------------------- */
exports.deleteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const actorUserId = req.user?.id;

    if (!actorUserId) {
      return fail(res, { status: 401, message: "Not authorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return fail(res, { status: 400, message: "Invalid user ID" });
    }

    await usersService.deleteUser(actorUserId, targetUserId);

    return ok(res, { message: "User deleted successfully", data: null });
  } catch (err) {
    next(err);
  }
};