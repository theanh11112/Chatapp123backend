// routes/reminderRoutes.js - ĐÃ CẬP NHẬT
const express = require("express");
const router = express.Router();
const reminderController = require("../controllers/reminderController");

// 🎯 REMINDER ROUTES - ĐÃ CẬP NHẬT VỚI MULTIPLE RECIPIENTS
router.post("/create", reminderController.createReminder);
router.post("/get-user-reminders", reminderController.getUserReminders);
router.post("/get-detail", reminderController.getReminderDetail);
router.patch("/update", reminderController.updateReminder);
router.post("/delete", reminderController.deleteReminder);
router.post("/upcoming", reminderController.getUpcomingReminders);
router.patch("/mark-sent", reminderController.markReminderAsSent);
router.post("/get-all", reminderController.getAllReminders);

module.exports = router;
