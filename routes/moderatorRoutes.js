const express = require("express");
const moderatorController = require("../controllers/moderatorController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/users", keycloak.protect(), requireRole("moderator"), moderatorController.getVerifiedUsers);
  router.delete("/message/:id", keycloak.protect(), requireRole("moderator"), moderatorController.deleteMessage);
  router.post("/warn-user/:id", keycloak.protect(), requireRole("moderator"), moderatorController.warnUser);
  router.delete("/room/:roomId", keycloak.protect(), requireRole("moderator"), moderatorController.deleteRoom);
  router.get("/statistics", keycloak.protect(), requireRole("moderator"), moderatorController.viewStatistics);

  return router;
};
