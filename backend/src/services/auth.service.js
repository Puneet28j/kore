const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async ({ email, password }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();

  const user = await User.findOne({ email: cleanEmail }).select("+password");
  if (!user) {
    const err = new Error("Invalid credentials");
    err.status = 400;
    throw err;
  }

  if (user.isActive === false) {
    const err = new Error("Account is inactive. Please contact administrator.");
    err.status = 403;
    throw err;
  }

  const isMatch = await bcrypt.compare(String(password), user.password);
  if (!isMatch) {
    const err = new Error("Invalid credentials");
    err.status = 400;
    throw err;
  }

  const token = jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      distributorId: user.distributorId ? user.distributorId.toString() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  const safeUser = user.toObject();
  delete safeUser.password;

  return {
    token,
    user: {
      ...safeUser,
      id: safeUser._id,
      distributorId: safeUser.distributorId || null,
    },
  };
};