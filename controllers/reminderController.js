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
| REMINDER MANAGEMENT - CHO CẢ ADMIN VÀ USER
|--------------------------------------------------------------------------
*/

// 🆕 Tạo reminder mới
// POST /reminders/create
exports.createReminder = catchAsync(async (req, res) => {
  try {
    const {
      taskId,
      keycloakId,
      remindAt,
      message = "Nhắc nhở task của bạn!",
      reminderType = "custom",
    } = req.body;

    console.log("⏰ Creating reminder:", { taskId, keycloakId, remindAt });

    // VALIDATION
    if (!taskId || !keycloakId || !remindAt) {
      return res.status(400).json({
        status: "error",
        message: "taskId, keycloakId và remindAt là bắt buộc",
      });
    }

    // KIỂM TRA TASK TỒN TẠI
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy task",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP
    if (task.assigneeId !== keycloakId && task.assignerId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Không có quyền tạo reminder cho task này",
      });
    }

    // VALIDATION REMIND AT
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

    // TẠO REMINDER
    const reminder = await Reminder.create({
      taskId: taskId,
      userId: keycloakId,
      remindAt: remindAtDate,
      message: message,
      reminderType: reminderType,
      isSent: false,
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
      message: "Lỗi khi tạo reminder",
    });
  }
});

// 🆕 Lấy danh sách reminders của user
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

    // BUILD QUERY
    const query = { userId: keycloakId };
    if (!showSent) {
      query.isSent = false;
      query.remindAt = { $gte: new Date() };
    }

    // LẤY REMINDERS
    const reminders = await Reminder.find(query)
      .populate({
        path: "taskId",
        select:
          "title description status priority dueDate assigneeId assignerId",
      })
      .sort({ remindAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // POPULATE USER INFO CHO TASKS
    const populatedReminders = await Promise.all(
      reminders.map(async (reminder) => {
        if (reminder.taskId) {
          // Lấy thông tin assigner và assignee
          const [assigner, assignee] = await Promise.all([
            User.findOne({ keycloakId: reminder.taskId.assignerId }),
            User.findOne({ keycloakId: reminder.taskId.assigneeId }),
          ]);

          return {
            ...reminder,
            taskId: {
              ...reminder.taskId,
              assignerInfo: {
                keycloakId: reminder.taskId.assignerId,
                username: assigner?.username || "Unknown",
                firstName: assigner?.firstName || "Unknown",
                lastName: assigner?.lastName || "User",
              },
              assigneeInfo: {
                keycloakId: reminder.taskId.assigneeId,
                username: assignee?.username || "Unknown",
                firstName: assignee?.firstName || "Unknown",
                lastName: assignee?.lastName || "User",
              },
            },
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

// 🆕 Lấy chi tiết reminder
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
          "title description status priority dueDate assigneeId assignerId",
      })
      .lean();

    if (!reminder) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy reminder",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP
    if (reminder.userId !== keycloakId) {
      // KIỂM TRA NẾU USER CÓ QUYỀN TRUY CẬP TASK
      const task = await Task.findById(reminder.taskId._id);
      if (
        !task ||
        (task.assigneeId !== keycloakId && task.assignerId !== keycloakId)
      ) {
        return res.status(403).json({
          status: "error",
          message: "Không có quyền truy cập reminder này",
        });
      }
    }

    // POPULATE USER INFO CHO TASK
    if (reminder.taskId) {
      const [assigner, assignee] = await Promise.all([
        User.findOne({ keycloakId: reminder.taskId.assignerId }),
        User.findOne({ keycloakId: reminder.taskId.assigneeId }),
      ]);

      reminder.taskId.assignerInfo = {
        keycloakId: reminder.taskId.assignerId,
        username: assigner?.username || "Unknown",
        firstName: assigner?.firstName || "Unknown",
        lastName: assigner?.lastName || "User",
      };

      reminder.taskId.assigneeInfo = {
        keycloakId: reminder.taskId.assigneeId,
        username: assignee?.username || "Unknown",
        firstName: assignee?.firstName || "Unknown",
        lastName: assignee?.lastName || "User",
      };
    }

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

// 🆕 Cập nhật reminder
// PATCH /reminders/update
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

    // KIỂM TRA QUYỀN TRUY CẬP
    if (reminder.userId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Chỉ người tạo reminder mới được cập nhật",
      });
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

    // KHÔNG CHO PHÉP UPDATE isSent
    if (updates.hasOwnProperty("isSent")) {
      delete updates.isSent;
    }

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
      select: "title description status priority dueDate assigneeId assignerId",
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

// 🆕 Xóa reminder
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

    // KIỂM TRA QUYỀN TRUY CẬP
    if (reminder.userId !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Chỉ người tạo reminder mới được xóa",
      });
    }

    // XÓA REMINDER
    await Reminder.findByIdAndDelete(reminderId);

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

// 🆕 Lấy reminders sắp tới (cho dashboard)
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

    // LẤY REMINDERS SẮP TỚI (TRONG 7 NGÀY TỚI)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const reminders = await Reminder.find({
      userId: keycloakId,
      remindAt: {
        $gte: new Date(),
        $lte: sevenDaysFromNow,
      },
      isSent: false,
    })
      .populate({
        path: "taskId",
        select: "title status priority dueDate assigneeId assignerId",
      })
      .sort({ remindAt: 1 })
      .limit(limit)
      .lean();

    // POPULATE USER INFO
    const populatedReminders = await Promise.all(
      reminders.map(async (reminder) => {
        if (reminder.taskId) {
          const [assigner, assignee] = await Promise.all([
            User.findOne({ keycloakId: reminder.taskId.assignerId }),
            User.findOne({ keycloakId: reminder.taskId.assigneeId }),
          ]);

          return {
            ...reminder,
            taskId: {
              ...reminder.taskId,
              assignerInfo: {
                keycloakId: reminder.taskId.assignerId,
                username: assigner?.username || "Unknown",
                firstName: assigner?.firstName || "Unknown",
                lastName: assigner?.lastName || "User",
              },
              assigneeInfo: {
                keycloakId: reminder.taskId.assigneeId,
                username: assignee?.username || "Unknown",
                firstName: assignee?.firstName || "Unknown",
                lastName: assignee?.lastName || "User",
              },
            },
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

// 🆕 Đánh dấu reminder đã gửi (dùng cho cron job)
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
