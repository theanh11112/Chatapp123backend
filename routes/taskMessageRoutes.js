const express = require("express");
const router = express.Router();
const taskMessageController = require("../controllers/taskMessageController");

router.post("/send", taskMessageController.sendMessage);
router.post("/get-task-messages", taskMessageController.getTaskMessages);
router.patch("/edit", taskMessageController.editMessage);
router.post("/delete", taskMessageController.deleteMessage);

module.exports = router;
