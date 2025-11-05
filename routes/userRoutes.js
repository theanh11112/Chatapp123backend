const express = require("express");
const userController = require("../controllers/userController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  // User routes chung
  router.get("/get-me", keycloak.protect(), userController.getMe);
  router.put("/update-me", keycloak.protect(), userController.updateMe);
  router.get("/get-users", keycloak.protect(), userController.getUsers);
  router.get(
    "/get-all-verified-users",
    keycloak.protect(),
    userController.getAllVerifiedUsers
  );
  router.get("/get-requests", keycloak.protect(), userController.getRequests);
  router.get("/get-friends", keycloak.protect(), userController.getFriends);

  // Call / Zego
  router.post("/generate-zego-token", keycloak.protect(), userController.generateZegoToken);
  router.post("/start-audio-call", keycloak.protect(), userController.startAudioCall);
  router.post("/start-video-call", keycloak.protect(), userController.startVideoCall);
  router.get("/get-call-logs", keycloak.protect(), userController.getCallLogs);

  // Role test
  router.get("/role-test", keycloak.protect(), userController.roleTest);

  return router;
};
