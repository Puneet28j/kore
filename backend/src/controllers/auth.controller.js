const authService = require("../services/auth.service");
const usersService = require("../services/users.service");
const { ok, fail } = require("../utils/apiResponse");

exports.login = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    // ✅ Basic validation
    if (!email || !password) {
      return fail(res, { status: 400, message: "Email and password are required" });
    }

    const { token, user } = await authService.login({ email, password });

    // ✅ Optional cookie-based auth (enable if you want)
    // res.cookie("token", token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "strict",
    //   maxAge: 7 * 24 * 60 * 60 * 1000,
    // });

    return ok(res, { message: "Login successful", data: { token, user } });
  } catch (err) {
    // ✅ Anti user-enumeration
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("invalid credentials")) {
      return fail(res, { status: 401, message: "Invalid email or password" });
    }
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    // ✅ req.user comes from auth.middleware (decoded JWT)
    const userId = req.user?.id;
    if (!userId) {
      return fail(res, { status: 401, message: "Not authorized" });
    }

    const user = await usersService.getMe(userId);
    return ok(res, { message: "Profile fetched", data: user });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    // ✅ If cookie-based auth enabled, clear it
    // res.clearCookie("token", {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "strict",
    // });

    return ok(res, { message: "Logged out successfully", data: null });
  } catch (err) {
    next(err);
  }
};