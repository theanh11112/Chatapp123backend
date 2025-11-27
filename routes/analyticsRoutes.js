// routes/analyticsRoutes.js
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");

// Tất cả endpoints analytics
router.get("/system-stats", analyticsController.getSystemStats);
router.get("/user-activity", analyticsController.getUserActivity);
router.get("/task-distribution", analyticsController.getTaskDistribution);
router.get("/performance", analyticsController.getSystemPerformance);
router.post("/usage-stats", analyticsController.getUsageStats);

module.exports = router;
