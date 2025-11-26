// controllers/taskController.js
const Task = require("../models/Task");
const Reminder = require("../models/Reminder");
const User = require("../models/user");
const catchAsync = require("../utils/catchAsync");
const mongoose = require("mongoose");

let io;

exports.setSocketIo = (socketIoInstance) => {
  io = socketIoInstance;
};

/*
|--------------------------------------------------------------------------
| TASK MANAGEMENT - 🆕 ĐÃ SỬA CHO KEYCLOAKID
|--------------------------------------------------------------------------
*/

// 🆕 Helper function để lấy user info từ keycloakId
const getUserInfo = async (keycloakId) => {
  const user = await User.findOne({ keycloakId }).select(
    "keycloakId username firstName lastName avatar status"
  );
  return (
    user || {
      keycloakId,
      username: "Unknown",
      firstName: "Unknown",
      lastName: "User",
      avatar: null,
      status: "Offline",
    }
  );
};

// 🆕 Helper function để populate multiple tasks
const populateTasksWithUserInfo = async (tasks) => {
  return Promise.all(tasks.map((task) => populateTaskWithUserInfo(task)));
};

// 🆕 THÊM: Tạo task mới
// POST /tasks/create
// 🆕 THÊM: Tạo task mới
// POST /tasks/create
exports.createTask = catchAsync(async (req, res) => {
  const {
    title,
    description,
    assigneeId,
    priority = "medium",
    dueDate,
    tags = [],
    estimatedHours = 0,
    reminders,
    assignerId,
  } = req.body;

  console.log("🔍 Debug task creation:", {
    assigneeId: assigneeId,
    priority: priority,
    title: title,
  });

  // VALIDATION
  if (!title?.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Tiêu đề task là bắt buộc",
    });
  }

  if (!assigneeId) {
    return res.status(400).json({
      status: "error",
      message: "Người nhận task là bắt buộc",
    });
  }

  if (!assignerId) {
    return res.status(401).json({
      status: "error",
      message: "Người dùng chưa đăng nhập",
    });
  }

  console.log("📦 Creating new task:", {
    title: title.trim(),
    assigneeId,
    assignerId: assignerId,
    priority,
  });

  // KIỂM TRA USERS TỒN TẠI
  const [assigner, assignee] = await Promise.all([
    User.findOne({ keycloakId: assignerId }),
    User.findOne({ keycloakId: assigneeId }),
  ]);

  if (!assigner) {
    return res.status(404).json({
      status: "error",
      message: "Người giao task không tồn tại",
    });
  }

  if (!assignee) {
    return res.status(404).json({
      status: "error",
      message: "Người nhận task không tồn tại",
    });
  }

  // XỬ LÝ dueDate
  const parsedDueDate = dueDate ? new Date(dueDate) : undefined;
  if (parsedDueDate && isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({
      status: "error",
      message: "Ngày hết hạn không hợp lệ",
    });
  }

  // TẠO TASK MỚI
  const newTask = await Task.create({
    title: title.trim(),
    description: description?.trim() || "",
    assignerId: assignerId,
    assigneeId: assigneeId,
    priority: priority,
    dueDate: parsedDueDate,
    tags: tags,
    estimatedHours: estimatedHours,
    activityLog: [
      {
        action: "created",
        userId: assignerId,
        timestamp: new Date(),
        details: {
          from: null,
          to: "todo",
        },
      },
    ],
  });

  // THÊM REMINDERS NẾU CÓ
  if (reminders && reminders.length > 0) {
    await Reminder.create(
      reminders.map((reminder) => ({
        taskId: newTask._id,
        userId: assignerId,
        type: reminder.type || "due_date",
        triggerAt: reminder.triggerAt,
        isSent: false,
      }))
    );
  }

  console.log("✅ Task created successfully:", newTask._id);

  res.status(201).json({
    status: "success",
    data: {
      task: newTask,
    },
  });
});

// 🆕 THÊM: Lấy danh sách tasks của user
// POST /tasks/get-user-tasks
exports.getUserTasks = catchAsync(async (req, res) => {
  try {
    const { keycloakId, status, page = 1, limit = 20 } = req.body;

    console.log("🔍 Fetching tasks for user:", {
      keycloakId,
      status,
      page,
      limit,
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId is required in request body",
      });
    }

    // BUILD QUERY
    const query = { assigneeId: keycloakId };
    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    // 🆕 SỬA: Lấy tasks không populate, sau đó populate thủ công
    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 🆕 SỬA: Populate user info cho tất cả tasks
    const populatedTasks = await populateTasksWithUserInfo(tasks);

    // LẤY TỔNG SỐ TASKS CHO PAGINATION
    const totalTasks = await Task.countDocuments(query);

    console.log(`✅ Found ${tasks.length} tasks for user: ${keycloakId}`);

    res.status(200).json({
      status: "success",
      results: tasks.length,
      data: populatedTasks,
      pagination: {
        page,
        limit,
        total: totalTasks,
        pages: Math.ceil(totalTasks / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching user tasks:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch tasks",
    });
  }
});

// 🆕 THÊM: Cập nhật task
// PATCH /tasks/update
exports.updateTask = catchAsync(async (req, res) => {
  try {
    const { taskId, keycloakId, updates } = req.body;

    console.log("📝 Updating task:", { taskId, keycloakId, updates });

    if (!taskId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "taskId and keycloakId are required",
      });
    }

    // KIỂM TRA TASK TỒN TẠI VÀ QUYỀN TRUY CẬP
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== keycloakId && task.assignerId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to update this task",
      });
    }

    // VALIDATION CHO STATUS UPDATE
    if (
      updates.status &&
      !["todo", "in_progress", "review", "done"].includes(updates.status)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid status value",
      });
    }

    // THÊM ACTIVITY LOG NẾU CÓ THAY ĐỔI STATUS
    if (updates.status && updates.status !== task.status) {
      updates.activityLog = [
        ...task.activityLog,
        {
          action: "status_updated",
          userId: keycloakId,
          timestamp: new Date(),
          details: {
            from: task.status,
            to: updates.status,
          },
        },
      ];
    }

    // CẬP NHẬT TASK
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        ...updates,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    console.log("✅ Task updated successfully:", taskId);

    // 🆕 SỬA: Populate user info sau khi update
    const populatedTask = await populateTaskWithUserInfo(updatedTask);

    // REAL-TIME NOTIFICATION CHO ASSIGNER NẾU ASSIGNEE UPDATE
    if (
      io &&
      keycloakId === task.assigneeId &&
      task.assignerId !== keycloakId
    ) {
      const assigner = await User.findOne({ keycloakId: task.assignerId });
      const assignee = await User.findOne({ keycloakId: task.assigneeId });

      io.to(`user_${task.assignerId}`).emit("task_updated", {
        taskId: taskId,
        title: task.title,
        assigneeName: assignee.firstName + " " + assignee.lastName,
        updates: updates,
        message: `${assignee.firstName} đã cập nhật task: ${task.title}`,
      });

      console.log("📢 Sent update notification to assigner:", task.assignerId);
    }

    res.status(200).json({
      status: "success",
      message: "Cập nhật task thành công",
      data: populatedTask,
    });
  } catch (error) {
    console.error("❌ Error updating task:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update task",
    });
  }
});

// 🆕 THÊM: Lấy chi tiết task
// POST /tasks/get-detail
exports.getTaskDetail = catchAsync(async (req, res) => {
  try {
    const { taskId, keycloakId } = req.body;

    console.log("🔍 Fetching task detail:", { taskId, keycloakId });

    if (!taskId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "taskId and keycloakId are required",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP
    const task = await Task.findById(taskId);

    console.log("11111", task);

    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== keycloakId && task.assignerId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to view this task",
      });
    }

    // 🆕 SỬA: Populate user info với schema User
    const populatedTask = await populateTaskWithUserInfo(task);

    console.log("✅ Task detail fetched successfully:", taskId);

    res.status(200).json({
      status: "success",
      data: populatedTask,
    });
  } catch (error) {
    console.error("❌ Error fetching task detail:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch task detail",
    });
  }
});

// 🆕 HÀM POPULATE USER INFO - CHỈ LẤY USERNAME
async function populateTaskWithUserInfo(task) {
  try {
    // Tìm thông tin assigner và assignee từ collection User
    const [assigner, assignee] = await Promise.all([
      User.findOne({ keycloakId: task.assignerId }),
      User.findOne({ keycloakId: task.assigneeId }),
    ]);

    // Tạo object task mới với thông tin user đã được populate
    const populatedTask = {
      ...task.toObject(), // Chuyển mongoose document thành plain object
      assignerId: {
        keycloakId: task.assignerId,
        username: assigner?.username || "Unknown User",
      },
      assigneeId: {
        keycloakId: task.assigneeId,
        username: assignee?.username || "Unknown User",
      },
    };

    // 🆕 Populate thông tin user trong activityLog
    if (populatedTask.activityLog && populatedTask.activityLog.length > 0) {
      const userIds = [
        ...new Set(populatedTask.activityLog.map((log) => log.userId)),
      ];
      const users = await User.find({ keycloakId: { $in: userIds } });

      const userMap = {};
      users.forEach((user) => {
        userMap[user.keycloakId] = user.username || "Unknown User";
      });

      populatedTask.activityLog = populatedTask.activityLog.map((log) => ({
        ...log,
        username: userMap[log.userId] || "Unknown User",
      }));
    }

    return populatedTask;
  } catch (error) {
    console.error("Error populating task with user info:", error);
    // Trả về task gốc nếu có lỗi
    return task.toObject();
  }
}

// 🆕 THÊM: Xóa task
// POST /tasks/delete
exports.deleteTask = catchAsync(async (req, res) => {
  try {
    const { taskId, keycloakId } = req.body;

    console.log("🗑️ Deleting task:", { taskId, keycloakId });

    if (!taskId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "taskId and keycloakId are required",
      });
    }

    // KIỂM TRA TASK VÀ QUYỀN (CHỈ ASSIGNER ĐƯỢC XÓA)
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assignerId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Only task assigner can delete this task",
      });
    }

    // XÓA TASK VÀ CÁC REMINDERS LIÊN QUAN
    await Promise.all([
      Task.findByIdAndDelete(taskId),
      Reminder.deleteMany({ taskId: taskId }),
    ]);

    console.log("✅ Task deleted successfully:", taskId);

    // REAL-TIME NOTIFICATION CHO ASSIGNEE
    if (io) {
      io.to(`user_${task.assigneeId}`).emit("task_deleted", {
        taskId: taskId,
        title: task.title,
        message: `Task "${task.title}" đã bị xóa`,
      });
    }

    res.status(200).json({
      status: "success",
      message: "Xóa task thành công",
    });
  } catch (error) {
    console.error("❌ Error deleting task:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete task",
    });
  }
});

/*
|--------------------------------------------------------------------------
| REMINDER MANAGEMENT - 🆕 ĐÃ SỬA CHO KEYCLOAKID
|--------------------------------------------------------------------------
*/

// 🆕 THÊM: Tạo reminder mới
// POST /tasks/reminder/create
exports.createReminder = catchAsync(async (req, res) => {
  try {
    const {
      taskId,
      keycloakId,
      remindAt,
      message,
      reminderType = "custom",
    } = req.body;

    console.log("⏰ Creating reminder:", { taskId, keycloakId, remindAt });

    if (!taskId || !keycloakId || !remindAt) {
      return res.status(400).json({
        status: "error",
        message: "taskId, keycloakId and remindAt are required",
      });
    }

    // KIỂM TRA TASK VÀ QUYỀN
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== keycloakId && task.assignerId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to create reminder for this task",
      });
    }

    // VALIDATION REMIND AT
    const remindAtDate = new Date(remindAt);
    if (isNaN(remindAtDate.getTime()) || remindAtDate <= new Date()) {
      return res.status(400).json({
        status: "error",
        message: "remindAt must be a valid future date",
      });
    }

    // TẠO REMINDER
    const reminder = await Reminder.create({
      taskId: taskId,
      userId: keycloakId,
      remindAt: remindAtDate,
      message: message || `Nhắc nhở task: "${task.title}"`,
      reminderType: reminderType,
    });

    console.log("✅ Reminder created successfully:", reminder._id);

    res.status(201).json({
      status: "success",
      message: "Tạo reminder thành công",
      data: reminder,
    });
  } catch (error) {
    console.error("❌ Error creating reminder:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create reminder",
    });
  }
});

// 🆕 THÊM: Lấy reminders của user
// POST /tasks/reminders/get-user-reminders
exports.getUserReminders = catchAsync(async (req, res) => {
  try {
    const { keycloakId, page = 1, limit = 20 } = req.body;

    console.log("🔍 Fetching reminders for user:", { keycloakId, page, limit });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId is required in request body",
      });
    }

    const skip = (page - 1) * limit;

    // LẤY REMINDERS SẮP TỚI
    const reminders = await Reminder.find({
      userId: keycloakId,
      remindAt: { $gte: new Date() },
      isSent: false,
    })
      .populate("taskId")
      .sort({ remindAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 🆕 SỬA: Populate user info cho tasks trong reminders
    const populatedReminders = await Promise.all(
      reminders.map(async (reminder) => {
        if (reminder.taskId) {
          const taskWithUserInfo = await populateTaskWithUserInfo(
            reminder.taskId
          );
          return {
            ...reminder,
            taskId: taskWithUserInfo,
          };
        }
        return reminder;
      })
    );

    const totalReminders = await Reminder.countDocuments({
      userId: keycloakId,
      remindAt: { $gte: new Date() },
      isSent: false,
    });

    console.log(
      `✅ Found ${reminders.length} upcoming reminders for user: ${keycloakId}`
    );

    res.status(200).json({
      status: "success",
      results: reminders.length,
      data: populatedReminders,
      pagination: {
        page,
        limit,
        total: totalReminders,
        pages: Math.ceil(totalReminders / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching user reminders:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch reminders",
    });
  }
});

/*
|--------------------------------------------------------------------------
| SOCKET HANDLERS - 🆕 ĐÃ SỬA CHO KEYCLOAKID
|--------------------------------------------------------------------------
*/

// 🆕 THÊM: Socket handler cho task assignment
exports.handleTaskAssignment = catchAsync(async (socket, data) => {
  const { taskId, assigneeId } = data;
  const assignerId = socket.userId;

  console.log("📨 Socket task assignment:", { taskId, assigneeId, assignerId });

  if (!taskId || !assigneeId) {
    return socket.emit("task_assignment_response", {
      status: "error",
      message: "taskId and assigneeId are required",
    });
  }

  try {
    // KIỂM TRA TASK TỒN TẠI VÀ QUYỀN
    const task = await Task.findById(taskId);
    if (!task) {
      return socket.emit("task_assignment_response", {
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assignerId !== assignerId) {
      return socket.emit("task_assignment_response", {
        status: "error",
        message: "Only task assigner can reassign this task",
      });
    }

    // KIỂM TRA ASSIGNEE MỚI TỒN TẠI
    const newAssignee = await User.findOne({ keycloakId: assigneeId });
    if (!newAssignee) {
      return socket.emit("task_assignment_response", {
        status: "error",
        message: "New assignee not found",
      });
    }

    // LƯU ASSIGNEE CŨ ĐỂ GỬI NOTIFICATION
    const oldAssigneeId = task.assigneeId;

    // CẬP NHẬT ASSIGNEE MỚI
    task.assigneeId = assigneeId;
    task.activityLog.push({
      action: "reassigned",
      userId: assignerId,
      timestamp: new Date(),
      details: {
        from: oldAssigneeId,
        to: assigneeId,
      },
    });

    await task.save();

    // 🆕 SỬA: Populate user info
    const updatedTask = await populateTaskWithUserInfo(task);

    // REAL-TIME NOTIFICATIONS
    const assigner = await User.findOne({ keycloakId: assignerId });
    const oldAssignee = await User.findOne({ keycloakId: oldAssigneeId });

    // GỬI CHO ASSIGNEE MỚI
    socket.to(`user_${assigneeId}`).emit("task_assigned", {
      taskId: task._id,
      title: task.title,
      assignerName: assigner.firstName + " " + assigner.lastName,
      priority: task.priority,
      dueDate: task.dueDate,
      message: `Bạn được giao task mới: ${task.title}`,
    });

    // GỬI CHO ASSIGNEE CŨ
    if (oldAssigneeId !== assigneeId) {
      socket.to(`user_${oldAssigneeId}`).emit("task_unassigned", {
        taskId: task._id,
        title: task.title,
        assignerName: assigner.firstName + " " + assigner.lastName,
        message: `Task "${task.title}" đã được giao cho người khác`,
      });
    }

    // BROADCAST UPDATE CHO TẤT CẢ CLIENTS ĐANG XEM TASK NÀY
    socket.to(`task_${taskId}`).emit("task_updated", {
      taskId: taskId,
      updates: {
        assigneeId: assigneeId,
        assigneeInfo: {
          keycloakId: newAssignee.keycloakId,
          username: newAssignee.username,
          firstName: newAssignee.firstName,
          lastName: newAssignee.lastName,
          avatar: newAssignee.avatar,
        },
      },
      action: "reassigned",
    });

    console.log("✅ Task reassigned successfully via socket:", {
      taskId,
      from: oldAssigneeId,
      to: assigneeId,
    });

    // RESPONSE CHO NGƯỜI THỰC HIỆN
    socket.emit("task_assignment_response", {
      status: "success",
      message: "Task assigned successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("❌ Error in socket task assignment:", error);
    socket.emit("task_assignment_response", {
      status: "error",
      message: "Failed to assign task",
    });
  }
});

// 🆕 THÊM: Socket handler cho task status update
exports.handleTaskStatusUpdate = catchAsync(async (socket, data) => {
  const { taskId, status, comment } = data;
  const userId = socket.userId;

  console.log("📨 Socket task status update:", { taskId, status, userId });

  if (!taskId || !status) {
    return socket.emit("task_status_update_response", {
      status: "error",
      message: "taskId and status are required",
    });
  }

  try {
    // KIỂM TRA TASK TỒN TẠI
    const task = await Task.findById(taskId);
    if (!task) {
      return socket.emit("task_status_update_response", {
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== userId && task.assignerId !== userId) {
      return socket.emit("task_status_update_response", {
        status: "error",
        message: "Access denied to update this task",
      });
    }

    // VALIDATION STATUS
    const validStatuses = ["todo", "in_progress", "review", "done"];
    if (!validStatuses.includes(status)) {
      return socket.emit("task_status_update_response", {
        status: "error",
        message: "Invalid status value",
      });
    }

    // KHÔNG CHO PHÉP UPDATE NẾU STATUS GIỐNG NHAU
    if (task.status === status) {
      return socket.emit("task_status_update_response", {
        status: "error",
        message: "Task already has this status",
      });
    }

    // LƯU STATUS CŨ
    const oldStatus = task.status;

    // CẬP NHẬT STATUS
    task.status = status;
    task.activityLog.push({
      action: "status_updated",
      userId: userId,
      timestamp: new Date(),
      details: {
        from: oldStatus,
        to: status,
        comment: comment || null,
      },
    });

    await task.save();

    // 🆕 SỬA: Populate user info
    const updatedTask = await populateTaskWithUserInfo(task);

    // REAL-TIME NOTIFICATIONS
    const user = await User.findOne({ keycloakId: userId });
    const assigner = await User.findOne({ keycloakId: task.assignerId });
    const assignee = await User.findOne({ keycloakId: task.assigneeId });

    // STATUS UPDATE MESSAGES
    const statusMessages = {
      todo: "đã chuyển về trạng thái cần làm",
      in_progress: "đã bắt đầu thực hiện",
      review: "đã chuyển sang trạng thái chờ duyệt",
      done: "đã hoàn thành",
    };

    const statusMessage = statusMessages[status] || "đã cập nhật trạng thái";

    // GỬI NOTIFICATION CHO ASSIGNER NẾU ASSIGNEE UPDATE
    if (userId === task.assigneeId && task.assignerId !== userId) {
      socket.to(`user_${task.assignerId}`).emit("task_status_updated", {
        taskId: taskId,
        title: task.title,
        assigneeName: assignee.firstName + " " + assignee.lastName,
        oldStatus: oldStatus,
        newStatus: status,
        message: `${assignee.firstName} ${statusMessage} task: ${task.title}`,
      });
    }

    // GỬI NOTIFICATION CHO ASSIGNEE NẾU ASSIGNER UPDATE
    if (userId === task.assignerId && task.assigneeId !== userId) {
      socket.to(`user_${task.assigneeId}`).emit("task_status_updated", {
        taskId: taskId,
        title: task.title,
        assignerName: assigner.firstName + " " + assigner.lastName,
        oldStatus: oldStatus,
        newStatus: status,
        message: `${assigner.firstName} ${statusMessage} task: ${task.title}`,
      });
    }

    // BROADCAST UPDATE CHO TẤT CẢ CLIENTS ĐANG XEM TASK NÀY
    socket.to(`task_${taskId}`).emit("task_updated", {
      taskId: taskId,
      updates: {
        status: status,
        updatedAt: task.updatedAt,
      },
      action: "status_updated",
      performedBy: {
        keycloakId: user.keycloakId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });

    // SPECIAL NOTIFICATION KHI TASK HOÀN THÀNH
    if (status === "done") {
      socket.to(`user_${task.assignerId}`).emit("task_completed", {
        taskId: taskId,
        title: task.title,
        assigneeName: assignee.firstName + " " + assignee.lastName,
        completedAt: new Date(),
        message: `🎉 Task "${task.title}" đã được hoàn thành!`,
      });

      // CELEBRATION MESSAGE CHO ASSIGNEE
      socket.to(`user_${task.assigneeId}`).emit("task_completion_congrats", {
        taskId: taskId,
        title: task.title,
        message: `🎉 Chúc mừng! Bạn đã hoàn thành task "${task.title}"!`,
      });
    }

    console.log("✅ Task status updated via socket:", {
      taskId,
      from: oldStatus,
      to: status,
      by: userId,
    });

    // RESPONSE CHO NGƯỜI THỰC HIỆN
    socket.emit("task_status_update_response", {
      status: "success",
      message: "Task status updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("❌ Error in socket task status update:", error);
    socket.emit("task_status_update_response", {
      status: "error",
      message: "Failed to update task status",
    });
  }
});

// 🆕 THÊM: Socket handler cho join task room (để nhận real-time updates)
exports.handleJoinTaskRoom = catchAsync(async (socket, data) => {
  const { taskId } = data;
  const userId = socket.userId;

  console.log("🔗 Joining task room:", { taskId, userId });

  if (!taskId) {
    return socket.emit("join_task_room_response", {
      status: "error",
      message: "taskId is required",
    });
  }

  try {
    // KIỂM TRA QUYỀN TRUY CẬP TASK
    const task = await Task.findById(taskId);
    if (!task) {
      return socket.emit("join_task_room_response", {
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== userId && task.assignerId !== userId) {
      return socket.emit("join_task_room_response", {
        status: "error",
        message: "Access denied to this task",
      });
    }

    // JOIN TASK ROOM
    socket.join(`task_${taskId}`);

    console.log("✅ User joined task room:", { userId, taskId });

    socket.emit("join_task_room_response", {
      status: "success",
      message: "Joined task room successfully",
      taskId: taskId,
    });
  } catch (error) {
    console.error("❌ Error joining task room:", error);
    socket.emit("join_task_room_response", {
      status: "error",
      message: "Failed to join task room",
    });
  }
});

// 🆕 THÊM: Socket handler cho leave task room
exports.handleLeaveTaskRoom = catchAsync(async (socket, data) => {
  const { taskId } = data;
  const userId = socket.userId;

  console.log("🔗 Leaving task room:", { taskId, userId });

  if (!taskId) {
    return socket.emit("leave_task_room_response", {
      status: "error",
      message: "taskId is required",
    });
  }

  try {
    // LEAVE TASK ROOM
    socket.leave(`task_${taskId}`);

    console.log("✅ User left task room:", { userId, taskId });

    socket.emit("leave_task_room_response", {
      status: "success",
      message: "Left task room successfully",
      taskId: taskId,
    });
  } catch (error) {
    console.error("❌ Error leaving task room:", error);
    socket.emit("leave_task_room_response", {
      status: "error",
      message: "Failed to leave task room",
    });
  }
});

// 🆕 THÊM: Socket handler cho task comment
exports.handleTaskComment = catchAsync(async (socket, data) => {
  const { taskId, comment } = data;
  const userId = socket.userId;

  console.log("💬 Socket task comment:", { taskId, userId, comment });

  if (!taskId || !comment || !comment.trim()) {
    return socket.emit("task_comment_response", {
      status: "error",
      message: "taskId and comment are required",
    });
  }

  try {
    // KIỂM TRA TASK VÀ QUYỀN
    const task = await Task.findById(taskId);
    if (!task) {
      return socket.emit("task_comment_response", {
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 SỬA: So sánh trực tiếp keycloakId
    if (task.assigneeId !== userId && task.assignerId !== userId) {
      return socket.emit("task_comment_response", {
        status: "error",
        message: "Access denied to comment on this task",
      });
    }

    // THÊM COMMENT VÀO ACTIVITY LOG
    task.activityLog.push({
      action: "commented",
      userId: userId,
      timestamp: new Date(),
      details: {
        comment: comment.trim(),
      },
    });

    await task.save();

    // LẤY THÔNG TIN USER
    const user = await User.findOne({ keycloakId: userId });
    const assigner = await User.findOne({ keycloakId: task.assignerId });
    const assignee = await User.findOne({ keycloakId: task.assigneeId });

    // XÁC ĐỊNH NGƯỜI NHẬN NOTIFICATION
    const notificationTargetId =
      userId === task.assignerId ? task.assigneeId : task.assignerId;

    // GỬI NOTIFICATION CHO NGƯỜI KIA
    socket.to(`user_${notificationTargetId}`).emit("task_new_comment", {
      taskId: taskId,
      title: task.title,
      comment: comment.trim(),
      commentBy: {
        keycloakId: user.keycloakId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
      },
      message: `${user.firstName} đã bình luận trên task: ${task.title}`,
    });

    // BROADCAST COMMENT CHO TẤT CẢ CLIENTS ĐANG XEM TASK
    socket.to(`task_${taskId}`).emit("task_comment_added", {
      taskId: taskId,
      comment: {
        id: Date.now().toString(), // Temporary ID
        content: comment.trim(),
        userId: userId,
        userInfo: {
          keycloakId: user.keycloakId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
        },
        timestamp: new Date(),
      },
    });

    console.log("✅ Task comment added via socket:", {
      taskId,
      userId,
      commentLength: comment.length,
    });

    // RESPONSE CHO NGƯỜI COMMENT
    socket.emit("task_comment_response", {
      status: "success",
      message: "Comment added successfully",
      data: {
        taskId: taskId,
        comment: comment.trim(),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error in socket task comment:", error);
    socket.emit("task_comment_response", {
      status: "error",
      message: "Failed to add comment",
    });
  }
});
