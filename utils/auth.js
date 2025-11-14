// utils/auth.js

/**
 * Middleware kiểm tra role của user
 * Hỗ trợ nhiều role: ví dụ requireRole('user', 'admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Lấy token từ Keycloak middleware
    const token = req.kauth?.grant?.access_token?.content;
    if (!token) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    // Lấy danh sách role của user
    const userRoles = token.realm_access?.roles || [];

    // Kiểm tra user có ít nhất 1 role hợp lệ không
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập route này." });
    }

    next();
  };
}

module.exports = { requireRole };
