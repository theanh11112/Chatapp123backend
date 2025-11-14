const express = require("express");
const moderatorController = require("../controllers/moderatorController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/users", keycloak.protect(), requireRole("moderator","admin"), moderatorController.getVerifiedUsers);
  router.delete("/message/:id", keycloak.protect(), requireRole("moderator","admin"), moderatorController.deleteMessage);
  router.post("/warn-user/:id", keycloak.protect(), requireRole("moderator","admin"), moderatorController.warnUser);
  router.delete("/room/:roomId", keycloak.protect(), requireRole("moderator","admin"), moderatorController.deleteRoom);
  router.get("/statistics", keycloak.protect(), requireRole("moderator","admin"), moderatorController.viewStatistics);

  return router;
};
