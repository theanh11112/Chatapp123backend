// utils/auth.js

// Middleware kiểm tra role
function requireRole(role) {
  return (req, res, next) => {
    const token = req.kauth?.grant?.access_token?.content;
    if (!token) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    const roles = token.realm_access?.roles || [];
    if (roles.includes(role)) {
      return next();
    }

    return res.status(403).json({ message: "Bạn không có quyền truy cập route này." });
  };
}

module.exports = { requireRole };
