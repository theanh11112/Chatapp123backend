// routes/reminderRoutes.js
const express = require("express");
const router = express.Router();
const reminderController = require("../controllers/reminderController");

// Tất cả endpoints reminder
router.post("/create", reminderController.createReminder);
router.post("/get-user-reminders", reminderController.getUserReminders);
router.post("/get-detail", reminderController.getReminderDetail);
router.patch("/update", reminderController.updateReminder);
router.post("/delete", reminderController.deleteReminder);
router.post("/upcoming", reminderController.getUpcomingReminders);
router.patch("/mark-sent", reminderController.markReminderAsSent);

module.exports = router;
