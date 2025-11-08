const express = require("express");
const guestController = require("../controllers/guestController");
const { requireRole } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  router.get("/public-info", keycloak.protect(), requireRole("guest"), guestController.getPublicRooms);
  router.get("/intro", (req, res) => res.json({ message: "Xin chào khách! Bạn chỉ có thể xem thông tin công khai." }));

  return router;
};
