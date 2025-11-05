const express = require("express");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const moderatorRoutes = require("./moderatorRoutes");
const botRoutes = require("./botRoutes");
const guestRoutes = require("./guestRoutes");

module.exports = (keycloak) => {
  const router = express.Router();

  router.use("/users", userRoutes(keycloak));
  router.use("/admin", adminRoutes(keycloak));
  router.use("/moderator", moderatorRoutes(keycloak));
  router.use("/bot", botRoutes(keycloak));
  router.use("/guest", guestRoutes(keycloak));

  router.get("/", (req, res) => {
    res.json({ message: "✅ API Server is running with Keycloak" });
  });

  return router;
};
