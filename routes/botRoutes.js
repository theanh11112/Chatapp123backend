const express = require("express");
const botController = require("../controllers/botController");
const { requireRole } = require("../utils/auth");
console.log("✅ botController =", botController);
module.exports = (keycloak) => {
    
  const router = express.Router();

  router.get("/info", keycloak.protect(), requireRole("bot"), botController.botInfo);

  return router;
};
