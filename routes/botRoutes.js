const express = require("express");
const botController = require("../controllers/botController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.post("/notify", keycloak.protect(), requireRole("bot"), botController.sendAutoNotification);
  router.post("/message", keycloak.protect(), requireRole("bot"), botController.sendSystemMessage);

  return router;
};
