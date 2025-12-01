// controllers/reminderController.js
const Reminder = require("../models/Reminder");
const Task = require("../models/Task");
const User = require("../models/user");
const catchAsync = require("../utils/catchAsync");

let io;

exports.setSocketIo = (socketIoInstance) => {
  io = socketIoInstance;
};

/*
|--------------------------------------------------------------------------
| REMINDER MANAGEMENT - ĐƠN GIẢN: MỖI REMINDER CHỈ THUỘC VỀ 1 USER
|--------------------------------------------------------------------------
*/

// 🎯 Tạo reminder mới - CHỈ CHO CHÍNH MÌNH
// POST /reminders/create
exports.createReminder = catchAsync(async (req, res) => {
  try {
    const {
      taskId, // 🎯 OPTIONAL: chỉ dùng cho reminder task
      keycloakId,
      remindAt,
      title,
      description = "",
      reminderType = "personal",
    } = req.body;

    console.log("⏰ Creating reminder:", {
      type: taskId ? "TASK_REMINDER" : "PERSONAL_REMINDER",
      taskId,
      keycloakId,
      title,
    });

    // 🎯 VALIDATION CHUNG
    if (!keycloakId || !remindAt || !title?.trim()) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId, remindAt và title là bắt buộc",
      });
    }

    // 🆕 KIỂM TRA USER TỒN TẠI
    const user = await User.findOne({ keycloakId });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy người dùng",
      });
    }

    // 🎯 VALIDATION REMIND AT
    const remindAtDate = new Date(remindAt);
    if (isNaN(remindAtDate.getTime())) {
      return res.status(400).json({
        status: "error",
        message: "Thời gian nhắc nhở không hợp lệ",
      });
    }

    if (remindAtDate <= new Date()) {
      return res.status(400).json({
        status: "error",
        message: "Thời gian nhắc nhở phải là tương lai",
      });
    }

    // 🎯 XỬ LÝ REMINDER CHO TASK
    let task = null;

    // 🆕 SỬA: Kiểm tra taskId có tồn tại và không rỗng
    if (taskId && taskId.trim() !== "") {
      task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy task",
        });
      }

      // 🆕 KIỂM TRA QUYỀN: chỉ người liên quan đến task mới tạo reminder
      const isTaskRelated =
        task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

      if (!isTaskRelated) {
        return res.status(403).json({
          status: "error",
          message: "Không có quyền tạo reminder cho task này",
        });
      }

      // 🆕 SỬA: Dùng biến mới thay vì gán lại reminderType
    }

    // 🆕 SỬA: Tạo biến mới cho reminder type
    const finalReminderType =
      taskId && taskId.trim() !== "" ? "task_reminder" : reminderType;

    // 🎯 TẠO REMINDER DATA - ĐƠN GIẢN
    const reminderData = {
      userId: keycloakId,
      remindAt: remindAtDate,
      title: title.trim(),
      description: description.trim(),
      reminderType: finalReminderType, // 🆕 DÙNG BIẾN MỚI
      isSent: false,
      isActive: true,
    };

    // 🎯 THÊM TASK ID NẾU LÀ REMINDER CHO TASK
    if (taskId && taskId.trim() !== "") {
      reminderData.taskId = taskId;

      // Tự động thêm mô tả nếu không có
      if (!description.trim() && task) {
        reminderData.description = `Nhắc nhở cho task: ${task.title}`;
      }
    }

    // TẠO REMINDER
    const reminder = await Reminder.create(reminderData);

    console.log("✅ Reminder created successfully:", {
      id: reminder._id,
      type: taskId ? "TASK_REMINDER" : "PERSONAL_REMINDER",
      user: keycloakId,
      title: reminder.title,
    });

    // 🆕 REAL-TIME NOTIFICATION CHỈ CHO CHÍNH MÌNH
    if (io) {
      io.to(`user_${keycloakId}`).emit("reminder_created", {
        reminderId: reminder._id,
        title: reminder.title,
        remindAt: reminder.remindAt,
        message: taskId
          ? `Bạn có nhắc nhở mới về task: ${reminder.title}`
          : `Bạn có nhắc nhở cá nhân: ${reminder.title}`,
      });
    }

    res.status(201).json({
      status: "success",
      message: taskId
        ? "Đã tạo nhắc nhở cho task thành công"
        : "Đã tạo nhắc nhở cá nhân thành công",
      data: reminder,
    });
  } catch (error) {
    console.error("❌ Error creating reminder:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi tạo reminder: " + error.message,
    });
  }
});

// 🎯 Lấy danh sách reminders của user - ĐƠN GIẢN
// POST /reminders/get-user-reminders
exports.getUserReminders = catchAsync(async (req, res) => {
  try {
    const { keycloakId, page = 1, limit = 20, showSent = false } = req.body;

    console.log("🔍 Fetching reminders for user:", {
      keycloakId,
      page,
      limit,
      showSent,
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    const skip = (page - 1) * limit;

    // 🆕 BUILD QUERY ĐƠN GIẢN: chỉ lấy reminders của user
    const query = {
      userId: keycloakId, // 🆕 CHỈ userId - KHÔNG CÓ recipientIds
      isActive: true,
    };

    if (!showSent) {
      query.isSent = false;
      query.remindAt = { $gte: new Date() };
    }

    // LẤY REMINDERS
    const reminders = await Reminder.find(query)
      .populate({
        path: "taskId",
        select:
          "title description status priority dueDate assignerId assigneeIds",
      })
      .sort({ remindAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 🆕 POPULATE CREATOR INFO
    const populatedReminders = await Promise.all(
      reminders.map(async (reminder) => {
        const creator = await User.findOne({ keycloakId: reminder.userId });
        reminder.creatorInfo = {
          keycloakId: reminder.userId,
          username: creator?.username || "Unknown",
          firstName: creator?.firstName || "Unknown",
          lastName: creator?.lastName || "User",
        };

        // POPULATE TASK INFO NẾU CÓ
        if (reminder.taskId && reminder.taskId._id) {
          const [assigner, assignees] = await Promise.all([
            User.findOne({ keycloakId: reminder.taskId.assignerId }),
            User.find({ keycloakId: { $in: reminder.taskId.assigneeIds } }),
          ]);

          reminder.taskId = {
            ...reminder.taskId,
            assignerInfo: {
              keycloakId: reminder.taskId.assignerId,
              username: assigner?.username || "Unknown",
              firstName: assigner?.firstName || "Unknown",
              lastName: assigner?.lastName || "User",
            },
            assigneesInfo: assignees.map((assignee) => ({
              keycloakId: assignee.keycloakId,
              username: assignee.username || "Unknown",
              firstName: assignee.firstName || "Unknown",
              lastName: assignee.lastName || "User",
              avatar: assignee.avatar,
            })),
            totalAssignees: reminder.taskId.assigneeIds?.length || 0,
          };
        }

        return reminder;
      })
    );

    const totalReminders = await Reminder.countDocuments(query);

    console.log(
      `✅ Found ${reminders.length} reminders for user: ${keycloakId}`
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
      message: "Lỗi khi lấy danh sách reminders",
    });
  }
});

// 🎯 Lấy chi tiết reminder - ĐƠN GIẢN
// POST /reminders/get-detail
exports.getReminderDetail = catchAsync(async (req, res) => {
  try {
    const { reminderId, keycloakId } = req.body;

    console.log("🔍 Fetching reminder detail:", { reminderId, keycloakId });

    if (!reminderId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "reminderId và keycloakId là bắt buộc",
      });
    }

    // LẤY REMINDER
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: "taskId",
        select:
          "title description status priority dueDate assignerId assigneeIds",
      })
      .lean();

    if (!reminder) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy reminder",
      });
    }

    // 🆕 KIỂM TRA QUYỀN TRUY CẬP: user phải là chủ sở hữu
    if (reminder.userId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Không có quyền truy cập reminder này",
      });
    }

    // 🆕 POPULATE CREATOR INFO
    const creator = await User.findOne({ keycloakId: reminder.userId });
    reminder.creatorInfo = {
      keycloakId: reminder.userId,
      username: creator?.username || "Unknown",
      firstName: creator?.firstName || "Unknown",
      lastName: creator?.lastName || "User",
    };

    console.log("✅ Reminder detail fetched successfully:", reminderId);

    res.status(200).json({
      status: "success",
      data: reminder,
    });
  } catch (error) {
    console.error("❌ Error fetching reminder detail:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi lấy chi tiết reminder",
    });
  }
});

// 🎯 Cập nhật reminder - ĐƠN GIẢN
// PATCH /reminders/update
// Trong exports.updateReminder - THÊM PHẦN XỬ LÝ isCompleted
exports.updateReminder = catchAsync(async (req, res) => {
  try {
    const { reminderId, keycloakId, updates } = req.body;

    console.log("📝 Updating reminder:", { reminderId, keycloakId, updates });

    if (!reminderId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "reminderId và keycloakId là bắt buộc",
      });
    }

    // KIỂM TRA REMINDER TỒN TẠI
    const reminder = await Reminder.findById(reminderId);
    if (!reminder) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy reminder",
      });
    }

    // 🆕 KIỂM TRA QUYỀN: chỉ chủ sở hữu mới được update
    if (reminder.userId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Chỉ người tạo reminder mới được cập nhật",
      });
    }

    // 🆕 XỬ LÝ isCompleted: tự động set completedAt nếu isCompleted = true
    if (updates.hasOwnProperty("isCompleted")) {
      if (updates.isCompleted === true) {
        updates.completedAt = new Date();
        // 🆕 Nếu đánh dấu hoàn thành, cũng set isSent = true
        updates.isSent = true;
      } else {
        updates.completedAt = null;
      }
    }

    // 🆕 KIỂM TRA TASK NẾU CÓ UPDATE TASK ID
    if (updates.taskId) {
      const task = await Task.findById(updates.taskId);
      if (!task) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy task",
        });
      }

      // KIỂM TRA QUYỀN TRUY CẬP TASK MỚI
      const isTaskRelated =
        task.assignerId === keycloakId || task.assigneeIds.includes(keycloakId);

      if (!isTaskRelated) {
        return res.status(403).json({
          status: "error",
          message: "Không có quyền liên kết reminder với task này",
        });
      }
    }

    // VALIDATION REMIND AT NẾU CÓ UPDATE
    if (updates.remindAt) {
      const remindAtDate = new Date(updates.remindAt);
      if (isNaN(remindAtDate.getTime()) || remindAtDate <= new Date()) {
        return res.status(400).json({
          status: "error",
          message: "Thời gian nhắc nhở phải là tương lai",
        });
      }
      updates.remindAt = remindAtDate;
    }

    // KHÔNG CHO PHÉP UPDATE userId
    if (updates.hasOwnProperty("userId")) delete updates.userId;

    // CẬP NHẬT REMINDER
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminderId,
      {
        ...updates,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    ).populate({
      path: "taskId",
      select:
        "title description status priority dueDate assignerId assigneeIds",
    });

    console.log("✅ Reminder updated successfully:", reminderId);

    res.status(200).json({
      status: "success",
      message: "Cập nhật reminder thành công",
      data: updatedReminder,
    });
  } catch (error) {
    console.error("❌ Error updating reminder:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi cập nhật reminder",
    });
  }
});

// 🎯 Xóa reminder - ĐƠN GIẢN
// POST /reminders/delete
exports.deleteReminder = catchAsync(async (req, res) => {
  try {
    const { reminderId, keycloakId } = req.body;

    console.log("🗑️ Deleting reminder:", { reminderId, keycloakId });

    if (!reminderId || !keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "reminderId và keycloakId là bắt buộc",
      });
    }

    // KIỂM TRA REMINDER TỒN TẠI
    const reminder = await Reminder.findById(reminderId);
    if (!reminder) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy reminder",
      });
    }

    // 🆕 KIỂM TRA QUYỀN: chỉ chủ sở hữu mới được xóa
    if (reminder.userId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Chỉ người tạo reminder mới được xóa",
      });
    }

    // XÓA REMINDER (soft delete bằng cách set isActive = false)
    await Reminder.findByIdAndUpdate(reminderId, {
      isActive: false,
      updatedAt: new Date(),
    });

    console.log("✅ Reminder deleted successfully:", reminderId);

    res.status(200).json({
      status: "success",
      message: "Xóa reminder thành công",
    });
  } catch (error) {
    console.error("❌ Error deleting reminder:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi xóa reminder",
    });
  }
});

// 🎯 Lấy reminders sắp tới (cho dashboard) - ĐƠN GIẢN
// POST /reminders/upcoming
exports.getUpcomingReminders = catchAsync(async (req, res) => {
  try {
    const { keycloakId, limit = 10 } = req.body;

    console.log("🔍 Fetching upcoming reminders:", { keycloakId, limit });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    // LẤY REMINDERS SẮP TỚI (TRONG 7 NGÀY TỚI) - CHỈ CỦA CHÍNH MÌNH
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const reminders = await Reminder.find({
      userId: keycloakId, // 🆕 CHỈ userId
      remindAt: {
        $gte: new Date(),
        $lte: sevenDaysFromNow,
      },
      isSent: false,
      isActive: true,
    })
      .populate({
        path: "taskId",
        select: "title status priority dueDate assignerId assigneeIds",
      })
      .sort({ remindAt: 1 })
      .limit(limit)
      .lean();

    // 🆕 POPULATE THÔNG TIN
    const populatedReminders = await Promise.all(
      reminders.map(async (reminder) => {
        // Populate creator info
        const creator = await User.findOne({ keycloakId: reminder.userId });
        reminder.creatorInfo = {
          keycloakId: reminder.userId,
          username: creator?.username || "Unknown",
          firstName: creator?.firstName || "Unknown",
          lastName: creator?.lastName || "User",
        };

        // Populate task info nếu có
        if (reminder.taskId && reminder.taskId._id) {
          const [assigner, assignees] = await Promise.all([
            User.findOne({ keycloakId: reminder.taskId.assignerId }),
            User.find({ keycloakId: { $in: reminder.taskId.assigneeIds } }),
          ]);

          reminder.taskId = {
            ...reminder.taskId,
            assignerInfo: {
              keycloakId: reminder.taskId.assignerId,
              username: assigner?.username || "Unknown",
              firstName: assigner?.firstName || "Unknown",
              lastName: assigner?.lastName || "User",
            },
            assigneesInfo: assignees.map((assignee) => ({
              keycloakId: assignee.keycloakId,
              username: assignee.username || "Unknown",
              firstName: assignee.firstName || "Unknown",
              lastName: assignee.lastName || "User",
              avatar: assignee.avatar,
            })),
            totalAssignees: reminder.taskId.assigneeIds?.length || 0,
          };
        }
        return reminder;
      })
    );

    console.log(
      `✅ Found ${reminders.length} upcoming reminders for user: ${keycloakId}`
    );

    res.status(200).json({
      status: "success",
      results: reminders.length,
      data: populatedReminders,
    });
  } catch (error) {
    console.error("❌ Error fetching upcoming reminders:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi lấy reminders sắp tới",
    });
  }
});

// 🎯 Các hàm khác giữ nguyên (markReminderAsSent, getAllReminders)// 🎯 Đánh dấu reminder đã gửi (dùng cho cron job)
// PATCH /reminders/mark-sent
exports.markReminderAsSent = catchAsync(async (req, res) => {
  try {
    const { reminderId } = req.body;

    console.log("📨 Marking reminder as sent:", { reminderId });

    if (!reminderId) {
      return res.status(400).json({
        status: "error",
        message: "reminderId là bắt buộc",
      });
    }

    // CẬP NHẬT REMINDER
    const updatedReminder = await Reminder.findByIdAndUpdate(
      reminderId,
      {
        isSent: true,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedReminder) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy reminder",
      });
    }

    console.log("✅ Reminder marked as sent:", reminderId);

    res.status(200).json({
      status: "success",
      message: "Đã đánh dấu reminder đã gửi",
      data: updatedReminder,
    });
  } catch (error) {
    console.error("❌ Error marking reminder as sent:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi đánh dấu reminder đã gửi",
    });
  }
});

// 🎯 Lấy tất cả reminders (cho admin) - VẪN GIỮ NGUYÊN
// POST /reminders/get-all
exports.getAllReminders = catchAsync(async (req, res) => {
  try {
    const { page = 1, limit = 50, showSent = false } = req.body;

    console.log("🔍 Fetching all reminders:", { page, limit, showSent });

    const skip = (page - 1) * limit;

    // BUILD QUERY
    const query = { isActive: true };
    if (!showSent) {
      query.isSent = false;
    }

    // LẤY REMINDERS
    const reminders = await Reminder.find(query)
      .populate({
        path: "taskId",
        select: "title status priority dueDate assignerId assigneeIds",
      })
      .sort({ remindAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReminders = await Reminder.countDocuments(query);

    console.log(`✅ Found ${reminders.length} reminders in total`);

    res.status(200).json({
      status: "success",
      results: reminders.length,
      data: reminders,
      pagination: {
        page,
        limit,
        total: totalReminders,
        pages: Math.ceil(totalReminders / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching all reminders:", error);
    res.status(500).json({
      status: "error",
      message: "Lỗi khi lấy danh sách reminders",
    });
  }
});
