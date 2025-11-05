// routes/guestRoutes.js
const express = require("express");
const guestController = require("../controllers/guestController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  // Đảm bảo guestController.guestInfo KHÔNG undefined
  console.log("✅ guestController =", guestController);

  router.get(
    "/info",
    keycloak.protect(),
    requireRole("guest"),
    guestController.guestInfo
  );

  return router;
};
