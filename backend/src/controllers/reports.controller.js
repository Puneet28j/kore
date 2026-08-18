const Order = require("../models/Order");
const Return = require("../models/Return");
const MasterCatalog = require("../models/MasterCatalog");
const masterCatalogService = require("../services/masterCatalogService");

const getStockReport = async (req, res) => {
  try {
    const { page = 1, limit = 50, q } = req.query;
    const query = { isDeleted: false };
    if (q) query.articleName = { $regex: q, $options: "i" };

    const total = await MasterCatalog.countDocuments(query);
    const [catalogs, bookedMap] = await Promise.all([
      MasterCatalog.find(query)
        // category/brand/company aren't stored directly on MasterCatalog —
        // only their _id references (categoryId/brandId/manufacturerCompanyId)
        // are. Populate so the report can show names instead of raw ObjectIds.
        .populate("categoryId", "name")
        .populate("brandId", "name")
        .populate("manufacturerCompanyId", "name")
        .sort({ articleName: 1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      masterCatalogService.getBookedQuantityMap(),
    ]);

    const data = catalogs.map((c) => {
      const variants = (c.variants || []).map((v) => {
        // sizeMap — lean() returns plain object, Map returns Map
        const rawSizeMap = v.sizeMap instanceof Map
          ? Object.fromEntries(v.sizeMap)
          : (v.sizeMap && typeof v.sizeMap === "object" ? v.sizeMap : {});

        const sizeStock = {};
        let variantTotalStock = 0;
        Object.entries(rawSizeMap).forEach(([sz, cell]) => {
          const c = cell && typeof cell === "object" ? cell : {};
          const qty = Number(c.qty || 0);
          sizeStock[sz] = { qty };
          variantTotalStock += qty;
        });

        const rawSizeQuantities = v.sizeQuantities instanceof Map
          ? Object.fromEntries(v.sizeQuantities)
          : (v.sizeQuantities && typeof v.sizeQuantities === "object" ? v.sizeQuantities : {});

        return {
          variantId: v._id,
          itemName: v.itemName,
          // Carton SKU lives on the variant, not the article — there is no
          // article-level sku field on MasterCatalog.
          sku: v.sku || "",
          color: v.color,
          sizeRange: v.sizeRange,
          mrp: v.mrp,
          costPrice: v.costPrice || 0,
          listingStatus: v.listingStatus,
          // Effective stage — the variant's own GRN-driven override, falling
          // back to the parent article's stage. Same rule Master Stock uses,
          // so a mixed article (some variants arrived, some still pending)
          // reports each variant under the correct RFD/Pre-Order filter.
          stage: v.stage || c.stage || "AVAILABLE",
          sizeQuantities: rawSizeQuantities,
          sizeStock,
          totalStock: variantTotalStock,
          booked: bookedMap.totals[String(v._id)] || 0,
        };
      });

      const articleTotalStock = variants.reduce((s, v) => s + v.totalStock, 0);

      return {
        articleId: c._id,
        articleName: c.articleName,
        category: c.categoryId?.name || "",
        brand: c.brandId?.name || "",
        company: c.manufacturerCompanyId?.name || "",
        totalVariants: variants.length,
        totalStock: articleTotalStock,
        variants,
      };
    });

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getDispatchReport = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    // Base this report on cartons actually scanned from the warehouse rather
    // than the order's current lifecycle status.
    const query = { "items.fulfilledCartonCount": { $gt: 0 } };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const [total, orders, summaryRows] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .sort({ date: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Order.aggregate([
        { $match: query },
        { $unwind: "$items" },
        { $match: { "items.fulfilledCartonCount": { $gt: 0 } } },
        {
          $group: {
            _id: "$_id",
            dispatchedCartons: { $sum: { $ifNull: ["$items.fulfilledCartonCount", 0] } },
            dispatchedAmount: {
              $sum: {
                $cond: [
                  { $gt: [{ $ifNull: ["$items.cartonCount", 0] }, 0] },
                  {
                    $multiply: [
                      { $ifNull: ["$items.price", 0] },
                      {
                        $divide: [
                          { $ifNull: ["$items.fulfilledCartonCount", 0] },
                          "$items.cartonCount",
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalCartons: { $sum: "$dispatchedCartons" },
            totalAmount: { $sum: "$dispatchedAmount" },
          },
        },
      ]),
    ]);

    const data = orders.map((order) => {
      const dispatchedCartons = (order.items || []).reduce(
        (sum, item) => sum + (Number(item.fulfilledCartonCount) || 0),
        0
      );
      const dispatchedAmount = (order.items || []).reduce((sum, item) => {
        const orderedCartons = Number(item.cartonCount) || 0;
        const dispatched = Number(item.fulfilledCartonCount) || 0;
        if (orderedCartons <= 0 || dispatched <= 0) return sum;
        return sum + (Number(item.price) || 0) * (dispatched / orderedCartons);
      }, 0);

      return {
        ...order,
        id: String(order._id),
        dispatchedCartons,
        dispatchedAmount: Math.round(dispatchedAmount * 100) / 100,
      };
    });

    res.json({
      success: true,
      data,
      summary: {
        totalOrders: summaryRows[0]?.totalOrders || 0,
        totalCartons: summaryRows[0]?.totalCartons || 0,
        totalAmount: Math.round((summaryRows[0]?.totalAmount || 0) * 100) / 100,
      },
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getReturnReport = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) { const end = new Date(endDate); end.setHours(23,59,59,999); query.createdAt.$lte = end; }
    }

    const total = await Return.countDocuments(query);
    const returns = await Return.find(query)
      .sort({ date: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const summary = {
      totalReturns: total,
      totalCartons: returns.reduce((s, r) => s + (r.totalCartons || 0), 0),
      totalPairs: returns.reduce((s, r) => s + (r.totalPairs || 0), 0),
    };

    res.json({
      success: true,
      data: returns,
      summary,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStockReport, getDispatchReport, getReturnReport };
