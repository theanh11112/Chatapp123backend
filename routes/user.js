// routes/user.js
const express = require("express");
const userController = require("../controllers/userController");

function requireRole(role) {
  return (req, res, next) => {
    const token = req.kauth.grant.access_token.content;
    const roles = token.realm_access?.roles || [];
    if (roles.includes(role)) return next();
    return res.status(403).json({ message: "Bạn không có quyền truy cập route này." });
  };
}

// ✅ Export hàm nhận keycloak
module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/get-me", keycloak.protect(), userController.getMe);
  router.get("/get-users", keycloak.protect(), userController.getUsers);
  router.post("/generate-zego-token", keycloak.protect(), userController.generateZegoToken);

  // Ví dụ route admin
  router.get("/admin/overview", keycloak.protect(), requireRole("admin"), (req, res) => {
    res.json({ message: "Chào Admin! Đây là trang quản lý tổng quan." });
  });

  return router;
};
