// controllers/settingsController.js
const Settings = require("../models/Settings");
const catchAsync = require("../utils/catchAsync");

/*
|--------------------------------------------------------------------------
| SETTINGS MANAGEMENT
|--------------------------------------------------------------------------
*/

// 🆕 Lấy tất cả cài đặt của user
// POST /settings/get-settings
exports.getSettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId } = req.body;

    console.log("🔍 Fetching settings for user:", keycloakId);

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    let settings = await Settings.findOne({ user: keycloakId });

    // Nếu chưa có settings, tạo mới
    if (!settings) {
      console.log("🆕 Creating new settings for user:", keycloakId);
      settings = await Settings.create({ user: keycloakId });
    }

    console.log("✅ Settings fetched successfully");

    res.status(200).json({
      status: "success",
      data: settings,
    });
  } catch (error) {
    console.error("❌ Error fetching settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch settings",
    });
  }
});

// 🆕 Cập nhật cài đặt thông báo
// PUT /settings/notifications
exports.updateNotificationSettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId, settings } = req.body; // Đổi từ ...notificationSettings thành settings

    console.log("🔔 Updating notification settings:", {
      keycloakId,
      settings, // Nhận trực tiếp settings object
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({
        status: "error",
        message: "Settings object là bắt buộc",
      });
    }

    // Validate input
    const validNotificationKeys = [
      "message",
      "preview",
      "sound",
      "desktop",
      "mobile",
      "group", // Thêm group vào valid keys
    ];
    const invalidKeys = Object.keys(settings).filter(
      (key) => !validNotificationKeys.includes(key)
    );

    if (invalidKeys.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid notification settings: ${invalidKeys.join(", ")}`,
      });
    }

    // Update settings
    const updatedSettings = await Settings.findOneAndUpdate(
      { user: keycloakId },
      {
        $set: {
          notifications: settings, // Sử dụng settings trực tiếp
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    console.log("✅ Notification settings updated successfully");

    res.status(200).json({
      status: "success",
      message: "Cài đặt thông báo đã được cập nhật thành công!",
      data: updatedSettings.notifications,
    });
  } catch (error) {
    console.error("❌ Error updating notification settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update notification settings",
    });
  }
});
// 🆕 Cập nhật cài đặt bảo mật
// PUT /settings/privacy
exports.updatePrivacySettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId, ...privacySettings } = req.body;

    console.log("🔒 Updating privacy settings:", {
      keycloakId,
      settings: privacySettings,
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    // Validate input
    const validPrivacyKeys = [
      "lastSeen",
      "profilePhoto",
      "status",
      "readReceipts",
      "typingIndicators",
    ];
    const invalidKeys = Object.keys(privacySettings).filter(
      (key) => !validPrivacyKeys.includes(key)
    );

    if (invalidKeys.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid privacy settings: ${invalidKeys.join(", ")}`,
      });
    }

    // Validate enum values
    const enumValidations = {
      lastSeen: ["everyone", "contacts", "nobody"],
      profilePhoto: ["everyone", "contacts", "nobody"],
      status: ["everyone", "contacts", "nobody"],
    };

    for (const [key, validValues] of Object.entries(enumValidations)) {
      if (privacySettings[key] && !validValues.includes(privacySettings[key])) {
        return res.status(400).json({
          status: "error",
          message: `Invalid value for ${key}. Must be one of: ${validValues.join(
            ", "
          )}`,
        });
      }
    }

    // Update settings
    const settings = await Settings.findOneAndUpdate(
      { user: keycloakId },
      {
        $set: {
          privacy: privacySettings,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    console.log("✅ Privacy settings updated successfully");

    res.status(200).json({
      status: "success",
      message: "Cài đặt bảo mật đã được cập nhật thành công!",
      data: settings.privacy,
    });
  } catch (error) {
    console.error("❌ Error updating privacy settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update privacy settings",
    });
  }
});

// 🆕 Cập nhật cài đặt chung
// PUT /settings/general
exports.updateGeneralSettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId, ...generalSettings } = req.body;

    console.log("⚙️ Updating general settings:", {
      keycloakId,
      settings: generalSettings,
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    // Validate input
    const validGeneralKeys = ["language", "theme", "fontSize"];
    const invalidKeys = Object.keys(generalSettings).filter(
      (key) => !validGeneralKeys.includes(key)
    );

    if (invalidKeys.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid general settings: ${invalidKeys.join(", ")}`,
      });
    }

    // Validate enum values
    const enumValidations = {
      theme: ["light", "dark", "system"],
      fontSize: ["small", "medium", "large"],
    };

    for (const [key, validValues] of Object.entries(enumValidations)) {
      if (generalSettings[key] && !validValues.includes(generalSettings[key])) {
        return res.status(400).json({
          status: "error",
          message: `Invalid value for ${key}. Must be one of: ${validValues.join(
            ", "
          )}`,
        });
      }
    }

    // Update settings
    const settings = await Settings.findOneAndUpdate(
      { user: keycloakId },
      {
        $set: {
          general: generalSettings,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    console.log("✅ General settings updated successfully");

    res.status(200).json({
      status: "success",
      message: "Cài đặt chung đã được cập nhật thành công!",
      data: settings.general,
    });
  } catch (error) {
    console.error("❌ Error updating general settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update general settings",
    });
  }
});

// 🆕 Cập nhật cài đặt chat
// PUT /settings/chat
exports.updateChatSettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId, ...chatSettings } = req.body;

    console.log("💬 Updating chat settings:", {
      keycloakId,
      settings: chatSettings,
    });

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    // Validate input
    const validChatKeys = [
      "enterToSend",
      "emojiPicker",
      "mediaAutoDownload",
      "saveToCameraRoll",
    ];
    const invalidKeys = Object.keys(chatSettings).filter(
      (key) => !validChatKeys.includes(key)
    );

    if (invalidKeys.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid chat settings: ${invalidKeys.join(", ")}`,
      });
    }

    // Update settings
    const settings = await Settings.findOneAndUpdate(
      { user: keycloakId },
      {
        $set: {
          chat: chatSettings,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    console.log("✅ Chat settings updated successfully");

    res.status(200).json({
      status: "success",
      message: "Cài đặt chat đã được cập nhật thành công!",
      data: settings.chat,
    });
  } catch (error) {
    console.error("❌ Error updating chat settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update chat settings",
    });
  }
});

// 🆕 Reset tất cả cài đặt về mặc định
// POST /settings/reset
exports.resetSettings = catchAsync(async (req, res) => {
  try {
    const { keycloakId } = req.body;

    console.log("🔄 Resetting settings for user:", keycloakId);

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId là bắt buộc",
      });
    }

    // Tạo settings mới với giá trị mặc định
    const defaultSettings = {
      user: keycloakId,
      notifications: {
        message: true,
        preview: true,
        sound: true,
        desktop: true,
        mobile: false,
      },
      privacy: {
        lastSeen: "everyone",
        profilePhoto: "everyone",
        status: "everyone",
        readReceipts: true,
        typingIndicators: true,
      },
      general: {
        language: "vi",
        theme: "system",
        fontSize: "medium",
      },
      chat: {
        enterToSend: true,
        emojiPicker: true,
        mediaAutoDownload: true,
        saveToCameraRoll: false,
      },
    };

    const settings = await Settings.findOneAndUpdate(
      { user: keycloakId },
      defaultSettings,
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    console.log("✅ Settings reset successfully");

    res.status(200).json({
      status: "success",
      message: "Cài đặt đã được reset về mặc định thành công!",
      data: settings,
    });
  } catch (error) {
    console.error("❌ Error resetting settings:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to reset settings",
    });
  }
});
