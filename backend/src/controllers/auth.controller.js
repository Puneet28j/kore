const authService = require("../services/auth.service");
const usersService = require("../services/users.service");
const { ok, fail } = require("../utils/apiResponse");
const activityLog = require("../services/activityLog.service");

const getRedirectModule = (role) => {
  switch (role) {
    case "superadmin":
      return "superadmin";
    case "admin":
      return "admin";
    case "manager":
    case "supervisor":
    case "accountant":
    case "staff":
      return "staff-panel";
    case "distributor":
      return "distributor";
    default:
      return "unknown";
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return fail(res, {
        status: 400,
        message: "Email and password are required",
      });
    }

    const { token, user } = await authService.login({ email, password });

    let creditInfo = null;
    if (user.role === "distributor" && user.distributorId) {
      const Distributor = require("../models/Distributor");
      const Order = require("../models/Order");
      const dist = await Distributor.findById(user.distributorId).lean();
      if (dist) {
        const pendingOrders = await Order.aggregate([
          {
            $match: {
              distributorId: user._id,
              // RECEIVED is included here (unlike order-listing filters
              // elsewhere) — a delivered-but-unpaid order still owes real
              // money and must keep counting against credit until paid.
              status: { $nin: ["CANCELLED", "PRE_BOOKED", "CONFIRMED"] },
            },
          },
          {
            $group: {
              _id: null,
              // creditAmount is the REGULAR-only slice of a mixed order
              // (see createOrder's own credit check); amountPaid is the
              // running total from the payment ledger (see
              // order.controller.js recordPayment) — whatever's still
              // outstanding after payments keeps counting, clamped at 0 so
              // an overpayment can't create negative "pending".
              totalPending: {
                $sum: {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ["$creditAmount", { $ifNull: ["$finalAmount", "$totalAmount"] }] },
                        { $ifNull: ["$amountPaid", 0] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        ]);
        const pendingValue = pendingOrders[0]?.totalPending || 0;
        creditInfo = {
          creditLimit: dist.creditLimit || 0,
          discountPercentage: dist.discountPercentage || 0,
          availableCredit: (dist.creditLimit || 0) - pendingValue,
          paymentTerms: dist.paymentTerms || "",
          tag: dist.tag || "online",
          companyName: dist.companyName || "",
          phone: dist.phone || "",
        };
      }
    }

    const userData = user.toObject ? user.toObject() : { ...user };
    // toObject() drops the 'id' virtual — add it explicitly so the frontend can rely on it
    userData.id = String(userData._id || "");
    if (creditInfo) {
      Object.assign(userData, creditInfo);
    }

    activityLog.createLog({
      action: "LOGIN",
      entityType: "AUTH",
      entityId: String(user._id),
      description: `${user.name} (${user.role}) logged in`,
      user,
    });

    return ok(res, {
      message: "Login successful",
      data: {
        token,
        user: userData,
        auth: {
          role: user.role,
          distributorId: user.distributorId || null,
          redirectModule: getRedirectModule(user.role),
        },
      },
    });
  } catch (err) {
    const msg = String(err.message || "").toLowerCase();

    if (msg.includes("invalid credentials")) {
      return fail(res, {
        status: 401,
        message: "Invalid email or password",
      });
    }

    if (msg.includes("inactive")) {
      return fail(res, {
        status: 403,
        message: err.message || "Account is inactive",
      });
    }

    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return fail(res, { status: 401, message: "Not authorized" });
    }

    const user = await usersService.getMe(userId);

    let creditInfo = null;
    if (user.role === "distributor" && user.distributorId) {
      const Distributor = require("../models/Distributor");
      const Order = require("../models/Order");
      const dist = await Distributor.findById(user.distributorId).lean();
      if (dist) {
        const pendingOrders = await Order.aggregate([
          {
            $match: {
              distributorId: user._id,
              // RECEIVED is included here (unlike order-listing filters
              // elsewhere) — a delivered-but-unpaid order still owes real
              // money and must keep counting against credit until paid.
              status: { $nin: ["CANCELLED", "PRE_BOOKED", "CONFIRMED"] },
            },
          },
          {
            $group: {
              _id: null,
              // creditAmount is the REGULAR-only slice of a mixed order
              // (see createOrder's own credit check); amountPaid is the
              // running total from the payment ledger (see
              // order.controller.js recordPayment) — whatever's still
              // outstanding after payments keeps counting, clamped at 0 so
              // an overpayment can't create negative "pending".
              totalPending: {
                $sum: {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ["$creditAmount", { $ifNull: ["$finalAmount", "$totalAmount"] }] },
                        { $ifNull: ["$amountPaid", 0] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        ]);
        const pendingValue = pendingOrders[0]?.totalPending || 0;
        creditInfo = {
          creditLimit: dist.creditLimit || 0,
          discountPercentage: dist.discountPercentage || 0,
          availableCredit: (dist.creditLimit || 0) - pendingValue,
          paymentTerms: dist.paymentTerms || "",
          tag: dist.tag || "online",
          companyName: dist.companyName || "",   // ← show in sidebar
          phone: dist.phone || "",
        };
      }
    }

    const userData = user.toObject ? user.toObject() : { ...user };
    // toObject() drops the 'id' virtual — add it explicitly so the frontend can rely on it
    userData.id = String(userData._id || "");
    if (creditInfo) {
      Object.assign(userData, creditInfo);
    }

    return ok(res, {
      message: "Profile fetched",
      data: {
        user: userData,
        auth: {
          role: user.role,
          distributorId: user.distributorId || null,
          redirectModule: getRedirectModule(user.role),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    return ok(res, {
      message: "Logged out successfully",
      data: null,
    });
  } catch (err) {
    next(err);
  }
};
