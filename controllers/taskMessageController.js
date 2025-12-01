// controllers/taskMessageController.js
const TaskMessage = require("../models/TaskMessage");
const Task = require("../models/Task");
const User = require("../models/user");
const catchAsync = require("../utils/catchAsync");

let io;

exports.setSocketIo = (socketIoInstance) => {
  io = socketIoInstance;
};

// 🎯 Gửi tin nhắn trong task
exports.sendMessage = catchAsync(async (req, res) => {
  try {
    const {
      taskId,
      keycloakId,
      message,
      messageType = "text",
      fileUrl = null,
      fileName = null,
      replyTo = null,
    } = req.body;

    // Validation
    if (!taskId || !keycloakId || !message?.trim()) {
      return res.status(400).json({
        status: "error",
        message: "taskId, keycloakId và message là bắt buộc",
      });
    }

    // Kiểm tra task tồn tại
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy task",
      });
    }

    // Kiểm tra user có trong task không
    const isTaskRelated =
      task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

    if (!isTaskRelated) {
      return res.status(403).json({
        status: "error",
        message: "Không có quyền gửi tin nhắn trong task này",
      });
    }

    // Kiểm tra replyTo message có tồn tại và thuộc cùng task không
    if (replyTo) {
      const replyMessage = await TaskMessage.findById(replyTo);
      if (!replyMessage || replyMessage.taskId.toString() !== taskId) {
        return res.status(400).json({
          status: "error",
          message: "Tin nhắn trả lời không hợp lệ",
        });
      }
    }

    // Tạo tin nhắn
    const taskMessage = await TaskMessage.create({
      taskId,
      senderId: keycloakId,
      message: message.trim(),
      messageType,
      fileUrl,
      fileName,
      replyTo,
    });

    // Populate thông tin đầy đủ
    const populatedMessage = await TaskMessage.findById(taskMessage._id)
      .populate("sender", "username fullName email avatar keycloakId")
      .populate({
        path: "replyToMessage",
        select: "message senderId createdAt",
        populate: {
          path: "sender",
          select: "username fullName avatar keycloakId",
        },
      });

    // Format response để khớp với frontend
    const responseMessage = {
      _id: populatedMessage._id,
      taskId: populatedMessage.taskId,
      message: populatedMessage.message,
      messageType: populatedMessage.messageType,
      fileUrl: populatedMessage.fileUrl,
      fileName: populatedMessage.fileName,
      isEdited: populatedMessage.isEdited,
      editedAt: populatedMessage.editedAt,
      replyTo: populatedMessage.replyToMessage
        ? {
            _id: populatedMessage.replyToMessage._id,
            message: populatedMessage.replyToMessage.message,
            senderId: populatedMessage.replyToMessage.sender
              ? {
                  keycloakId: populatedMessage.replyToMessage.sender.keycloakId,
                  username: populatedMessage.replyToMessage.sender.username,
                  fullName: populatedMessage.replyToMessage.sender.fullName,
                  avatar: populatedMessage.replyToMessage.sender.avatar,
                }
              : null,
            createdAt: populatedMessage.replyToMessage.createdAt,
          }
        : null,
      senderId: populatedMessage.sender
        ? {
            keycloakId: populatedMessage.sender.keycloakId,
            username: populatedMessage.sender.username,
            fullName: populatedMessage.sender.fullName,
            email: populatedMessage.sender.email,
            avatar: populatedMessage.sender.avatar,
          }
        : { keycloakId: populatedMessage.senderId },
      createdAt: populatedMessage.createdAt,
      updatedAt: populatedMessage.updatedAt,
    };

    // Real-time notification
    if (io) {
      const roomName = `task_${taskId}`;
      io.to(roomName).emit("new_task_message", {
        taskId: taskId,
        message: responseMessage, // Gửi message đã được format
      });

      // Thông báo cho những người không online
      const allMembers = [task.assignerId, ...task.assigneeIds];
      allMembers.forEach((memberId) => {
        if (memberId !== keycloakId) {
          io.to(`user_${memberId}`).emit("task_message_notification", {
            taskId: taskId,
            taskTitle: task.title,
            senderName:
              populatedMessage.sender?.fullName ||
              populatedMessage.sender?.username ||
              "Unknown",
            message:
              message.length > 50 ? `${message.substring(0, 50)}...` : message,
          });
        }
      });
    }

    res.status(201).json({
      status: "success",
      message: "Đã gửi tin nhắn",
      data: responseMessage, // Trả về message đã format
    });
  } catch (error) {
    console.error("❌ Error sending task message:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi gửi tin nhắn: " + error.message,
    });
  }
});

// 🎯 Lấy tin nhắn của task
exports.getTaskMessages = catchAsync(async (req, res) => {
  try {
    const { taskId, keycloakId, page = 1, limit = 50 } = req.body;

    if (!taskId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "taskId và keycloakId là bắt buộc",
      });
    }

    // Kiểm tra task tồn tại
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy task",
      });
    }

    // Kiểm tra quyền truy cập
    const isTaskRelated =
      task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

    if (!isTaskRelated) {
      return res.status(403).json({
        status: "error",
        message: "Không có quyền xem tin nhắn của task này",
      });
    }

    const skip = (page - 1) * limit;

    // Lấy messages với populate
    const messages = await TaskMessage.find({ taskId })
      .populate("sender", "username fullName email avatar keycloakId")
      .populate({
        path: "replyToMessage",
        select: "message senderId createdAt",
        populate: {
          path: "sender",
          select: "username fullName avatar keycloakId",
        },
      })
      .sort({ createdAt: 1 }) // Lấy từ cũ đến mới (frontend sẽ reverse nếu cần)
      .skip(skip)
      .limit(limit)
      .lean();

    // Format messages để khớp với frontend
    const formattedMessages = messages.map((msg) => ({
      _id: msg._id,
      taskId: msg.taskId,
      message: msg.message,
      messageType: msg.messageType,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      isEdited: msg.isEdited,
      editedAt: msg.editedAt,
      replyTo: msg.replyToMessage
        ? {
            _id: msg.replyToMessage._id,
            message: msg.replyToMessage.message,
            senderId: msg.replyToMessage.sender
              ? {
                  keycloakId: msg.replyToMessage.sender.keycloakId,
                  username: msg.replyToMessage.sender.username,
                  fullName: msg.replyToMessage.sender.fullName,
                  avatar: msg.replyToMessage.sender.avatar,
                }
              : null,
            createdAt: msg.replyToMessage.createdAt,
          }
        : null,
      senderId: msg.sender
        ? {
            keycloakId: msg.sender.keycloakId,
            username: msg.sender.username,
            fullName: msg.sender.fullName,
            email: msg.sender.email,
            avatar: msg.sender.avatar,
          }
        : { keycloakId: msg.senderId },
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }));

    const totalMessages = await TaskMessage.countDocuments({ taskId });

    res.status(200).json({
      status: "success",
      message: "Lấy tin nhắn thành công",
      data: {
        messages: formattedMessages,
      },
      pagination: {
        currentPage: parseInt(page),
        hasNextPage: page * limit < totalMessages,
        totalPages: Math.ceil(totalMessages / limit),
        totalMessages: totalMessages,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("❌ Error getting task messages:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi lấy tin nhắn: " + error.message,
    });
  }
});

// 🎯 Chỉnh sửa tin nhắn
exports.editMessage = catchAsync(async (req, res) => {
  try {
    const { messageId, keycloakId, newMessage } = req.body;

    if (!messageId || !keycloakId || !newMessage?.trim()) {
      return res.status(400).json({
        status: "error",
        message: "messageId, keycloakId và newMessage là bắt buộc",
      });
    }

    const message = await TaskMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy tin nhắn",
      });
    }

    // Chỉ cho phép sender chỉnh sửa
    if (message.senderId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Chỉ người gửi mới được chỉnh sửa tin nhắn",
      });
    }

    // Không cho phép chỉnh sửa tin nhắn quá 24 giờ
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (messageAge > twentyFourHours) {
      return res.status(400).json({
        status: "error",
        message: "Không thể chỉnh sửa tin nhắn sau 24 giờ",
      });
    }

    message.message = newMessage.trim();
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    // Populate lại thông tin
    const updatedMessage = await TaskMessage.findById(messageId)
      .populate("sender", "username fullName email avatar keycloakId")
      .populate({
        path: "replyToMessage",
        select: "message senderId createdAt",
        populate: {
          path: "sender",
          select: "username fullName avatar keycloakId",
        },
      });

    // Format response
    const responseMessage = {
      _id: updatedMessage._id,
      taskId: updatedMessage.taskId,
      message: updatedMessage.message,
      messageType: updatedMessage.messageType,
      fileUrl: updatedMessage.fileUrl,
      fileName: updatedMessage.fileName,
      isEdited: updatedMessage.isEdited,
      editedAt: updatedMessage.editedAt,
      replyTo: updatedMessage.replyToMessage
        ? {
            _id: updatedMessage.replyToMessage._id,
            message: updatedMessage.replyToMessage.message,
            senderId: updatedMessage.replyToMessage.sender
              ? {
                  keycloakId: updatedMessage.replyToMessage.sender.keycloakId,
                  username: updatedMessage.replyToMessage.sender.username,
                  fullName: updatedMessage.replyToMessage.sender.fullName,
                  avatar: updatedMessage.replyToMessage.sender.avatar,
                }
              : null,
            createdAt: updatedMessage.replyToMessage.createdAt,
          }
        : null,
      senderId: updatedMessage.sender
        ? {
            keycloakId: updatedMessage.sender.keycloakId,
            username: updatedMessage.sender.username,
            fullName: updatedMessage.sender.fullName,
            email: updatedMessage.sender.email,
            avatar: updatedMessage.sender.avatar,
          }
        : { keycloakId: updatedMessage.senderId },
      createdAt: updatedMessage.createdAt,
      updatedAt: updatedMessage.updatedAt,
    };

    // Real-time update
    if (io) {
      io.to(`task_${message.taskId}`).emit("task_message_updated", {
        messageId: messageId,
        updatedMessage: responseMessage,
        taskId: message.taskId,
      });
    }

    res.status(200).json({
      status: "success",
      message: "Đã cập nhật tin nhắn",
      data: responseMessage,
    });
  } catch (error) {
    console.error("❌ Error editing task message:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi chỉnh sửa tin nhắn: " + error.message,
    });
  }
});

// 🎯 Xóa tin nhắn
exports.deleteMessage = catchAsync(async (req, res) => {
  try {
    const { messageId, keycloakId } = req.body;

    if (!messageId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "messageId và keycloakId là bắt buộc",
      });
    }

    const message = await TaskMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy tin nhắn",
      });
    }

    // Chỉ cho phép sender hoặc admin xóa
    const user = await User.findOne({ keycloakId });
    const isSender = message.senderId === keycloakId;
    const isAdmin = user?.roles?.includes("admin");

    if (!isSender && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Không có quyền xóa tin nhắn này",
      });
    }

    const taskId = message.taskId;
    await TaskMessage.findByIdAndDelete(messageId);

    // Real-time update
    if (io) {
      io.to(`task_${taskId}`).emit("task_message_deleted", {
        messageId: messageId,
        taskId: taskId,
      });
    }

    res.status(200).json({
      status: "success",
      message: "Đã xóa tin nhắn",
    });
  } catch (error) {
    console.error("❌ Error deleting task message:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi xóa tin nhắn: " + error.message,
    });
  }
});
