const express = require("express");
const adminController = require("../controllers/adminController")
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get(
    "/overview",
    keycloak.protect(),
    requireRole("admin"),
    adminController.getDashboard
  );

  // Thêm các API admin khác ở đây
  // router.post("/create-user", keycloak.protect(), requireRole("admin"), adminController.createUser);

  return router;
};
