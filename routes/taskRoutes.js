// routes/taskRoutes.js
const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");

// 🆕 TASK ROUTES

router.post("/create", taskController.createTask);
router.post("/get-user-tasks", taskController.getUserTasks);
router.post("/get-detail", taskController.getTaskDetail);
router.patch("/update", taskController.updateTask);
router.post("/delete", taskController.deleteTask);

// 🆕 REMINDER ROUTES
router.post("/reminder/create", taskController.createReminder);
router.post("/reminders/get-user-reminders", taskController.getUserReminders);

module.exports = router;
