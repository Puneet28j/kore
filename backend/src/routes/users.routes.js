const router = require("express").Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const usersController = require("../controllers/users.controller");

/* --------------------------------------------------
   🔐 PROFILE ROUTES (Any logged-in user)
-------------------------------------------------- */

router.get("/me", auth, usersController.me);
router.patch("/me", auth, usersController.updateMe);
router.patch("/me/password", auth, usersController.changePassword);

/* --------------------------------------------------
   👑 ADMIN MANAGEMENT ROUTES
-------------------------------------------------- */

// Only Superadmin can create users
router.post("/", auth, role(["superadmin"]), usersController.createUser);

// Superadmin/Admin can view users
router.get("/", auth, role(["superadmin", "admin"]), usersController.listUsers);

// Superadmin can update user
router.patch(
  "/:id",
  auth,
  role(["superadmin"]),
  usersController.updateUser
);

// Superadmin can delete user
router.delete(
  "/:id",
  auth,
  role(["superadmin"]),
  usersController.deleteUser
);

module.exports = router;