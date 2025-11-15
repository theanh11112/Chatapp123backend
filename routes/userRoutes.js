const express = require("express");
const userController = require("../controllers/userController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get(
    "/me",
    keycloak.protect(),
    requireRole("user", "admin", "moderator"),
    userController.getProfile
  );
  router.patch(
    "/me",
    keycloak.protect(),
    requireRole("user", "admin", "moderator"),
    userController.updateProfile
  );

  router.post(
    "/room",
    keycloak.protect(),
    requireRole("user", "admin", "moderator"),
    userController.createPrivateRoom
  );
  router.post(
    "/message",
    keycloak.protect(),
    requireRole("user", "admin", "moderator", "bot"),
    userController.sendMessage
  );

  router.get(
    "/friends",
    keycloak.protect(),
    requireRole("user", "admin", "moderator"),
    userController.getFriends
  );

  return router;
};
