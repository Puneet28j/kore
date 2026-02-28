const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const masterCatalogRoutes = require("./routes/masterCatalogRoutes");

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

/* ------------------ 404 HANDLER ------------------ */
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

/* ------------------ ERROR HANDLER ------------------ */
app.use(errorMiddleware);

module.exports = app;