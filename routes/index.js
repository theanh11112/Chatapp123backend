const express = require("express");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const moderatorRoutes = require("./moderatorRoutes");
const botRoutes = require("./botRoutes");
const guestRoutes = require("./guestRoutes");
const callRoutes = require("./callRoutes");
const chatRoutes = require("./chatRoutes");
const taskRoutes = require("./taskRoutes");
const notificationRoutes = require("./notificationRoutes");
const analyticsRoutes = require("./analyticsRoutes");
const reminderRoutes = require("./reminderRoutes");
const settingsRoutes = require("./settingsRoutes");
const reportsRoutes = require("./reportRoutes");
const taskMessageRoutes = require("./taskMessageRoutes");
const e2eeRoutes = require("../routes/e2eeRoutes");

module.exports = (keycloak) => {
  const router = express.Router();

  router.use("/users", userRoutes(keycloak));
  router.use("/admin", adminRoutes(keycloak));
  router.use("/moderator", moderatorRoutes(keycloak));
  router.use("/bot", botRoutes(keycloak));
  router.use("/guest", guestRoutes(keycloak));
  router.use("/call", callRoutes(keycloak));
  router.use("/chat", chatRoutes);
  router.use("/task", taskRoutes(keycloak));
  router.use("/notification", notificationRoutes(keycloak));
  router.use("/analytics", analyticsRoutes(keycloak));
  router.use("/reminders", reminderRoutes);
  router.use("/settings", settingsRoutes(keycloak));
  router.use("/reports", reportsRoutes(keycloak));
  router.use("/taskMessage", taskMessageRoutes);
  router.use("/e2ee", e2eeRoutes);

  router.get("/", (req, res) => {
    res.json({ message: "✅ API Server is running with Keycloak" });
  });

  return router;
};
