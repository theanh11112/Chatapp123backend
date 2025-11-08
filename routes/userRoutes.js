const express = require("express");
const userController = require("../controllers/userController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/me", keycloak.protect(), requireRole("user"), userController.getProfile);
  router.patch("/me", keycloak.protect(), requireRole("user"), userController.updateProfile);
  router.post("/room", keycloak.protect(), requireRole("user"), userController.createPrivateRoom);
  router.post("/message", keycloak.protect(), requireRole("user"), userController.sendMessage);
  router.get("/friends", keycloak.protect(), requireRole("user"), userController.getFriends);

  return router;
};
