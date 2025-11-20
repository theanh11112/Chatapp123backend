// utils/auth.js
const User = require("../models/user");

/**
 * Đồng bộ user với DB từ Keycloak token (dùng cho API hoặc Socket)
 * @param {Object} tokenParsed - tokenParsed từ Keycloak
 * @param {Object} options - tuỳ chọn
 *   - defaultAvatar: string URL avatar mặc định hoặc function
 *   - defaultRoles: array roles mặc định
 *   - defaultStatus: trạng thái khi tạo user mới
 * @returns {Promise<User>} user đã đồng bộ
 */
async function syncUserFromToken(tokenParsed, options = {}) {
  const {
    defaultAvatar = () =>
      `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
    defaultRoles = ["user"],
    defaultStatus = "Online",
    socketId, // <-- Cho phép truyền nếu sync trong socket
    deviceInfo, // <-- optional { device, lastSeenAt }
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

  if (!user) {
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
      socketId: socketId || null, // ← ĐÃ SỬA: Luôn cập nhật socketId
      deviceInfo: deviceInfo ? [deviceInfo] : [],
    });
    console.log(`✅ Created new user: ${username} with socketId: ${socketId}`); // ← ĐÃ SỬA: Thêm log socketId
  } else {
    user.username = username;
    user.fullName = fullName;
    user.email = email;
    user.avatar = avatar;
    user.roles = roles;
    user.status = defaultStatus;
    user.lastSeen = new Date();
    user.lastLoginAt = new Date();

    // QUAN TRỌNG: Luôn cập nhật socketId mới nhất - ĐÃ SỬA
    if (socketId) {
      user.socketId = socketId;
      console.log(
        `🔄 Updated user: ${username} with NEW socketId: ${socketId}`
      ); // ← ĐÃ SỬA: Thêm log socketId mới
    }

    if (deviceInfo) {
      user.deviceInfo.push(deviceInfo);
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
    console.log("123", userRoles, allowedRoles, hasRole);
    if (!hasRole) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập route này." });
    }
    next();
  };
}

module.exports = { syncUserFromToken, requireRole };
