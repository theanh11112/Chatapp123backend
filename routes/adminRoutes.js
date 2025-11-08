const express = require("express");
const adminController = require("../controllers/adminController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/overview", keycloak.protect(), requireRole("admin"), adminController.getDashboard);
  router.get("/users", keycloak.protect(), requireRole("admin"), adminController.getAllUsers);
  router.delete("/room/:roomId", keycloak.protect(), requireRole("admin"), adminController.deleteRoom);
  router.get("/analytics", keycloak.protect(), requireRole("admin"), adminController.getSystemAnalytics);
  router.post("/ban-user/:id", keycloak.protect(), requireRole("admin"), adminController.banUser);
  router.post("/assign-role", keycloak.protect(), requireRole("admin"), adminController.assignRole);

  return router;
};
