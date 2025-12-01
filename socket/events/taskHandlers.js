// socket/events/taskHandlers.js - FIXED VERSION
const mongoose = require("mongoose");
const Task = require("../../models/Task");
const TaskMessage = require("../../models/TaskMessage");
const User = require("../../models/user");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId) {
    console.log("❌ No currentUserId found in socket.user");
    return;
  }

  console.log(
    `🔌 Setting up REAL-TIME task handlers for user: ${currentUserId}`
  );

  // ==================== TASK ROOM MANAGEMENT ====================
  socket.on("join_task_room", async ({ taskId }, callback) => {
    try {
      console.log("📨 Received join_task_room:", {
        taskId,
        userId: currentUserId,
      });

      if (!taskId) {
        console.log("❌ Missing taskId");
        return callback?.({
          success: false,
          error: "taskId là bắt buộc",
        });
      }

      // Kiểm tra task tồn tại
      const task = await Task.findById(taskId);
      if (!task) {
        return callback?.({
          success: false,
          error: "Task không tồn tại",
        });
      }

      // Chuyển đổi currentUserId sang string để so sánh
      const currentUserIdStr = currentUserId.toString();
      const assignerIdStr = task.assignerId?.toString() || "";

      // Kiểm tra user có quyền truy cập task không
      let hasAccess = false;

      // Kiểm tra nếu user là người giao task (assigner)
      if (assignerIdStr === currentUserIdStr) {
        hasAccess = true;
        console.log(`✅ User ${currentUserId} is assigner of task ${taskId}`);
      }
      // Kiểm tra nếu user được assign task (trong assigneeIds)
      else if (task.assigneeIds && Array.isArray(task.assigneeIds)) {
        console.log(`🔍 Checking assigneeIds:`, {
          assigneeIds: task.assigneeIds,
          type: typeof task.assigneeIds,
          isArray: Array.isArray(task.assigneeIds),
        });

        // Convert all assigneeIds to string for comparison
        const assigneeIdStrings = task.assigneeIds.map((id) => {
          if (id && typeof id === "object" && id._id) {
            return id._id.toString();
          }
          return id.toString();
        });

        console.log(`🔍 assigneeIdStrings:`, assigneeIdStrings);
        console.log(`🔍 currentUserIdStr:`, currentUserIdStr);

        hasAccess = assigneeIdStrings.includes(currentUserIdStr);

        if (hasAccess) {
          console.log(`✅ User ${currentUserId} is assignee of task ${taskId}`);
        }
      }

      if (!hasAccess) {
        console.log(`❌ User ${currentUserId} has no access to task ${taskId}`);
        console.log(`📊 Task info:`, {
          assignerId: task.assignerId,
          assigneeIds: task.assigneeIds,
          currentUserId: currentUserIdStr,
        });
        return callback?.({
          success: false,
          error: "Bạn không có quyền truy cập task này",
        });
      }

      const roomName = `task_${taskId}`;

      // Join room
      socket.join(roomName);
      console.log(`✅ User ${currentUserId} joined task room: ${roomName}`);

      // Response
      callback?.({
        success: true,
        message: "Đã tham gia phòng chat task",
        room: roomName,
        taskId,
      });

      // Thông báo cho những người khác trong room
      socket.to(roomName).emit("user_joined_task_room", {
        taskId,
        userId: currentUserId,
        username: socket.user?.username || currentUserId,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("❌ Error join_task_room:", err);
      console.error("Error details:", {
        message: err.message,
        stack: err.stack,
      });
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  socket.on("leave_task_room", ({ taskId }, callback) => {
    try {
      console.log("📨 Received leave_task_room:", {
        taskId,
        userId: currentUserId,
      });

      if (!taskId) {
        console.log("❌ Missing taskId");
        return callback?.({
          success: false,
          error: "taskId là bắt buộc",
        });
      }

      const roomName = `task_${taskId}`;

      // Leave room
      socket.leave(roomName);
      console.log(`✅ User ${currentUserId} left task room: ${roomName}`);

      // Response
      callback?.({
        success: true,
        message: "Đã rời phòng chat task",
        room: roomName,
        taskId,
      });

      // Thông báo cho những người khác trong room
      socket.to(roomName).emit("user_left_task_room", {
        taskId,
        userId: currentUserId,
        username: socket.user?.username || currentUserId,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("❌ Error leave_task_room:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ==================== TASK MESSAGES ====================
  socket.on("new_task_message", async (data, callback) => {
    try {
      console.log("📨 Received new_task_message:", data);

      const { taskId, message, messageType = "text", replyTo } = data;

      // Validate required fields
      if (!taskId || !message) {
        console.log("❌ Missing required fields");
        return callback?.({
          success: false,
          error: "taskId và message là bắt buộc",
        });
      }

      // Kiểm tra task tồn tại
      const task = await Task.findById(taskId);
      if (!task) {
        return callback?.({
          success: false,
          error: "Task không tồn tại",
        });
      }

      // Kiểm tra user có quyền gửi tin nhắn không
      const currentUserIdStr = currentUserId.toString();
      const assignerIdStr = task.assignerId?.toString() || "";

      let hasAccess = false;

      // Kiểm tra nếu user là người giao task
      if (assignerIdStr === currentUserIdStr) {
        hasAccess = true;
      }
      // Kiểm tra nếu user được assign task
      else if (task.assigneeIds && Array.isArray(task.assigneeIds)) {
        const assigneeIdStrings = task.assigneeIds.map((id) => {
          if (id && typeof id === "object" && id._id) {
            return id._id.toString();
          }
          return id.toString();
        });
        hasAccess = assigneeIdStrings.includes(currentUserIdStr);
      }

      if (!hasAccess) {
        console.log(
          `❌ User ${currentUserId} has no access to send message to task ${taskId}`
        );
        return callback?.({
          success: false,
          error: "Bạn không có quyền gửi tin nhắn trong task này",
        });
      }

      // Tạo tin nhắn mới
      const newMessage = await TaskMessage.create({
        taskId,
        senderId: currentUserId,
        message: message,
        messageType: messageType,
        replyTo: replyTo || null,
      });

      console.log("✅ Task message created:", newMessage._id);

      // Populate thông tin sender
      const populatedMessage = await TaskMessage.findById(newMessage._id)
        .populate({
          path: "sender",
          select: "username keycloakId avatar",
        })
        .populate({
          path: "replyToMessage",
          select: "message senderId createdAt",
          populate: {
            path: "sender",
            select: "username keycloakId",
          },
        });

      // Chuẩn bị data để broadcast
      const messageForClients = {
        _id: populatedMessage._id,
        id: populatedMessage._id.toString(),
        taskId: populatedMessage.taskId,
        message: populatedMessage.message,
        messageType: populatedMessage.messageType,
        fileUrl: populatedMessage.fileUrl,
        fileName: populatedMessage.fileName,
        isEdited: populatedMessage.isEdited,
        editedAt: populatedMessage.editedAt,
        replyTo: populatedMessage.replyTo,
        sender: {
          keycloakId: populatedMessage.senderId,
          username: populatedMessage.sender?.username || "Unknown",
          avatar: populatedMessage.sender?.avatar || null,
        },
        replyToMessage: populatedMessage.replyToMessage
          ? {
              _id: populatedMessage.replyToMessage._id,
              message: populatedMessage.replyToMessage.message,
              sender: {
                keycloakId: populatedMessage.replyToMessage.senderId,
                username:
                  populatedMessage.replyToMessage.sender?.username || "Unknown",
              },
              createdAt: populatedMessage.replyToMessage.createdAt,
            }
          : null,
        createdAt: populatedMessage.createdAt,
        updatedAt: populatedMessage.updatedAt,
      };

      // Broadcast đến tất cả users trong room
      const roomName = `task_${taskId}`;
      io.to(roomName).emit("new_task_message", {
        taskId,
        message: messageForClients,
      });

      console.log(`✅ Message broadcasted to room: ${roomName}`);

      // Response
      callback?.({
        success: true,
        message: "Tin nhắn đã được gửi",
        data: messageForClients,
      });
    } catch (err) {
      console.error("❌ Error new_task_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  socket.on("edit_task_message", async (data, callback) => {
    try {
      console.log("📨 Received edit_task_message:", data);

      const { messageId, taskId, newMessage } = data;

      // Validate required fields
      if (!messageId || !taskId || !newMessage) {
        console.log("❌ Missing required fields");
        return callback?.({
          success: false,
          error: "messageId, taskId và newMessage là bắt buộc",
        });
      }

      // Tìm tin nhắn
      const message = await TaskMessage.findById(messageId);
      if (!message) {
        return callback?.({
          success: false,
          error: "Tin nhắn không tồn tại",
        });
      }

      // Kiểm tra user có phải là người gửi không
      if (message.senderId !== currentUserId) {
        return callback?.({
          success: false,
          error: "Chỉ người gửi mới có thể chỉnh sửa tin nhắn",
        });
      }

      // Kiểm tra message có thuộc task này không
      if (message.taskId.toString() !== taskId) {
        return callback?.({
          success: false,
          error: "Tin nhắn không thuộc task này",
        });
      }

      // Cập nhật tin nhắn
      message.message = newMessage;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      console.log("✅ Task message updated:", messageId);

      // Populate lại thông tin
      const updatedMessage = await TaskMessage.findById(message._id)
        .populate({
          path: "sender",
          select: "username keycloakId avatar",
        })
        .populate({
          path: "replyToMessage",
          select: "message senderId createdAt",
          populate: {
            path: "sender",
            select: "username keycloakId",
          },
        });

      // Chuẩn bị data để broadcast
      const messageForClients = {
        _id: updatedMessage._id,
        id: updatedMessage._id.toString(),
        taskId: updatedMessage.taskId,
        message: updatedMessage.message,
        messageType: updatedMessage.messageType,
        fileUrl: updatedMessage.fileUrl,
        fileName: updatedMessage.fileName,
        isEdited: updatedMessage.isEdited,
        editedAt: updatedMessage.editedAt,
        replyTo: updatedMessage.replyTo,
        sender: {
          keycloakId: updatedMessage.senderId,
          username: updatedMessage.sender?.username || "Unknown",
          avatar: updatedMessage.sender?.avatar || null,
        },
        replyToMessage: updatedMessage.replyToMessage
          ? {
              _id: updatedMessage.replyToMessage._id,
              message: updatedMessage.replyToMessage.message,
              sender: {
                keycloakId: updatedMessage.replyToMessage.senderId,
                username:
                  updatedMessage.replyToMessage.sender?.username || "Unknown",
              },
              createdAt: updatedMessage.replyToMessage.createdAt,
            }
          : null,
        createdAt: updatedMessage.createdAt,
        updatedAt: updatedMessage.updatedAt,
      };

      // Broadcast đến tất cả users trong room
      const roomName = `task_${taskId}`;
      io.to(roomName).emit("task_message_updated", {
        taskId,
        messageId: messageId,
        updatedMessage: messageForClients,
      });

      console.log(`✅ Message update broadcasted to room: ${roomName}`);

      // Response
      callback?.({
        success: true,
        message: "Tin nhắn đã được cập nhật",
        data: messageForClients,
      });
    } catch (err) {
      console.error("❌ Error edit_task_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  socket.on("delete_task_message", async (data, callback) => {
    try {
      console.log("📨 Received delete_task_message:", data);

      const { messageId, taskId } = data;

      // Validate required fields
      if (!messageId || !taskId) {
        console.log("❌ Missing required fields");
        return callback?.({
          success: false,
          error: "messageId và taskId là bắt buộc",
        });
      }

      // Tìm tin nhắn
      const message = await TaskMessage.findById(messageId);
      if (!message) {
        return callback?.({
          success: false,
          error: "Tin nhắn không tồn tại",
        });
      }

      // Kiểm tra user có phải là người gửi không
      if (message.senderId !== currentUserId) {
        return callback?.({
          success: false,
          error: "Chỉ người gửi mới có thể xóa tin nhắn",
        });
      }

      // Kiểm tra message có thuộc task này không
      if (message.taskId.toString() !== taskId) {
        return callback?.({
          success: false,
          error: "Tin nhắn không thuộc task này",
        });
      }

      // Xóa tin nhắn
      await TaskMessage.findByIdAndDelete(messageId);

      console.log("✅ Task message deleted:", messageId);

      // Broadcast đến tất cả users trong room
      const roomName = `task_${taskId}`;
      io.to(roomName).emit("task_message_deleted", {
        taskId,
        messageId: messageId,
      });

      console.log(`✅ Message deletion broadcasted to room: ${roomName}`);

      // Response
      callback?.({
        success: true,
        message: "Tin nhắn đã được xóa",
        data: { messageId, taskId },
      });
    } catch (err) {
      console.error("❌ Error delete_task_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ==================== TYPING INDICATORS ====================
  socket.on("task_typing_start", ({ taskId }) => {
    if (taskId) {
      const roomName = `task_${taskId}`;
      socket.to(roomName).emit("task_user_typing", {
        taskId,
        userId: currentUserId,
        username: socket.user?.username || currentUserId,
        isTyping: true,
        timestamp: new Date(),
      });
    }
  });

  socket.on("task_typing_stop", ({ taskId }) => {
    if (taskId) {
      const roomName = `task_${taskId}`;
      socket.to(roomName).emit("task_user_typing", {
        taskId,
        userId: currentUserId,
        username: socket.user?.username || currentUserId,
        isTyping: false,
        timestamp: new Date(),
      });
    }
  });

  // ==================== GET TASK MESSAGES ====================
  socket.on("get_task_messages", async ({ taskId }, callback) => {
    try {
      console.log("📨 Received get_task_messages:", { taskId });

      if (!taskId) {
        console.log("❌ Missing taskId");
        return callback?.([]);
      }

      // Kiểm tra task tồn tại
      const task = await Task.findById(taskId);
      if (!task) {
        console.log("❌ Task not found:", taskId);
        return callback?.([]);
      }

      // Kiểm tra user có quyền truy cập không
      const currentUserIdStr = currentUserId.toString();
      const assignerIdStr = task.assignerId?.toString() || "";

      let hasAccess = false;

      if (assignerIdStr === currentUserIdStr) {
        hasAccess = true;
      } else if (task.assigneeIds && Array.isArray(task.assigneeIds)) {
        const assigneeIdStrings = task.assigneeIds.map((id) => {
          if (id && typeof id === "object" && id._id) {
            return id._id.toString();
          }
          return id.toString();
        });
        hasAccess = assigneeIdStrings.includes(currentUserIdStr);
      }

      if (!hasAccess) {
        console.log(
          "❌ User not authorized to access task messages:",
          currentUserId
        );
        return callback?.([]);
      }

      // Lấy tất cả tin nhắn của task với populate
      const messages = await TaskMessage.find({ taskId })
        .populate({
          path: "sender",
          select: "username keycloakId avatar",
        })
        .populate({
          path: "replyToMessage",
          select: "message senderId createdAt",
          populate: {
            path: "sender",
            select: "username keycloakId",
          },
        })
        .sort({ createdAt: 1 }) // Sắp xếp từ cũ đến mới
        .lean();

      console.log(
        `✅ Found ${messages.length} task messages for task: ${taskId}`
      );

      // Format messages cho client
      const formattedMessages = messages.map((msg) => ({
        _id: msg._id,
        id: msg._id.toString(),
        taskId: msg.taskId,
        message: msg.message,
        messageType: msg.messageType,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        isEdited: msg.isEdited,
        editedAt: msg.editedAt,
        replyTo: msg.replyTo,
        sender: {
          keycloakId: msg.senderId,
          username: msg.sender?.username || "Unknown",
          avatar: msg.sender?.avatar || null,
        },
        replyToMessage: msg.replyToMessage
          ? {
              _id: msg.replyToMessage._id,
              message: msg.replyToMessage.message,
              sender: {
                keycloakId: msg.replyToMessage.senderId,
                username: msg.replyToMessage.sender?.username || "Unknown",
              },
              createdAt: msg.replyToMessage.createdAt,
            }
          : null,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      }));

      callback(formattedMessages);
    } catch (err) {
      console.error("❌ Error get_task_messages:", err);
      callback([]);
    }
  });

  // ==================== DEBUG: LOG ALL TASK EVENTS ====================
  // Listen cho các events và log
  const logEvent = (eventName, data) => {
    console.log(`🔌 Task Socket Event: ${eventName}`, data);
  };

  // Log các events quan trọng
  socket.on("join_task_room", (data) => logEvent("join_task_room", data));
  socket.on("leave_task_room", (data) => logEvent("leave_task_room", data));
  socket.on("new_task_message", (data) => logEvent("new_task_message", data));
  socket.on("edit_task_message", (data) => logEvent("edit_task_message", data));
  socket.on("delete_task_message", (data) =>
    logEvent("delete_task_message", data)
  );
  socket.on("task_typing_start", (data) => logEvent("task_typing_start", data));
  socket.on("task_typing_stop", (data) => logEvent("task_typing_stop", data));
  socket.on("get_task_messages", (data) => logEvent("get_task_messages", data));

  console.log(
    `✅ Task handlers registered successfully for user: ${currentUserId}`
  );
};
