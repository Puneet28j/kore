const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const masterCatalogRoutes = require("./routes/masterCatalogRoutes");


const categoryRoutes = require("./routes/category.routes");
const brandRoutes = require("./routes/brand.routes");
const manufacturerRoutes = require("./routes/manufacturer.routes");
const unitRoutes = require("./routes/unit.routes");


const poRoutes = require("./routes/purchaseOrder.routes");
const vendorRoutes = require("./routes/vendor.routes");
const grnRoutes = require("./routes/grn.routes");

const errorMiddleware = require("./middlewares/error.middleware");

const app = express();

/* ------------------ GLOBAL MIDDLEWARES ------------------ */

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // for form-data parsing

/* ------------------ STATIC FOLDER ------------------ */
// catalog image access
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ------------------ ROUTES ------------------ */

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

// ✅ NEW MASTER CATALOG ROUTE
app.use("/api/master-catalog", masterCatalogRoutes);



app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/manufacturers", manufacturerRoutes);
app.use("/api/units", unitRoutes);

app.use("/api/purchase-orders", poRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/grn", grnRoutes);
/* ------------------ 404 HANDLER ------------------ */
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

/* ------------------ ERROR HANDLER ------------------ */
app.use(errorMiddleware);

module.exports = app;