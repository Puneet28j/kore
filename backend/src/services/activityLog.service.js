const ActivityLog = require("../models/ActivityLog");
const { getIO, emitActivityLog } = require("../socket");

// Map activity-log actions → notification events
const ACTION_TO_NOTIF = {
  // System & Auth
  LOGIN:               "USER_LOGIN",
  PASSWORD_RESET:      "PASSWORD_RESET",
  USER_CREATED:        "USER_CREATED",
  USER_UPDATED:        "USER_UPDATED",
  // Orders
  ORDER_CREATED:       "ORDER_PLACED",
  ORDER_DELETED:       "ORDER_CANCELLED",
  ORDER_EDITED:        "ORDER_EDITED",
  PREORDER_RELEASED:   "PREORDER_RELEASED",
  RETURN_PROCESSED:    "RETURN_PROCESSED",
  // Payments
  PAYMENT_RECEIVED:    "PAYMENT_RECEIVED",
  // Distributors
  DISTRIBUTOR_CREATED: "NEW_DISTRIBUTOR",
  DISTRIBUTOR_UPDATED: "DISTRIBUTOR_UPDATED",
  DISTRIBUTOR_DELETED: "DISTRIBUTOR_DELETED",
  // Catalogue & Stock
  CATALOG_CREATED:     "CATALOG_CREATED",
  CATALOG_UPDATED:     "CATALOG_UPDATED",
  CATALOG_DELETED:     "CATALOG_DELETED",
  STOCK_INWARD:        "STOCK_INWARD",
  STOCK_OUTWARD:       "STOCK_OUTWARD",
  INWARD:              "STOCK_INWARD",
  // PO & GRN
  PO_CREATED:          "PO_CREATED",
  PO_UPDATED:          "PO_UPDATED",
  PO_APPROVED:         "PO_APPROVED",
  PO_REJECTED:         "PO_REJECTED",
  PO_DELETED:          "PO_DELETED",
  GRN_SUBMITTED:       "GRN_SUBMITTED",
};

/**
 * Create an activity log entry and emit socket event.
 * @param {Object} params
 * @param {string} params.action - enum value
 * @param {string} params.entityType - enum value
 * @param {string} [params.entityId]
 * @param {string} params.description - human-readable
 * @param {Object} [params.metadata]
 * @param {Object} [params.user] - { _id, name, role } from req.user (optional)
 */
const createLog = async ({ action, entityType, entityId = null, description, metadata = {}, user = null, emitRealtime = true }) => {
  try {
    const log = await ActivityLog.create({
      userId: user?._id || user?.id || null,
      userName: user?.name || "System",
      userRole: user?.role || "",
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      description,
      metadata,
    });

    if (emitRealtime) try {
      emitActivityLog({
        _id: log._id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        description: log.description,
        userName: log.userName,
        userRole: log.userRole,
        createdAt: log.createdAt,
      });
    } catch {
      // socket not ready — ignore
    }

    // Fire notification if this action maps to a notification event
    const notifEvent = ACTION_TO_NOTIF[action];
    if (notifEvent) {
      try {
        const notification = require("./notification.service");
        notification.dispatch(notifEvent, {
          data: { "Action": description, "By": user?.name || "System" },
          subject: `[Kore] ${description}`,
        });
      } catch { /* never crash */ }
    }

    return log;
  } catch (err) {
    // Never crash the caller if logging fails
    console.error("[ActivityLog] Failed to log:", err.message);
    return null;
  }
};

const list = async ({ page = 1, limit = 50, action, entityType, userId, startDate, endDate } = {}) => {
  const query = {};
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (userId) query.userId = userId;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    ActivityLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    ActivityLog.countDocuments(query),
  ]);

  return {
    items,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

module.exports = { createLog, list };
