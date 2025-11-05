const express = require("express");
const moderatorController = require("../controllers/moderatorController");
const { requireRole } = require("../utils/auth");

console.log("✅ moderatorController =", moderatorController);

module.exports = (keycloak) => {
  const router = express.Router();

  router.get(
    "/dashboard",
    keycloak.protect(),
    requireRole("moderator"),
    moderatorController.getDashboard
  );

  return router;
};
