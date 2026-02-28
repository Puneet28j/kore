const router = require("express").Router();
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");

// ✅ Rate limiter for login (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts / 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

// 🔒 Login (Public)
router.post("/login", loginLimiter, authController.login);

// 👤 Current user profile
router.get("/me", auth, authController.me);

// 🚪 Logout
router.post("/logout", auth, authController.logout);

module.exports = router;