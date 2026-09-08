const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

// ── Room helpers ──────────────────────────────
// Admin roles that get admin-room events
const ADMIN_ROLES = ["admin", "superadmin", "manager", "supervisor", "accountant", "investor"];

const adminRoom      = () => "room:admin";
const distributorRoom = (id) => `room:dist:${id}`;
const userRoom       = (id) => `room:user:${id}`;

// Socket room keys must always use the underlying identifier. Order records
// are sometimes returned with distributorId as an ObjectId and sometimes as
// a populated User document/lean object. String(populatedDocument) produces
// an object representation instead of the user's id, which silently sends
// order events to a room nobody joined.
const normalizeEntityId = (value) => {
  if (value === null || value === undefined) return null;

  const candidate = typeof value === "object"
    ? (value._id ?? value.id ?? value)
    : value;
  if (candidate === null || candidate === undefined) return null;

  const normalized = String(candidate);
  return normalized && normalized !== "[object Object]" ? normalized : null;
};

const buildOrderUpdatePayload = (order) => ({
  orderId: normalizeEntityId(order?.id ?? order?._id),
  status: order?.status,
  distributorId: normalizeEntityId(order?.distributorId),
});

// ── Init ──────────────────────────────────────
const init = (server) => {
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map(s => s.trim())
    : "*";

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 New client connected:", socket.id);

    // Client sends token right after connect for room assignment
    socket.on("authenticate", (token) => {
      try {
        const secret = process.env.JWT_SECRET || "supersecretkey";
        const decoded = jwt.verify(token, secret);
        const userId   = String(decoded.id || decoded._id || decoded.userId);
        const role     = (decoded.role || "").toLowerCase();
        const distId   = decoded.distributorId ? String(decoded.distributorId) : null;

        // Always join personal user room (for session invalidation)
        socket.join(userRoom(userId));

        if (ADMIN_ROLES.includes(role)) {
          socket.join(adminRoom());
          console.log(`✅ Socket ${socket.id} → admin room (role: ${role})`);
        } else if (role === "distributor") {
          // Join both user room and distributor room
          const dId = distId || userId;
          socket.join(distributorRoom(dId));
          socket.join(distributorRoom(userId)); // join by userId too for dual-ID lookups
          console.log(`✅ Socket ${socket.id} → distributor room (id: ${dId})`);
        }
      } catch (err) {
        // Token invalid or expired — socket stays connected but in no room
        // They still get broadcast events via io.emit() for safety
        console.warn(`⚠️ Socket ${socket.id} auth failed:`, err.message);
        socket.emit("authError", { message: "Invalid token — reconnect to reauthenticate" });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 Client disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};

// ── Safe emit helpers ─────────────────────────
// Emit to admins + a specific distributor (for order events)
const emitToAdminsAndDist = (event, data, distributorUserId) => {
  if (!io) return;
  io.to(adminRoom()).emit(event, data);
  const normalizedDistributorId = normalizeEntityId(distributorUserId);
  if (normalizedDistributorId) {
    io.to(distributorRoom(normalizedDistributorId)).emit(event, data);
  }
};

// Emit to admins only
const emitToAdmins = (event, data) => {
  if (!io) io?.emit(event, data);  // fallback if rooms not ready
  else io.to(adminRoom()).emit(event, data);
};

// Emit to everyone (catalog, session)
const emitAll = (event, data) => {
  if (io) io.emit(event, data);
};

// ──────────────────────────────────────────────
// ORDER events  (Admin + specific Distributor)
// ──────────────────────────────────────────────
const emitOrderUpdate = (order) => {
  if (!io) return;
  const data = buildOrderUpdatePayload(order);

  if (!data.orderId) {
    console.warn("⚠️ Skipping malformed order update without an order id");
    return;
  }

  // Admins always see order updates; distributor only sees own
  io.to(adminRoom()).emit("orderUpdated", data);
  if (data.distributorId) {
    io.to(distributorRoom(data.distributorId)).emit("orderUpdated", data);
  } else {
    // Keep the admin broadcast useful even when an old/corrupt order has no
    // resolvable owner; there is simply no safe distributor room to target.
    console.warn(`⚠️ Order ${data.orderId} update has no distributor id`);
  }
};

// ──────────────────────────────────────────────
// DISTRIBUTOR profile events
// ──────────────────────────────────────────────
const emitDistributorUpdate = (distributorId) => {
  if (!io) return;
  const data = { distributorId: normalizeEntityId(distributorId) };
  // Admins get it for list refresh; distributor gets it for credit refresh
  io.to(adminRoom()).emit("distributorUpdated", data);
  if (data.distributorId) {
    io.to(distributorRoom(data.distributorId)).emit("distributorUpdated", data);
  }
};

// ──────────────────────────────────────────────
// RETURN events  (Admin + specific Distributor)
// ──────────────────────────────────────────────
const emitReturnCreated = (returnDoc) => {
  if (!io) return;
  const data = {
    returnId:        String(returnDoc._id),
    returnNumber:    returnDoc.returnNumber,
    distributorId:   normalizeEntityId(returnDoc.distributorId),
    distributorName: returnDoc.distributorName,
    orderNumber:     returnDoc.orderNumber,
    totalPairs:      returnDoc.totalPairs,
  };
  io.to(adminRoom()).emit("returnCreated", data);
  if (data.distributorId) {
    io.to(distributorRoom(data.distributorId)).emit("returnCreated", data);
  }
};

// ──────────────────────────────────────────────
// GRN events  (Admin only)
// ──────────────────────────────────────────────
const emitGRNSubmitted = (grnDoc) => {
  if (!io) return;
  io.to(adminRoom()).emit("grnSubmitted", {
    grnId:      String(grnDoc._id),
    grnNumber:  grnDoc.grnNumber,
    refId:      grnDoc.refId,
    vendorName: grnDoc.vendorName,
    totalPairs: grnDoc.totalPairs,
  });
};

// ──────────────────────────────────────────────
// PO / Bill events  (Admin only)
// ──────────────────────────────────────────────
const emitPOEvent = (event, data) => {
  if (!io) return;
  io.to(adminRoom()).emit(event, data);
};

// ──────────────────────────────────────────────
// Catalog events  (All — distributors see new articles)
// ──────────────────────────────────────────────
const emitCatalogUpdated = (action, articleId) => {
  emitAll("catalogUpdated", { action, articleId: String(articleId) });
};

// ──────────────────────────────────────────────
// SESSION events  (Specific user only)
// ──────────────────────────────────────────────
const emitSessionInvalidated = (userId) => {
  if (!io) return;
  // Emit to personal room; also emit globally as fallback for unauthenticated sockets
  io.to(userRoom(String(userId))).emit("sessionInvalidated", { userId: String(userId) });
  // Fallback: emit globally too so sockets that haven't authenticated still get it
  io.emit("sessionInvalidated", { userId: String(userId) });
};

// ──────────────────────────────────────────────
// USER events  (Admin room + personal user room)
// ──────────────────────────────────────────────
// When any user record is created / updated / deleted — admins refresh the list
const emitUserUpdated = (userId) => {
  if (!io) return;
  io.to(adminRoom()).emit("userUpdated", { userId: String(userId) });
};

// When a user updates their own profile — emit to their personal room only
const emitUserProfileUpdated = (userId, data) => {
  if (!io) return;
  io.to(userRoom(String(userId))).emit("userProfileUpdated", { userId: String(userId), ...data });
};

// ──────────────────────────────────────────────
// VENDOR events  (Admin only)
// ──────────────────────────────────────────────
const emitVendorUpdated = (action, vendorId) => {
  if (!io) return;
  io.to(adminRoom()).emit("vendorUpdated", { action, vendorId: vendorId ? String(vendorId) : null });
};

// ── Activity Log  (Admin only) ─────────────────
const emitActivityLog = (logData) => {
  if (!io) return;
  io.to(adminRoom()).emit("activityLog", logData);
};

module.exports = {
  init, getIO,
  adminRoom, distributorRoom, userRoom,
  normalizeEntityId, buildOrderUpdatePayload,
  emitOrderUpdate, emitDistributorUpdate, emitReturnCreated,
  emitGRNSubmitted, emitPOEvent, emitCatalogUpdated,
  emitSessionInvalidated, emitActivityLog,
  emitUserUpdated, emitUserProfileUpdated, emitVendorUpdated,
  emitToAdmins, emitToAdminsAndDist, emitAll,
};
