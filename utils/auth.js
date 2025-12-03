// utils/auth.js
const User = require("../models/user");

/**
 * Đồng bộ user với DB từ Keycloak token (dùng cho API hoặc Socket)
 * @param {Object} tokenParsed - tokenParsed từ Keycloak
 * @param {Object} options - tuỳ chọn
 *   - defaultAvatar: string URL avatar mặc định hoặc function
 *   - defaultRoles: array roles mặc định
 *   - defaultStatus: trạng thái khi tạo user mới
 *   - socketId: socket ID cho socket connections
 *   - deviceInfo: thông tin device
 * @returns {Promise<User>} user đã đồng bộ
 */
async function syncUserFromToken(tokenParsed, options = {}) {
  const {
    defaultAvatar = () =>
      `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
    defaultRoles = ["user"],
    defaultStatus = "Online",
    socketId,
    deviceInfo,
  } = options;

  if (!tokenParsed?.sub) throw new Error("Token không hợp lệ");

  const keycloakId = tokenParsed.sub;
  const username = tokenParsed.preferred_username || "";
  const fullName = `${tokenParsed.given_name || ""} ${
    tokenParsed.family_name || ""
  }`.trim();
  const email = tokenParsed.email || "";
  const roles = tokenParsed.realm_access?.roles || defaultRoles;
  const avatar =
    typeof defaultAvatar === "function" ? defaultAvatar() : defaultAvatar;

  let user = await User.findOne({ keycloakId });

  // 🆕 THÊM: Giá trị mặc định cho E2EE
  const defaultE2EEFields = {
    e2eeEnabled: false,
    e2eeSupported: true, // Mặc định hỗ trợ E2EE
    e2eeKeys: [],
    currentKeyFingerprint: null,
    keyRotationDate: null,
  };

  if (!user) {
    // Tạo user mới với E2EE fields
    user = await User.create({
      keycloakId,
      username,
      fullName,
      email,
      avatar,
      roles,
      status: defaultStatus,
      isActive: true,
      lastSeen: new Date(),
      lastLoginAt: new Date(),
      socketId: socketId || null,
      deviceInfo: deviceInfo ? [deviceInfo] : [],
      // 🆕 THÊM: E2EE fields
      ...defaultE2EEFields,
    });
    console.log(`✅ Created new user: ${username} with socketId: ${socketId}`);
  } else {
    // Cập nhật user hiện tại
    user.username = username;
    user.fullName = fullName;
    user.email = email;
    user.avatar = avatar;
    user.roles = roles;
    user.status = defaultStatus;
    user.lastSeen = new Date();
    user.lastLoginAt = new Date();

    // QUAN TRỌNG: Luôn cập nhật socketId mới nhất
    if (socketId) {
      user.socketId = socketId;
      console.log(
        `🔄 Updated user: ${username} with NEW socketId: ${socketId}`
      );
    }

    if (deviceInfo) {
      user.deviceInfo.push(deviceInfo);
    }

    // 🆕 THÊM: Đảm bảo E2EE fields tồn tại (cho các user cũ)
    if (!user.e2eeEnabled && user.e2eeEnabled !== false) {
      user.e2eeEnabled = defaultE2EEFields.e2eeEnabled;
    }
    if (!user.e2eeSupported && user.e2eeSupported !== false) {
      user.e2eeSupported = defaultE2EEFields.e2eeSupported;
    }
    if (!user.e2eeKeys) {
      user.e2eeKeys = defaultE2EEFields.e2eeKeys;
    }
    if (!user.currentKeyFingerprint && user.currentKeyFingerprint !== null) {
      user.currentKeyFingerprint = defaultE2EEFields.currentKeyFingerprint;
    }
    if (!user.keyRotationDate && user.keyRotationDate !== null) {
      user.keyRotationDate = defaultE2EEFields.keyRotationDate;
    }

    await user.save();
  }

  return user;
}

/**
 * Middleware kiểm tra role của user (chạy sau khi user đã sync)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập route này." });
    }
    next();
  };
}

/**
 * 🆕 THÊM: Kiểm tra quyền truy cập E2EE
 * Chỉ cho phép bạn bè hoặc thành viên cùng nhóm truy cập E2EE keys
 */
async function checkE2EEAccess(currentUserId, targetUserId) {
  try {
    // Kiểm tra nếu là chính mình
    if (currentUserId === targetUserId) return true;

    const currentUser = await User.findOne({ keycloakId: currentUserId });
    if (!currentUser) return false;

    // Kiểm tra nếu là bạn bè
    if (currentUser.friends && currentUser.friends.includes(targetUserId)) {
      return true;
    }

    // Kiểm tra nếu trong cùng nhóm
    const Room = require("../models/room");
    const sharedRooms = await Room.find({
      isGroup: true,
      members: { $all: [currentUserId, targetUserId] },
    }).limit(1);

    if (sharedRooms.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Error checking E2EE access:", error);
    return false;
  }
}

/**
 * 🆕 THÊM: Helper function tính fingerprint cho public key
 */
function calculateKeyFingerprint(publicKey) {
  const crypto = require("crypto");
  return crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();
}

module.exports = {
  syncUserFromToken,
  requireRole,
  checkE2EEAccess,
  calculateKeyFingerprint,
};
