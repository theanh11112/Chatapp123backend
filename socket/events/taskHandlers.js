// socket/taskHandlers.js
const taskController = require("../controllers/taskController");

module.exports = (socket) => {
  console.log("🔌 Setting up task socket handlers for user:", socket.userId);

  // TASK SOCKET EVENTS
  socket.on("task_assign", (data) => {
    console.log("📨 Received task_assign event:", data);
    taskController.handleTaskAssignment(socket, data);
  });

  socket.on("task_update_status", (data) => {
    console.log("📨 Received task_update_status event:", data);
    taskController.handleTaskStatusUpdate(socket, data);
  });

  socket.on("task_join_room", (data) => {
    console.log("📨 Received task_join_room event:", data);
    taskController.handleJoinTaskRoom(socket, data);
  });

  socket.on("task_leave_room", (data) => {
    console.log("📨 Received task_leave_room event:", data);
    taskController.handleLeaveTaskRoom(socket, data);
  });

  socket.on("task_add_comment", (data) => {
    console.log("📨 Received task_add_comment event:", data);
    taskController.handleTaskComment(socket, data);
  });

  console.log("✅ Task socket handlers registered successfully");
};
