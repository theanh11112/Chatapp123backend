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
| TASK MANAGEMENT - 🎯 ĐÃ CẬP NHẬT HỖ TRỢ MULTIPLE ASSIGNEES
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
// 🆕 Helper function để populate multiple tasks - ĐÃ SỬA THEO SCHEMA USER
// 🆕 Helper function để populate multiple tasks - ĐÃ SỬA
const populateTasksWithUserInfo = async (tasks) => {
  try {
    console.log(`🔄 Populating ${tasks.length} tasks with user info...`);

    const populatedTasks = [];

    for (const task of tasks) {
      const populatedTask = await populateTaskWithUserInfo(task);
      populatedTasks.push(populatedTask);
    }

    console.log(`✅ Successfully populated ${populatedTasks.length} tasks`);
    return populatedTasks;
  } catch (error) {
    console.error("❌ Error populating tasks with user info:", error);
    return tasks; // Return original tasks if error
  }
};
// 🎯 HÀM POPULATE USER INFO - ĐÃ SỬA THEO SCHEMA USER (KHÔNG CÓ firstName, lastName)
// 🎯 HÀM POPULATE USER INFO - CẦN SỬA LẠI
async function populateTaskWithUserInfo(task) {
  try {
    console.log("🔄 Populating task with user info:", task._id);

    // Tìm thông tin assigner
    const assigner = await User.findOne({ keycloakId: task.assignerId });
    console.log("🔍 Assigner found:", assigner?.fullName || assigner?.username);

    // 🆕 QUAN TRỌNG: Tìm thông tin TẤT CẢ assignees
    let assignees = [];
    if (task.assigneeIds && task.assigneeIds.length > 0) {
      assignees = await User.find({ keycloakId: { $in: task.assigneeIds } });
      console.log("🔍 Assignees found:", assignees.length, "users");
    }

    // Tạo object task mới với thông tin user đã được populate
    const populatedTask = {
      ...task.toObject(),
      assignerInfo: {
        keycloakId: task.assignerId,
        username: assigner?.username || "Unknown User",
        fullName: assigner?.fullName || "Unknown User",
        firstName: assigner?.fullName?.split(" ")[0] || "Unknown",
        lastName: assigner?.fullName?.split(" ").slice(1).join(" ") || "User",
        avatar: assigner?.avatar,
      },
      // 🆕 QUAN TRỌNG: Populate đầy đủ thông tin assignees
      assigneesInfo: assignees.map((assignee) => ({
        keycloakId: assignee.keycloakId,
        username: assignee.username || "Unknown User",
        fullName: assignee.fullName || "Unknown User",
        firstName: assignee.fullName?.split(" ")[0] || "Unknown",
        lastName: assignee.fullName?.split(" ").slice(1).join(" ") || "User",
        avatar: assignee.avatar,
      })),
      totalAssignees: task.assigneeIds?.length || 0,
    };

    console.log("✅ Task populated with:", {
      assigner: populatedTask.assignerInfo.fullName,
      assignees: populatedTask.assigneesInfo.length,
      totalAssignees: populatedTask.totalAssignees,
    });

    // Populate activity log
    if (populatedTask.activityLog && populatedTask.activityLog.length > 0) {
      const userIds = [
        ...new Set(populatedTask.activityLog.map((log) => log.userId)),
      ];
      const users = await User.find({ keycloakId: { $in: userIds } });

      const userMap = {};
      users.forEach((user) => {
        userMap[user.keycloakId] = {
          username: user.username || "Unknown User",
          fullName: user.fullName || "Unknown User",
          firstName: user.fullName?.split(" ")[0] || "Unknown",
          lastName: user.fullName?.split(" ").slice(1).join(" ") || "User",
          avatar: user.avatar,
        };
      });

      populatedTask.activityLog = populatedTask.activityLog.map((log) => ({
        ...log,
        userInfo: userMap[log.userId] || {
          username: "Unknown User",
          fullName: "Unknown User",
          firstName: "Unknown",
          lastName: "User",
        },
      }));
    }

    return populatedTask;
  } catch (error) {
    console.error("❌ Error populating task with user info:", error);

    // Fallback: trả về task với thông tin cơ bản
    return {
      ...task.toObject(),
      assignerInfo: {
        keycloakId: task.assignerId,
        username: "Unknown User",
        fullName: "Unknown User",
        firstName: "Unknown",
        lastName: "User",
        avatar: null,
      },
      assigneesInfo: (task.assigneeIds || []).map((assigneeId) => ({
        keycloakId: assigneeId,
        username: "Unknown User",
        fullName: "Unknown User",
        firstName: "Unknown",
        lastName: "User",
        avatar: null,
      })),
      totalAssignees: task.assigneeIds?.length || 0,
    };
  }
}
// 🎯 Tạo task mới - VERSION MỚI: hỗ trợ multiple assignees
// POST /tasks/create
exports.createTask = catchAsync(async (req, res) => {
  const {
    title,
    description,
    assigneeIds, // 🆕 THAY ĐỔI: thành mảng
    priority = "medium",
    dueDate,
    tags = [],
    estimatedHours = 0,
    reminders = [],
    assignerId,
  } = req.body;

  console.log("🎯 Creating TASK with multiple assignees:", {
    title: title?.trim(),
    assigneeIds, // 🆕 Mảng assigneeIds
    assignerId,
    priority,
  });

  // VALIDATION
  if (!title?.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Tiêu đề task là bắt buộc",
    });
  }

  // 🆕 VALIDATION MỚI: assigneeIds phải là mảng và có ít nhất 1 phần tử
  if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "assigneeIds phải là mảng và có ít nhất 1 người nhận",
    });
  }

  if (!assignerId) {
    return res.status(401).json({
      status: "error",
      message: "Người dùng chưa đăng nhập",
    });
  }

  // 🆕 KIỂM TRA TẤT CẢ USERS TỒN TẠI
  const assigner = await User.findOne({ keycloakId: assignerId });
  if (!assigner) {
    return res.status(404).json({
      status: "error",
      message: "Người giao task không tồn tại",
    });
  }

  // Kiểm tra tất cả assignees
  const assignees = await User.find({ keycloakId: { $in: assigneeIds } });
  if (assignees.length !== assigneeIds.length) {
    const foundIds = assignees.map((user) => user.keycloakId);
    const missingIds = assigneeIds.filter((id) => !foundIds.includes(id));

    return res.status(404).json({
      status: "error",
      message: `Không tìm thấy người nhận: ${missingIds.join(", ")}`,
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

  try {
    // 🎯 TẠO TASK VỚI MULTIPLE ASSIGNEES
    const newTask = await Task.create({
      title: title.trim(),
      description: description?.trim() || "",
      assignerId: assignerId,
      assigneeIds: assigneeIds, // 🆕 Mảng assigneeIds
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
            assigneeCount: assigneeIds.length, // 🆕 Ghi số lượng assignees
          },
        },
      ],
    });

    console.log(
      "✅ TASK created successfully with",
      assigneeIds.length,
      "assignees:",
      newTask._id
    );

    // 🆕 SỬA: Chỉ tạo reminders nếu có và hợp lệ
    if (reminders && reminders.length > 0) {
      try {
        const reminderPromises = reminders.map(async (reminder) => {
          if (reminder.remindAt && new Date(reminder.remindAt) > new Date()) {
            return Reminder.create({
              taskId: newTask._id,
              userId: assignerId,
              title: reminder.title || `Nhắc nhở: ${title}`,
              description:
                reminder.description || `Nhắc nhở cho task: ${title}`,
              remindAt: reminder.remindAt,
              reminderType: reminder.type || "due_date",
              recipientIds: assigneeIds, // 🆕 Gửi cho tất cả assignees
              isSent: false,
            });
          }
        });

        await Promise.all(reminderPromises.filter(Boolean));
        console.log("✅ Reminders created successfully");
      } catch (reminderError) {
        console.error(
          "⚠️ Error creating reminders, but task was created:",
          reminderError
        );
      }
    }

    // 🆕 REAL-TIME NOTIFICATION CHO TẤT CẢ ASSIGNEES
    if (io) {
      assigneeIds.forEach((assigneeId) => {
        io.to(`user_${assigneeId}`).emit("task_assigned", {
          taskId: newTask._id,
          title: newTask.title,
          assignerName: `${assigner.firstName} ${assigner.lastName}`,
          priority: newTask.priority,
          dueDate: newTask.dueDate,
          message: `Bạn được giao task mới: ${newTask.title}`,
          totalAssignees: assigneeIds.length, // 🆕 Thông báo số người cùng nhận
        });
      });
    }

    const populatedTask = await populateTaskWithUserInfo(newTask);

    res.status(201).json({
      status: "success",
      message: `Tạo task thành công cho ${assigneeIds.length} người nhận`,
      data: {
        task: populatedTask,
      },
    });
  } catch (error) {
    console.error("❌ Error creating task:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi tạo task: " + error.message,
    });
  }
});

// 🎯 Lấy danh sách tasks của user - VERSION MỚI
// POST /tasks/get-user-tasks
// controllers/taskController.js - CẬP NHẬT PHẦN getUserTasks

// 🎯 Lấy danh sách tasks của user - VERSION MỚI (HỖ TRỢ CẢ ASSIGNER VÀ ASSIGNEE)
// POST /tasks/get-user-tasks
exports.getUserTasks = catchAsync(async (req, res) => {
  try {
    const {
      keycloakId,
      status,
      page = 1,
      limit = 20,
      viewType, // 🆕 KHÔNG CÓ GIÁ TRỊ MẶC ĐỊNH - bắt buộc client phải gửi
    } = req.body;

    console.log("🔍 Fetching tasks for user:", {
      keycloakId,
      status,
      page,
      limit,
      viewType,
    });

    // 🆕 VALIDATION: Kiểm tra các trường bắt buộc
    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId is required in request body",
      });
    }

    if (!viewType) {
      return res.status(400).json({
        status: "error",
        message:
          "viewType is required. Use 'assigned' for assigned tasks or 'created' for created tasks",
      });
    }

    // 🆕 VALIDATION: Kiểm tra viewType hợp lệ
    const validViewTypes = ["assigned", "created"];
    if (!validViewTypes.includes(viewType)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid viewType. Must be one of: ${validViewTypes.join(
          ", "
        )}`,
      });
    }

    const skip = (page - 1) * limit;

    // 🆕 BUILD QUERY DỰA TRÊN VIEWTYPE ĐƯỢC TRUYỀN VÀO
    let query = {};

    if (viewType === "created") {
      // Lấy tasks mà user là người giao (assigner)
      query = { assignerId: keycloakId };
      console.log(`📋 Fetching CREATED tasks for assigner: ${keycloakId}`);
    } else if (viewType === "assigned") {
      // Lấy tasks mà user là người nhận (assignee)
      query = { assigneeIds: keycloakId };
      console.log(`📋 Fetching ASSIGNED tasks for assignee: ${keycloakId}`);
    }

    // Thêm filter status nếu có
    if (status && status !== "all") {
      query.status = status;
    }

    // Lấy tasks
    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Populate user info cho tất cả tasks
    const populatedTasks = await populateTasksWithUserInfo(tasks);

    // LẤY TỔNG SỐ TASKS CHO PAGINATION
    const totalTasks = await Task.countDocuments(query);

    console.log(
      `✅ Found ${tasks.length} tasks for user: ${keycloakId} (viewType: ${viewType})`
    );

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
      viewType: viewType,
    });
  } catch (error) {
    console.error("❌ Error fetching user tasks:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch tasks",
    });
  }
});

// 🆕 Hàm mới: Lấy tất cả tasks (cho admin/quản lý)
// POST /tasks/get-all-tasks

// 🎯 Cập nhật task - VERSION MỚI
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

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

    if (!isAuthorized) {
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

    // 🆕 VALIDATION CHO ASSIGNEE IDs UPDATE
    if (updates.assigneeIds && Array.isArray(updates.assigneeIds)) {
      if (updates.assigneeIds.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "assigneeIds phải có ít nhất 1 người nhận",
        });
      }

      // Kiểm tra tất cả assignees tồn tại
      const assignees = await User.find({
        keycloakId: { $in: updates.assigneeIds },
      });
      if (assignees.length !== updates.assigneeIds.length) {
        const foundIds = assignees.map((user) => user.keycloakId);
        const missingIds = updates.assigneeIds.filter(
          (id) => !foundIds.includes(id)
        );

        return res.status(404).json({
          status: "error",
          message: `Không tìm thấy người nhận: ${missingIds.join(", ")}`,
        });
      }
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

    // THÊM ACTIVITY LOG NẾU CÓ THAY ĐỔI ASSIGNEES
    if (
      updates.assigneeIds &&
      JSON.stringify(updates.assigneeIds) !== JSON.stringify(task.assigneeIds)
    ) {
      const activityLog = updates.activityLog || task.activityLog;
      activityLog.push({
        action: "assignees_updated",
        userId: keycloakId,
        timestamp: new Date(),
        details: {
          from: task.assigneeIds,
          to: updates.assigneeIds,
          assigneeCount: updates.assigneeIds.length,
        },
      });
      updates.activityLog = activityLog;
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

    // 🆕 Populate user info sau khi update
    const populatedTask = await populateTaskWithUserInfo(updatedTask);

    // REAL-TIME NOTIFICATION CHO ASSIGNER NẾU ASSIGNEE UPDATE
    if (
      io &&
      keycloakId !== task.assignerId && // Không phải assigner
      task.assigneeIds.includes(keycloakId) // Là assignee
    ) {
      const assigner = await User.findOne({ keycloakId: task.assignerId });
      const assignee = await User.findOne({ keycloakId: keycloakId });

      io.to(`user_${task.assignerId}`).emit("task_updated", {
        taskId: taskId,
        title: task.title,
        assigneeName: assignee.firstName + " " + assignee.lastName,
        updates: updates,
        message: `${assignee.firstName} đã cập nhật task: ${task.title}`,
      });

      console.log("📢 Sent update notification to assigner:", task.assignerId);
    }

    // 🆕 REAL-TIME NOTIFICATION CHO ASSIGNEES NẾU CÓ THAY ĐỔI ASSIGNEES
    if (updates.assigneeIds && io) {
      const oldAssignees = task.assigneeIds;
      const newAssignees = updates.assigneeIds;

      // Thông báo cho assignees mới
      const addedAssignees = newAssignees.filter(
        (id) => !oldAssignees.includes(id)
      );
      addedAssignees.forEach((assigneeId) => {
        io.to(`user_${assigneeId}`).emit("task_assigned", {
          taskId: taskId,
          title: task.title,
          assignerName: `${task.assignerInfo?.firstName || "Unknown"} ${
            task.assignerInfo?.lastName || "User"
          }`,
          priority: task.priority,
          dueDate: task.dueDate,
          message: `Bạn được giao task mới: ${task.title}`,
          totalAssignees: newAssignees.length,
        });
      });

      // Thông báo cho assignees bị xóa
      const removedAssignees = oldAssignees.filter(
        (id) => !newAssignees.includes(id)
      );
      removedAssignees.forEach((assigneeId) => {
        io.to(`user_${assigneeId}`).emit("task_unassigned", {
          taskId: taskId,
          title: task.title,
          message: `Task "${task.title}" đã được giao cho người khác`,
        });
      });
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

// 🎯 Lấy chi tiết task - VERSION MỚI
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

    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Task not found",
      });
    }

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

    if (!isAuthorized) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to view this task",
      });
    }

    // 🆕 Populate user info với schema User
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

// 🎯 Xóa task - VERSION MỚI
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

    // 🆕 KIỂM TRA QUYỀN: chỉ assigner được xóa
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

    // 🆕 REAL-TIME NOTIFICATION CHO TẤT CẢ ASSIGNEES
    if (io) {
      task.assigneeIds.forEach((assigneeId) => {
        io.to(`user_${assigneeId}`).emit("task_deleted", {
          taskId: taskId,
          title: task.title,
          message: `Task "${task.title}" đã bị xóa`,
        });
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
| REMINDER MANAGEMENT - 🎯 ĐÃ CẬP NHẬT CHO MULTIPLE ASSIGNEES
|--------------------------------------------------------------------------
*/

// 🎯 Tạo reminder mới - VERSION MỚI
// POST /tasks/reminder/create
exports.createReminder = catchAsync(async (req, res) => {
  try {
    const {
      taskId,
      keycloakId,
      remindAt,
      message,
      reminderType = "custom",
      recipientIds = [], // 🆕 OPTIONAL: gửi cho nhiều người
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

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

    if (!isAuthorized) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to create reminder for this task",
      });
    }

    // 🆕 VALIDATION RECIPIENT IDs
    const finalRecipientIds =
      recipientIds.length > 0 ? recipientIds : task.assigneeIds;

    // Kiểm tra tất cả recipients tồn tại
    const recipients = await User.find({
      keycloakId: { $in: finalRecipientIds },
    });
    if (recipients.length !== finalRecipientIds.length) {
      const foundIds = recipients.map((user) => user.keycloakId);
      const missingIds = finalRecipientIds.filter(
        (id) => !foundIds.includes(id)
      );

      return res.status(404).json({
        status: "error",
        message: `Không tìm thấy người nhận: ${missingIds.join(", ")}`,
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
      recipientIds: finalRecipientIds, // 🆕 Mảng recipientIds
    });

    console.log("✅ Reminder created successfully:", reminder._id);

    res.status(201).json({
      status: "success",
      message: `Tạo reminder thành công (${finalRecipientIds.length} người nhận)`,
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

// 🎯 Lấy reminders của user - VERSION MỚI
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

    // 🆕 LẤY REMINDERS MỚI: user là recipient trong mảng recipientIds
    const reminders = await Reminder.find({
      recipientIds: keycloakId,
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
      recipientIds: keycloakId,
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
| SOCKET HANDLERS - 🎯 ĐÃ CẬP NHẬT CHO MULTIPLE ASSIGNEES
|--------------------------------------------------------------------------
*/

// 🎯 Socket handler cho task assignment - VERSION MỚI
exports.handleTaskAssignment = catchAsync(async (socket, data) => {
  const { taskId, assigneeIds } = data; // 🆕 THAY ĐỔI: thành mảng
  const assignerId = socket.userId;

  console.log("📨 Socket task assignment:", {
    taskId,
    assigneeIds,
    assignerId,
  });

  if (!taskId || !assigneeIds || !Array.isArray(assigneeIds)) {
    return socket.emit("task_assignment_response", {
      status: "error",
      message: "taskId và assigneeIds (mảng) là bắt buộc",
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

    // 🆕 KIỂM TRA QUYỀN: chỉ assigner được reassign
    if (task.assignerId !== assignerId) {
      return socket.emit("task_assignment_response", {
        status: "error",
        message: "Only task assigner can reassign this task",
      });
    }

    // KIỂM TRA ASSIGNEES MỚI TỒN TẠI
    const newAssignees = await User.find({ keycloakId: { $in: assigneeIds } });
    if (newAssignees.length !== assigneeIds.length) {
      return socket.emit("task_assignment_response", {
        status: "error",
        message: "Một số người nhận không tồn tại",
      });
    }

    // LƯU ASSIGNEES CŨ ĐỂ GỬI NOTIFICATION
    const oldAssigneeIds = task.assigneeIds;

    // CẬP NHẬT ASSIGNEES MỚI
    task.assigneeIds = assigneeIds;
    task.activityLog.push({
      action: "reassigned",
      userId: assignerId,
      timestamp: new Date(),
      details: {
        from: oldAssigneeIds,
        to: assigneeIds,
        assigneeCount: assigneeIds.length,
      },
    });

    await task.save();

    // 🆕 SỬA: Populate user info
    const updatedTask = await populateTaskWithUserInfo(task);

    // REAL-TIME NOTIFICATIONS
    const assigner = await User.findOne({ keycloakId: assignerId });

    // GỬI CHO ASSIGNEES MỚI
    assigneeIds.forEach((assigneeId) => {
      socket.to(`user_${assigneeId}`).emit("task_assigned", {
        taskId: task._id,
        title: task.title,
        assignerName: assigner.firstName + " " + assigner.lastName,
        priority: task.priority,
        dueDate: task.dueDate,
        message: `Bạn được giao task mới: ${task.title}`,
        totalAssignees: assigneeIds.length,
      });
    });

    // GỬI CHO ASSIGNEES CŨ BỊ XÓA
    const removedAssignees = oldAssigneeIds.filter(
      (id) => !assigneeIds.includes(id)
    );
    removedAssignees.forEach((assigneeId) => {
      socket.to(`user_${assigneeId}`).emit("task_unassigned", {
        taskId: task._id,
        title: task.title,
        assignerName: assigner.firstName + " " + assigner.lastName,
        message: `Task "${task.title}" đã được giao cho người khác`,
      });
    });

    // BROADCAST UPDATE CHO TẤT CẢ CLIENTS ĐANG XEM TASK NÀY
    socket.to(`task_${taskId}`).emit("task_updated", {
      taskId: taskId,
      updates: {
        assigneeIds: assigneeIds,
        assigneesInfo: newAssignees.map((assignee) => ({
          keycloakId: assignee.keycloakId,
          username: assignee.username,
          firstName: assignee.firstName,
          lastName: assignee.lastName,
          avatar: assignee.avatar,
        })),
        totalAssignees: assigneeIds.length,
      },
      action: "reassigned",
    });

    console.log("✅ Task reassigned successfully via socket:", {
      taskId,
      from: oldAssigneeIds,
      to: assigneeIds,
    });

    // RESPONSE CHO NGƯỜI THỰC HIỆN
    socket.emit("task_assignment_response", {
      status: "success",
      message: `Task assigned successfully to ${assigneeIds.length} people`,
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

// 🎯 Socket handler cho task status update - VERSION MỚI
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

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === userId || task.assigneeIds.includes(userId);

    if (!isAuthorized) {
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

    // STATUS UPDATE MESSAGES
    const statusMessages = {
      todo: "đã chuyển về trạng thái cần làm",
      in_progress: "đã bắt đầu thực hiện",
      review: "đã chuyển sang trạng thái chờ duyệt",
      done: "đã hoàn thành",
    };

    const statusMessage = statusMessages[status] || "đã cập nhật trạng thái";

    // GỬI NOTIFICATION CHO ASSIGNER NẾU ASSIGNEE UPDATE
    if (task.assigneeIds.includes(userId) && task.assignerId !== userId) {
      socket.to(`user_${task.assignerId}`).emit("task_status_updated", {
        taskId: taskId,
        title: task.title,
        assigneeName: user.firstName + " " + user.lastName,
        oldStatus: oldStatus,
        newStatus: status,
        message: `${user.firstName} ${statusMessage} task: ${task.title}`,
      });
    }

    // GỬI NOTIFICATION CHO TẤT CẢ ASSIGNEES NẾU ASSIGNER UPDATE
    if (userId === task.assignerId) {
      task.assigneeIds.forEach((assigneeId) => {
        if (assigneeId !== userId) {
          socket.to(`user_${assigneeId}`).emit("task_status_updated", {
            taskId: taskId,
            title: task.title,
            assignerName: assigner.firstName + " " + assigner.lastName,
            oldStatus: oldStatus,
            newStatus: status,
            message: `${assigner.firstName} ${statusMessage} task: ${task.title}`,
          });
        }
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
      // Thông báo cho assigner
      if (task.assignerId !== userId) {
        socket.to(`user_${task.assignerId}`).emit("task_completed", {
          taskId: taskId,
          title: task.title,
          completedBy: user.firstName + " " + user.lastName,
          completedAt: new Date(),
          message: `🎉 Task "${task.title}" đã được hoàn thành!`,
        });
      }

      // CELEBRATION MESSAGE CHO TẤT CẢ ASSIGNEES
      task.assigneeIds.forEach((assigneeId) => {
        if (assigneeId !== userId) {
          socket.to(`user_${assigneeId}`).emit("task_completion_congrats", {
            taskId: taskId,
            title: task.title,
            message: `🎉 Chúc mừng! Task "${task.title}" đã được hoàn thành!`,
          });
        }
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

// 🎯 Socket handler cho join task room (để nhận real-time updates)
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

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === userId || task.assigneeIds.includes(userId);

    if (!isAuthorized) {
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

// 🎯 Socket handler cho leave task room
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

// 🎯 Socket handler cho task comment - VERSION MỚI
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

    // 🆕 KIỂM TRA QUYỀN: user phải là assigner hoặc assignee
    const isAuthorized =
      task.assignerId === userId || task.assigneeIds.includes(userId);

    if (!isAuthorized) {
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

    // XÁC ĐỊNH NGƯỜI NHẬN NOTIFICATION
    let notificationTargetIds = [];
    if (userId === task.assignerId) {
      // Nếu assigner comment, gửi cho tất cả assignees
      notificationTargetIds = task.assigneeIds.filter((id) => id !== userId);
    } else {
      // Nếu assignee comment, gửi cho assigner và các assignees khác
      notificationTargetIds = [
        task.assignerId,
        ...task.assigneeIds.filter((id) => id !== userId),
      ];
    }

    // GỬI NOTIFICATION CHO TẤT CẢ NGƯỜI LIÊN QUAN
    notificationTargetIds.forEach((targetId) => {
      socket.to(`user_${targetId}`).emit("task_new_comment", {
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
      recipients: notificationTargetIds.length,
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
