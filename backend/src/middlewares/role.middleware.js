module.exports = function role(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    next();
  };
};