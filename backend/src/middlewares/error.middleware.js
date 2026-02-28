module.exports = function errorMiddleware(err, req, res, next) {
  console.log("🔥 ERROR CAUGHT:");
  console.log("Message:", err.message);
  console.log("Status:", err.status);
  console.log("Stack:", err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server Error",
  });
};