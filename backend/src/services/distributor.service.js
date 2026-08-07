const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Distributor = require("../models/Distributor");
const User = require("../models/User");

const ALLOWED_PAGE_LIMITS = [10, 20, 30, 50, 100, 200, 500, 1000];
const SALT_ROUNDS = 10;

const ensureValidId = (id, name = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`Invalid ${name}`);
    err.status = 400;
    throw err;
  }
};

const normalizePage = (page) => {
  const parsed = Number(page);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
};

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (ALLOWED_PAGE_LIMITS.includes(parsed)) return parsed;
  return 10;
};

const parseBoolean = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const v = String(value).trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;

  return fallback;
};

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const sanitizePayload = (body = {}) => {
  const payload = {
    name: body.name,
    email: body.email ? normalizeEmail(body.email) : undefined,
    phone: body.phone,

    companyName: body.companyName,
    gstNumber: body.gstNumber,

    billingAddress: body.billingAddress,
    shippingAddress: body.shippingAddress,

    paymentTerms: body.paymentTerms,
    discountPercentage:
      body.discountPercentage !== undefined
        ? Number(body.discountPercentage || 0)
        : undefined,
    creditLimit:
      body.creditLimit !== undefined
        ? Number(body.creditLimit || 0)
        : undefined,

    location: body.location,
    tag: body.tag,
    loginEnabled: parseBoolean(body.loginEnabled, undefined),
    isActive: parseBoolean(body.isActive, undefined),
  };

  // Ensure addresses are correctly formatted as objects if provided as strings
  if (body.billingAddress) {
    if (typeof body.billingAddress === "object") {
      payload.billingAddress = body.billingAddress;
    } else if (typeof body.billingAddress === "string") {
      payload.billingAddress = {
        attention: "",
        country: "",
        address1: body.billingAddress,
        address2: "",
        city: "",
        state: "",
        pinCode: "",
      };
    }
  }

  if (body.shippingAddress) {
    if (typeof body.shippingAddress === "object") {
      payload.shippingAddress = body.shippingAddress;
    } else if (typeof body.shippingAddress === "string") {
      payload.shippingAddress = {
        attention: "",
        country: "",
        address1: body.shippingAddress,
        address2: "",
        city: "",
        state: "",
        pinCode: "",
      };
    }
  }

  Object.keys(payload).forEach(
    (k) => payload[k] === undefined && delete payload[k]
  );

  if (!payload.location && body.billingAddress) {
    if (typeof body.billingAddress === "object") {
      payload.location = body.billingAddress.city || body.billingAddress.address1 || "";
    } else {
      payload.location = String(body.billingAddress).split(",")[0]?.trim() || "";
    }
  }

  return payload;
};

const buildUserPayload = async ({
  name,
  email,
  password,
  distributorId,
  isActive,
}) => {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !cleanEmail.includes("@")) {
    const err = new Error("Valid login email is required");
    err.status = 400;
    throw err;
  }

  if (!password || String(password).length < 6) {
    const err = new Error("Login password must be at least 6 characters");
    err.status = 400;
    throw err;
  }

  const exists = await User.findOne({ email: cleanEmail }).lean();
  if (exists) {
    const err = new Error("Login email already exists in users");
    err.status = 400;
    throw err;
  }

  const hashed = await bcrypt.hash(String(password), SALT_ROUNDS);

  return {
    name: String(name || "").trim(),
    email: cleanEmail,
    password: hashed,
    role: "distributor",
    distributorId,
    isActive: typeof isActive === "boolean" ? isActive : true,
  };
};

exports.createDistributor = async (body) => {
  if (!body?.name?.trim()) {
    const err = new Error("name is required");
    err.status = 400;
    throw err;
  }

  if (!body?.companyName?.trim()) {
    const err = new Error("companyName is required");
    err.status = 400;
    throw err;
  }

  if (!body?.email?.trim()) {
    const err = new Error("email is required");
    err.status = 400;
    throw err;
  }

  const payload = sanitizePayload(body);

  if (payload.isActive === undefined) payload.isActive = true;
  if (payload.loginEnabled === undefined) payload.loginEnabled = false;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const distributor = await Distributor.create([payload], { session });
    const createdDistributor = distributor[0];

    if (payload.loginEnabled) {
      const loginEmail = body.loginEmail || body.email;
      const loginPassword = body.loginPassword;

      const userPayload = await buildUserPayload({
        name: body.name,
        email: loginEmail,
        password: loginPassword,
        distributorId: createdDistributor._id,
        isActive: createdDistributor.isActive,
      });

      const user = await User.create([userPayload], { session });
      createdDistributor.userId = user[0]._id;
      if (loginPassword) createdDistributor.loginPasswordPlain = String(loginPassword);
      await createdDistributor.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return await Distributor.findById(createdDistributor._id).lean();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

exports.listDistributors = async ({
  page = 1,
  limit = 10,
  search = "",
  isActive,
} = {}) => {
  page = normalizePage(page);
  limit = normalizeLimit(limit);

  const q = { isDeleted: false };

  const parsedIsActive = parseBoolean(isActive, undefined);
  if (parsedIsActive !== undefined) q.isActive = parsedIsActive;

  const cleanSearch = String(search || "").trim();
  if (cleanSearch) {
    q.$or = [
      { name: { $regex: cleanSearch, $options: "i" } },
      { email: { $regex: cleanSearch, $options: "i" } },
      { phone: { $regex: cleanSearch, $options: "i" } },
      { companyName: { $regex: cleanSearch, $options: "i" } },
      { gstNumber: { $regex: cleanSearch, $options: "i" } },
      { location: { $regex: cleanSearch, $options: "i" } },
      { "billingAddress.city": { $regex: cleanSearch, $options: "i" } },
      { "billingAddress.state": { $regex: cleanSearch, $options: "i" } },
      { "billingAddress.address1": { $regex: cleanSearch, $options: "i" } },
      { "billingAddress.pinCode": { $regex: cleanSearch, $options: "i" } },
    ];
  }

  let [items, total] = await Promise.all([
    Distributor.find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Distributor.countDocuments(q),
  ]);

  // fetch associated users' emails in a single query
  const userIds = items.filter((d) => d.userId).map((d) => d.userId);
  if (userIds.length) {
    const users = await User.find({ _id: { $in: userIds } }, "email").lean();
    const emailMap = users.reduce((m, u) => {
      m[u._id.toString()] = u.email;
      return m;
    }, {});
    items = items.map((d) => {
      if (d.userId) d.loginEmail = emailMap[d.userId.toString()] || "";
      return d;
    });
  }

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
      pageSizeOptions: ALLOWED_PAGE_LIMITS,
    },
  };
};

exports.getDistributorById = async (id) => {
  ensureValidId(id, "distributor id");

  const distributor = await Distributor.findOne({
    _id: id,
    isDeleted: false,
  }).lean();
  if (!distributor) {
    const err = new Error("Distributor not found");
    err.status = 404;
    throw err;
  }

  if (distributor.userId) {
    const user = await User.findById(distributor.userId, "email").lean();
    distributor.loginEmail = user?.email || "";
  }

  return distributor;
};

exports.updateDistributor = async (id, body) => {
  ensureValidId(id, "distributor id");

  const distributor = await Distributor.findOne({ _id: id, isDeleted: false });
  if (!distributor) {
    const err = new Error("Distributor not found");
    err.status = 404;
    throw err;
  }

  if (body.name !== undefined && !String(body.name).trim()) {
    const err = new Error("name cannot be empty");
    err.status = 400;
    throw err;
  }

  if (body.companyName !== undefined && !String(body.companyName).trim()) {
    const err = new Error("companyName cannot be empty");
    err.status = 400;
    throw err;
  }

  // Guard against a dangling userId (the linked User doc was deleted, e.g. by
  // a DB reset script) — without this, the "sync linked user" block below
  // silently no-ops against a nonexistent _id and login stays broken forever.
  // Only auto-recreate when this call explicitly supplies fresh credentials
  // (via the "Update Login Credentials" flow), so unrelated profile edits
  // (name/address/GST) don't start failing just because login is broken.
  if (distributor.userId && body.loginEmail && body.loginPassword) {
    const linkedUserExists = await User.exists({ _id: distributor.userId });
    if (!linkedUserExists) {
      distributor.userId = undefined;
    }
  }

  const payload = sanitizePayload(body);
  // keep track of previous loginEnabled/user state so we can react later
  const hadUser = !!distributor.userId;

  Object.keys(payload).forEach((k) => {
    distributor[k] = payload[k];
  });

  await distributor.save();

  // if login has been enabled and there is no user yet, create one
  if (distributor.loginEnabled && !hadUser) {
    const loginEmail = body.loginEmail || distributor.email;
    const loginPassword = body.loginPassword;
    if (!loginEmail || !loginPassword) {
      const err = new Error(
        "loginEmail and loginPassword are required when enabling login"
      );
      err.status = 400;
      throw err;
    }
    const userPayload = await buildUserPayload({
      name: distributor.name,
      email: loginEmail,
      password: loginPassword,
      distributorId: distributor._id,
      isActive: distributor.isActive,
    });
    const user = await User.create(userPayload);
    distributor.userId = user._id;
    if (loginPassword) distributor.loginPasswordPlain = String(loginPassword);
    await distributor.save();
  }

  // sync linked user basic fields and credentials
  if (distributor.userId) {
    const userPatch = {};
    if (body.name !== undefined) userPatch.name = String(body.name).trim();

    // email is either directly supplied or derived from distributor email
    if (body.loginEmail !== undefined) {
      userPatch.email = normalizeEmail(body.loginEmail);
    } else if (body.email !== undefined) {
      userPatch.email = normalizeEmail(body.email);
    }

    let passwordChanged = false;
    if (body.loginPassword !== undefined && String(body.loginPassword).trim().length > 0) {
      userPatch.password = await bcrypt.hash(
        String(body.loginPassword),
        SALT_ROUNDS
      );
      distributor.loginPasswordPlain = String(body.loginPassword);
      // Invalidate all existing sessions when password is changed
      const linkedUser = await User.findById(distributor.userId).select('tokenVersion').lean();
      userPatch.tokenVersion = (linkedUser?.tokenVersion || 0) + 1;
      passwordChanged = true;
    }

    if (typeof payload.isActive === "boolean")
      userPatch.isActive = payload.isActive && distributor.loginEnabled;

    // also reflect loginEnabled toggling
    if (body.loginEnabled !== undefined && distributor.userId) {
      userPatch.isActive =
        distributor.loginEnabled &&
        (userPatch.isActive ?? distributor.isActive);
    }

    if (Object.keys(userPatch).length) {
      // if updating email we must avoid conflicts
      if (userPatch.email) {
        const exists = await User.findOne({
          email: userPatch.email,
          _id: { $ne: distributor.userId },
        }).lean();

        if (exists) {
          const err = new Error("Email already in use by another user");
          err.status = 400;
          throw err;
        }
      }

      await User.findByIdAndUpdate(distributor.userId, userPatch, {
        returnDocument: 'after',
      });
    }

    // Push instant logout via socket if password was reset
    if (passwordChanged) {
      const { emitSessionInvalidated } = require("../socket");
      emitSessionInvalidated(distributor.userId);
    }
  }

  const { emitDistributorUpdate } = require("../socket");
  emitDistributorUpdate(distributor._id);

  // loginEmail lives on the linked User doc, not on Distributor — attach it
  // to the response the same way list()/getById() do, so the frontend sees
  // the updated value immediately instead of it reverting to blank.
  const result = distributor.toObject();
  if (distributor.userId) {
    const linkedUser = await User.findById(distributor.userId, "email").lean();
    result.loginEmail = linkedUser?.email || "";
  }

  return result;
};

exports.toggleDistributorStatus = async (id) => {
  ensureValidId(id, "distributor id");

  const distributor = await Distributor.findOne({ _id: id, isDeleted: false });
  if (!distributor) {
    const err = new Error("Distributor not found");
    err.status = 404;
    throw err;
  }

  distributor.isActive = !distributor.isActive;
  await distributor.save();

  if (distributor.userId) {
    await User.findByIdAndUpdate(distributor.userId, {
      isActive: distributor.isActive,
    });
  }

  return distributor.toObject();
};

exports.deleteDistributor = async (id) => {
  ensureValidId(id, "distributor id");

  const distributor = await Distributor.findOne({ _id: id, isDeleted: false });
  if (!distributor) {
    const err = new Error("Distributor not found");
    err.status = 404;
    throw err;
  }

  distributor.isDeleted = true;
  distributor.isActive = false;
  await distributor.save();

  if (distributor.userId) {
    await User.findByIdAndUpdate(distributor.userId, {
      isActive: false,
    });
  }

  return true;
};
