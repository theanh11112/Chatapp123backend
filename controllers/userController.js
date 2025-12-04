// controllers/userController.js
const Room = require("../models/room");
const User = require("../models/user");
const Message = require("../models/message");
const OneToOneMessage = require("../models/OneToOneMessage");
const Call = require("../models/call");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");
const FriendRequest = require("../models/friendRequest");
const mongoose = require("mongoose");

exports.setSocketIo = (socketIoInstance) => {
  io = socketIoInstance;
};

/*
|--------------------------------------------------------------------------
| USER MANAGEMENT - 🆕 THÊM MỚI
|--------------------------------------------------------------------------
*/

// 🆕 THÊM: Lấy danh sách tất cả users (cho tạo group)
// GET /users/get-users
// controllers/userController.js - SỬA HÀM getAllUsers
// controllers/userController.js - SỬA LẠI HOÀN TOÀN HÀM getAllUsers
exports.getAllUsers = catchAsync(async (req, res) => {
  try {
    console.log("🔍 Fetching all users...");

    // Lấy danh sách tất cả users, loại trừ user hiện tại nếu có
    const currentUserId = req.user?.keycloakId;
    const query = currentUserId ? { keycloakId: { $ne: currentUserId } } : {};

    let users = await User.find(query)
      .select(
        "keycloakId username firstName lastName email avatar status lastSeen isActive roles createdAt lastLoginAt"
      )
      .sort({ firstName: 1, lastName: 1 });

    // 🆕 LỌC BỎ CÁC ROLE KEYCLOAK MẶC ĐỊNH - SỬA LẠI LOGIC
    const keycloakDefaultRoles = [
      "offline_access",
      "default-roles-chat-app",
      "uma_authorization",
      "default-roles-master",
    ];

    users = users.map((user) => {
      const userObj = user.toObject();

      // 🆕 Lọc roles - LOẠI BỎ role Keycloak mặc định, CHỈ GIỮ LẠI role quan trọng
      const filteredRoles = userObj.roles
        ? userObj.roles.filter((role) => !keycloakDefaultRoles.includes(role))
        : ["user"];

      // 🆕 Đảm bảo luôn có ít nhất role 'user'
      const finalRoles = filteredRoles.length > 0 ? filteredRoles : ["user"];

      return {
        ...userObj,
        // 🆕 THAY THẾ HOÀN TOÀN roles bằng filtered roles
        roles: finalRoles,
        // Fallback cho các field khác
        isActive: userObj.isActive !== undefined ? userObj.isActive : true,
        firstName: userObj.firstName || userObj.username,
        lastName: userObj.lastName || "",
      };
    });

    console.log("✅ Users fetched with filtered roles:", users.length);
    console.log("🔍 Sample user roles after filtering:", users[0]?.roles);

    res.status(200).json({
      status: "success",
      results: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch users",
    });
  }
});

// 🆕 THÊM: Tạo group mới
// POST /users/group/create
exports.createGroup = catchAsync(async (req, res) => {
  try {
    const { name, members, topic } = req.body;
    const createdBy = req.user?.keycloakId;

    console.log("📦 Creating new group:", { name, members, createdBy });

    // VALIDATION
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({
        status: "error",
        message: "Group name and members array are required",
      });
    }

    if (members.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Group must have at least 2 members",
      });
    }

    // THÊM createdBy vào members nếu chưa có
    const allMembers = [...new Set([...members, createdBy])];

    // KIỂM TRA USERS TỒN TẠI
    const existingUsers = await User.find({
      keycloakId: { $in: allMembers },
    }).select("keycloakId");

    const existingUserIds = existingUsers.map((user) => user.keycloakId);
    const nonExistingUsers = allMembers.filter(
      (member) => !existingUserIds.includes(member)
    );

    if (nonExistingUsers.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Some users not found: ${nonExistingUsers.join(", ")}`,
      });
    }

    // TẠO GROUP MỚI
    const newGroup = await Room.create({
      name: name.trim(),
      isGroup: true,
      members: allMembers, // Lưu keycloakIds
      createdBy: createdBy,
      topic: topic || null,
    });

    console.log("✅ Group created successfully:", newGroup._id);

    // POPULATE THÔNG TIN ĐẦY ĐỦ ĐỂ TRẢ VỀ
    const populatedGroup = await Room.findById(newGroup._id)
      .populate({
        path: "members",
        select: "keycloakId username firstName lastName avatar status",
        match: { keycloakId: { $in: allMembers } },
      })
      .populate({
        path: "createdBy",
        select: "keycloakId username firstName lastName avatar",
        match: { keycloakId: createdBy },
      });

    res.status(201).json({
      status: "success",
      message: "Group created successfully",
      data: populatedGroup,
    });
  } catch (error) {
    console.error("❌ Error creating group:", error);

    // XỬ LÝ LỖI DUPLICATE
    if (error.code === 11000) {
      return res.status(400).json({
        status: "error",
        message: "Group name already exists",
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create group",
    });
  }
});

// 🆕 THÊM: Tìm kiếm users
// GET /users/search?q=keyword
exports.searchUsers = catchAsync(async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Search query must be at least 2 characters",
      });
    }

    console.log("🔍 Searching users:", q);

    const users = await User.find({
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    })
      .select("keycloakId username firstName lastName email avatar status")
      .limit(20)
      .sort({ firstName: 1 });

    res.status(200).json({
      status: "success",
      results: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error searching users:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to search users",
    });
  }
});

// controllers/userController.js - THÊM VÀO CUỐI FILE

/*
|--------------------------------------------------------------------------
| USER ADMIN MANAGEMENT - 🆕 THÊM MỚI
|--------------------------------------------------------------------------
*/

// 🆕 THÊM: Cập nhật trạng thái user (active/inactive)
// PATCH /users/update-status
exports.updateUserStatus = catchAsync(async (req, res) => {
  try {
    const { userId, isActive } = req.body;

    console.log("🔄 Updating user status:", { userId, isActive });

    // VALIDATION
    if (!userId || typeof isActive !== "boolean") {
      return res.status(400).json({
        status: "error",
        message: "userId and isActive (boolean) are required",
      });
    }

    // TÌM VÀ CẬP NHẬT USER
    const user = await User.findOneAndUpdate(
      { keycloakId: userId },
      {
        isActive: isActive,
        ...(isActive === false ? { status: "Offline" } : {}), // Nếu deactive thì set offline
      },
      { new: true }
    ).select(
      "keycloakId username firstName lastName email isActive status roles"
    );

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    console.log("✅ User status updated successfully:", user.keycloakId);

    res.status(200).json({
      status: "success",
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: user,
    });
  } catch (error) {
    console.error("❌ Error updating user status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update user status",
    });
  }
});

// 🆕 THÊM: Cập nhật vai trò user
// PATCH /users/update-role
exports.updateUserRole = catchAsync(async (req, res) => {
  try {
    const { userId, role } = req.body;

    console.log("🔄 Updating user role:", { userId, role });

    // VALIDATION
    if (!userId || !role) {
      return res.status(400).json({
        status: "error",
        message: "userId and role are required",
      });
    }

    // KIỂM TRA ROLE HỢP LỆ
    const validRoles = ["user", "admin", "moderator", "bot"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    // TÌM VÀ CẬP NHẬT USER
    const user = await User.findOneAndUpdate(
      { keycloakId: userId },
      {
        $addToSet: { roles: role }, // Thêm role vào mảng (không trùng lặp)
      },
      { new: true }
    ).select(
      "keycloakId username firstName lastName email isActive status roles"
    );

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    console.log("✅ User role updated successfully:", {
      userId: user.keycloakId,
      newRoles: user.roles,
    });

    res.status(200).json({
      status: "success",
      message: `Role '${role}' added to user successfully`,
      data: user,
    });
  } catch (error) {
    console.error("❌ Error updating user role:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update user role",
    });
  }
});

// 🆕 THÊM: Xóa role khỏi user
// PATCH /users/remove-role
exports.removeUserRole = catchAsync(async (req, res) => {
  try {
    const { userId, role } = req.body;

    console.log("🔄 Removing user role:", { userId, role });

    // VALIDATION
    if (!userId || !role) {
      return res.status(400).json({
        status: "error",
        message: "userId and role are required",
      });
    }

    // KHÔNG CHO PHÉP XÓA ROLE 'user' (mặc định)
    if (role === "user") {
      return res.status(400).json({
        status: "error",
        message: "Cannot remove default 'user' role",
      });
    }

    // TÌM VÀ CẬP NHẬT USER
    const user = await User.findOneAndUpdate(
      { keycloakId: userId },
      {
        $pull: { roles: role }, // Xóa role khỏi mảng
      },
      { new: true }
    ).select(
      "keycloakId username firstName lastName email isActive status roles"
    );

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    console.log("✅ User role removed successfully:", {
      userId: user.keycloakId,
      remainingRoles: user.roles,
    });

    res.status(200).json({
      status: "success",
      message: `Role '${role}' removed from user successfully`,
      data: user,
    });
  } catch (error) {
    console.error("❌ Error removing user role:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to remove user role",
    });
  }
});

/*
|--------------------------------------------------------------------------
| USER PROFILE - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// GET /users/me
exports.getMe = catchAsync(async (req, res) => {
  const keycloakId = req.user?.keycloakId || req.user?.id;

  if (!keycloakId)
    return res
      .status(400)
      .json({ status: "fail", message: "Missing user token" });

  const user = await User.findOne({ keycloakId });

  if (!user)
    return res.status(404).json({ status: "fail", message: "User not found" });

  res.status(200).json({ status: "success", data: user });
});

exports.getProfile = exports.getMe;

// PATCH /users/me
exports.updateMe = catchAsync(async (req, res) => {
  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "about",
    "avatar",
    "username", // ✅ THÊM field name
    "status" // ✅ THÊM field status
  );

  const updatedUser = await User.findByIdAndUpdate(req.user._id, filteredBody, {
    new: true,
  });

  console.log("22222", updatedUser);

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: updatedUser,
  });
});

exports.updateProfile = exports.updateMe;

/*
|--------------------------------------------------------------------------
| ROOM HELPERS - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

const getUserFromToken = async (req) => {
  const keycloakId = req.user?.keycloakId;
  if (!keycloakId) return null;
  return await User.findOne({ keycloakId });
};

/*
|--------------------------------------------------------------------------
| DIRECT CHAT - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// POST /users/direct/get-one
exports.getDirectConversationById = catchAsync(async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: "roomId is required" });

  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const room = await Room.findOne({
    _id: roomId,
    isGroup: false,
    members: user._id,
  })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate("createdBy", "keycloakId username avatar")
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    });

  if (!room) return res.status(404).json({ message: "Conversation not found" });

  res.status(200).json({ status: "success", data: room });
});

// POST /users/direct/get-all
exports.getDirectConversations = catchAsync(async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const rooms = await Room.find({ isGroup: false, members: user._id })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    })
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json({ status: "success", results: rooms.length, data: rooms });
});

/*
|--------------------------------------------------------------------------
| GROUP CHAT - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// POST /users/group/get-one
exports.getGroupRooms = catchAsync(async (req, res) => {
  const { keycloakId } = req.body;

  console.log("🔍 Received keycloakId:", keycloakId);

  if (!keycloakId) {
    return res.status(400).json({ message: "keycloakId is required" });
  }

  // Tìm rooms có chứa keycloakId trong mảng members
  const rooms = await Room.find({
    isGroup: true,
    members: keycloakId,
  })
    .populate("lastMessage")
    .populate("pinnedMessages")
    .sort({ updatedAt: -1 });

  // Lấy thông tin chi tiết của members và createdBy
  const roomsWithUserDetails = await Promise.all(
    rooms.map(async (room) => {
      // Lấy thông tin chi tiết của tất cả members
      const memberDetails = await User.find({
        keycloakId: { $in: room.members },
      }).select(
        "keycloakId username firstName lastName avatar status lastSeen"
      );

      // Lấy thông tin người tạo room
      const createdByUser = await User.findOne({
        keycloakId: room.createdBy,
      }).select("keycloakId username firstName lastName avatar");

      return {
        _id: room._id,
        name: room.name,
        isGroup: room.isGroup,
        members: memberDetails,
        createdBy: createdByUser,
        lastMessage: room.lastMessage,
        pinnedMessages: room.pinnedMessages,
        topic: room.topic,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    })
  );

  res.status(200).json({
    status: "success",
    results: roomsWithUserDetails.length,
    data: roomsWithUserDetails,
  });
});

/*
|--------------------------------------------------------------------------
| ROOM MESSAGES - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// POST /users/room/messages
exports.getRoomMessages = catchAsync(async (req, res) => {
  const { roomId, page = 1, limit = 50 } = req.body;
  if (!roomId) return res.status(400).json({ message: "roomId is required" });

  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  const room = await Room.findOne({
    _id: roomObjectId,
    members: user.keycloakId,
  });
  if (!room) return res.status(403).json({ message: "Access denied" });

  const skip = (page - 1) * limit;

  // Populate replyTo với thông tin đầy đủ
  let messages = await Message.find({ room: roomObjectId })
    .populate("sender", "keycloakId username firstName lastName avatar")
    .populate({
      path: "replyTo",
      select: "content sender type createdAt",
      populate: {
        path: "sender",
        select: "keycloakId username firstName lastName avatar",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  console.log("🔍 Messages found:", messages.length);

  messages = messages.reverse();

  // Transform messages để có structure giống socket
  const transformedMessages = messages.map((msg) => {
    const messageObj = msg.toObject ? msg.toObject() : { ...msg };

    // XỬ LÝ REPLYTO - TẠO OBJECT ĐẦY ĐỦ
    let processedReplyTo = null;
    if (messageObj.replyTo) {
      if (typeof messageObj.replyTo === "object" && messageObj.replyTo._id) {
        // Đã populate replyTo - tạo object đầy đủ
        processedReplyTo = {
          id: messageObj.replyTo._id,
          content:
            messageObj.replyTo.content ||
            messageObj.replyContent ||
            "Original message",
          sender: messageObj.replyTo.sender ||
            messageObj.replySender || {
              keycloakId: "unknown",
              username: "Unknown",
            },
          type: messageObj.replyTo.type || messageObj.replyType || "text",
        };
      } else if (typeof messageObj.replyTo === "string") {
        // Chỉ có ID - tạo object với thông tin có sẵn
        processedReplyTo = {
          id: messageObj.replyTo,
          content: messageObj.replyContent || "Original message",
          sender: messageObj.replySender || {
            keycloakId: "unknown",
            username: "Unknown",
          },
          type: messageObj.replyType || "text",
        };
      }
    }

    // TẠO MESSAGE STRUCTURE ĐỒNG NHẤT VỚI SOCKET
    return {
      _id: messageObj._id,
      id: messageObj._id.toString(),
      type: "msg",
      subtype: messageObj.type || "text",
      message: messageObj.content || "",
      content: messageObj.content || "",
      incoming: messageObj.sender?.keycloakId !== user.keycloakId,
      outgoing: messageObj.sender?.keycloakId === user.keycloakId,
      time: formatMessageTime(messageObj.createdAt),
      createdAt: messageObj.createdAt,
      attachments: messageObj.attachments || [],
      sender: messageObj.sender || {
        keycloakId: "unknown",
        username: "Unknown",
      },
      // THÊM REPLYTO ĐÃ XỬ LÝ
      replyTo: processedReplyTo,
      replyContent: messageObj.replyContent,
      replySender: messageObj.replySender,
      replyType: messageObj.replyType,
    };
  });

  console.log("✅ Transformed messages for API:", {
    total: transformedMessages.length,
    with_reply: transformedMessages.filter((m) => m.replyTo).length,
  });

  res.status(200).json({
    status: "success",
    results: transformedMessages.length,
    pagination: { page, limit },
    data: transformedMessages,
  });
});

// Hàm format message time
const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "";
  }
};

/*
|--------------------------------------------------------------------------
| CREATE ROOM - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// POST /users/room/create
// SỬA HÀM createRoom
exports.createRoom = catchAsync(async (req, res) => {
  const { name, memberKeycloakIds, isGroup = false, topic } = req.body;
  const currentUserKeycloakId = req.user?.keycloakId; // Lấy keycloakId từ token

  console.log("🏗️ Creating room:", {
    name,
    memberKeycloakIds,
    isGroup,
    currentUser: currentUserKeycloakId,
  });

  // VALIDATION
  if (!memberKeycloakIds || !Array.isArray(memberKeycloakIds)) {
    return res.status(400).json({
      status: "error",
      message: "memberKeycloakIds (array) is required",
    });
  }

  // THÊM current user vào members nếu chưa có
  const allMembers = [
    ...new Set([...memberKeycloakIds, currentUserKeycloakId]),
  ];

  console.log("👥 All members for room:", allMembers);

  // TẠO ROOM MỚI - TRỰC TIẾP VỚI KEYCLOAKID
  const newRoom = await Room.create({
    name: name || null,
    isGroup: isGroup,
    members: allMembers, // Lưu trực tiếp keycloakIds
    createdBy: currentUserKeycloakId,
    topic: topic || null,
  });

  console.log("✅ Room created successfully:", {
    roomId: newRoom._id,
    name: newRoom.name,
    members: newRoom.members,
    isGroup: newRoom.isGroup,
  });

  res.status(201).json({
    status: "success",
    message: "Room created successfully",
    data: newRoom,
  });
});

// POST users/room/creatGroup
exports.createGroup = catchAsync(async (req, res) => {
  try {
    const { name, members, topic } = req.body;
    const createdBy = req.user?.keycloakId;

    console.log("📦 Creating new group:", { name, members, createdBy });

    // VALIDATION
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({
        status: "error",
        message: "Group name and members array are required",
      });
    }

    if (members.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Group must have at least 2 members",
      });
    }

    // THÊM createdBy vào members nếu chưa có
    const allMembers = [...new Set([...members, createdBy])];

    // KIỂM TRA USERS TỒN TẠI
    const existingUsers = await User.find({
      keycloakId: { $in: allMembers },
    }).select("keycloakId");

    const existingUserIds = existingUsers.map((user) => user.keycloakId);
    const nonExistingUsers = allMembers.filter(
      (member) => !existingUserIds.includes(member)
    );

    if (nonExistingUsers.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Some users not found: ${nonExistingUsers.join(", ")}`,
      });
    }

    // TẠO GROUP MỚI
    const newGroup = await Room.create({
      name: name.trim(),
      isGroup: true,
      members: allMembers, // Lưu keycloakIds
      createdBy: createdBy,
      topic: topic || null,
    });

    console.log("✅ Group created successfully:", newGroup._id);

    // POPULATE THÔNG TIN ĐẦY ĐỦ ĐỂ TRẢ VỀ
    const populatedGroup = await Room.findById(newGroup._id)
      .populate({
        path: "members",
        select: "keycloakId username firstName lastName avatar status",
        match: { keycloakId: { $in: allMembers } },
      })
      .populate({
        path: "createdBy",
        select: "keycloakId username firstName lastName avatar",
        match: { keycloakId: createdBy },
      });

    res.status(201).json({
      status: "success",
      message: "Group created successfully",
      data: populatedGroup,
    });
  } catch (error) {
    console.error("❌ Error creating group:", error);

    // XỬ LÝ LỖI DUPLICATE
    if (error.code === 11000) {
      return res.status(400).json({
        status: "error",
        message: "Group name already exists",
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create group",
    });
  }
});

exports.createPrivateRoom = exports.createRoom;

/*
|--------------------------------------------------------------------------
| SEND MESSAGE - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// POST /users/message/send
exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content, type = "text", replyTo } = req.body;

  console.log("📨 Sending message:", { roomId, content, type, replyTo });

  const user = await getUserFromToken(req);
  if (!user) return res.status(403).json({ message: "Invalid token user" });

  // Kiểm tra room tồn tại và user có quyền truy cập
  const room = await Room.findOne({ _id: roomId, members: user._id });
  if (!room) return res.status(403).json({ message: "Access denied" });

  // Tạo message mới
  const message = await Message.create({
    sender: user._id,
    room: roomId,
    content,
    type,
    replyTo: replyTo || null,
  });

  console.log("✅ Message created:", message._id);

  // Cập nhật lastMessage cho room
  await Room.findByIdAndUpdate(roomId, {
    lastMessage: message._id,
    updatedAt: new Date(),
  });

  // Populate sender info để trả về frontend
  const populatedMessage = await Message.findById(message._id)
    .populate("sender", "keycloakId username firstName lastName avatar")
    .populate("replyTo");

  console.log("✅ Populated message:", populatedMessage);

  res.status(200).json({
    status: "success",
    data: populatedMessage,
  });
});

/*
|--------------------------------------------------------------------------
| FRIENDS - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

// 🆕 THÊM: Lấy danh sách bạn bè của user

exports.getFriends = catchAsync(async (req, res) => {
  try {
    const { keycloakId } = req.body;

    console.log("🔍 Fetching friends for user:", keycloakId);

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId is required in request body",
      });
    }

    // TÌM USER DỰA TRÊN KEYCLOAKID
    const user = await User.findOne({ keycloakId });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    console.log(`🔍 User friends array:`, user.friends);

    // LẤY THÔNG TIN CHI TIẾT CỦA BẠN BÈ
    let friendsDetails = [];

    if (user.friends && user.friends.length > 0) {
      friendsDetails = await User.find({
        keycloakId: { $in: user.friends },
      }).select("keycloakId username fullName email avatar status lastSeen");

      console.log(`🔍 Found friends details:`, friendsDetails);
    }

    console.log(
      `✅ Found ${friendsDetails.length} friends for user: ${keycloakId}`
    );

    res.status(200).json({
      status: "success",
      results: friendsDetails.length,
      data: friendsDetails,
    });
  } catch (error) {
    console.error("❌ Error fetching friends:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch friends",
    });
  }
});

exports.getNonFriendUsers = catchAsync(async (req, res) => {
  try {
    console.log("🔍 Fetching non-friend users...");

    const currentUserId = req.user?.keycloakId;

    if (!currentUserId) {
      return res.status(401).json({
        status: "error",
        message: "User not authenticated",
      });
    }

    const currentUser = await User.findOne({ keycloakId: currentUserId });
    if (!currentUser) {
      return res.status(404).json({
        status: "error",
        message: "Current user not found",
      });
    }

    console.log("🔍 Current user friends:", currentUser.friends);

    // Tìm tất cả friend requests liên quan đến user hiện tại
    const pendingRequests = await FriendRequest.find({
      $or: [
        { sender: currentUserId, status: "Pending" },
        { recipient: currentUserId, status: "Pending" },
      ],
    });

    // Tạo Set của các keycloakId cần loại trừ
    const excludedKeys = new Set();
    excludedKeys.add(currentUserId); // Loại trừ chính mình

    // Thêm bạn bè
    currentUser.friends.forEach((friendKey) => {
      excludedKeys.add(friendKey);
    });

    // Thêm users có pending requests
    pendingRequests.forEach((request) => {
      if (request.sender !== currentUserId) {
        excludedKeys.add(request.sender);
      }
      if (request.recipient !== currentUserId) {
        excludedKeys.add(request.recipient);
      }
    });

    console.log("🚫 Excluded users:", Array.from(excludedKeys));

    // Tìm users không bị loại trừ
    const users = await User.find({
      keycloakId: { $nin: Array.from(excludedKeys) },
    })
      .select(
        "keycloakId username firstName lastName email avatar status lastSeen"
      )
      .sort({ firstName: 1, lastName: 1 });

    console.log(`✅ Found ${users.length} non-friend users`);

    res.status(200).json({
      status: "success",
      results: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching non-friend users:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch non-friend users",
    });
  }
});

exports.getFriendRequests = catchAsync(async (req, res) => {
  try {
    const { keycloakId } = req.body;

    console.log("🔍 Fetching friend requests for user:", keycloakId);

    // VALIDATION
    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "keycloakId is required in request body",
      });
    }

    // TÌM USER DỰA TRÊN KEYCLOAKID
    const user = await User.findOne({ keycloakId });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // LẤY DANH SÁCH FRIEND REQUESTS - cả gửi và nhận
    const friendRequests = await FriendRequest.find({
      $or: [
        { recipient: keycloakId, status: "Pending" }, // Requests nhận được
        { sender: keycloakId, status: "Pending" }, // Requests đã gửi
      ],
    }).sort({ createdAt: -1 });

    console.log(`🔍 Found ${friendRequests.length} raw friend requests`);

    // Lấy thông tin chi tiết của sender và recipient
    const formattedRequests = await Promise.all(
      friendRequests.map(async (request) => {
        const [senderInfo, recipientInfo] = await Promise.all([
          User.findOne({ keycloakId: request.sender }).select(
            "keycloakId username fullName email avatar status"
          ),
          User.findOne({ keycloakId: request.recipient }).select(
            "keycloakId username fullName email avatar status"
          ),
        ]);

        return {
          _id: request._id,
          sender: senderInfo,
          recipient: recipientInfo,
          status: request.status,
          createdAt: request.createdAt,
          respondedAt: request.respondedAt,
          // Thêm trường để phân biệt loại request
          requestType: request.sender === keycloakId ? "sent" : "received",
        };
      })
    );

    console.log(
      `✅ Found ${formattedRequests.length} friend requests for user: ${keycloakId}`
    );

    res.status(200).json({
      status: "success",
      results: formattedRequests.length,
      data: formattedRequests,
    });
  } catch (error) {
    console.error("❌ Error fetching friend requests:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch friend requests",
    });
  }
});

exports.sendFriendRequest = catchAsync(async (req, res) => {
  try {
    const { senderKeycloakId, recipientKeycloakId } = req.body;

    console.log("📨 Sending friend request:", {
      senderKeycloakId,
      recipientKeycloakId,
    });

    // VALIDATION
    if (!senderKeycloakId || !recipientKeycloakId) {
      return res.status(400).json({
        status: "error",
        message: "senderKeycloakId and recipientKeycloakId are required",
      });
    }

    if (senderKeycloakId === recipientKeycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Cannot send friend request to yourself",
      });
    }

    // TÌM USERS
    const [sender, recipient] = await Promise.all([
      User.findOne({ keycloakId: senderKeycloakId }),
      User.findOne({ keycloakId: recipientKeycloakId }),
    ]);

    if (!sender || !recipient) {
      return res.status(404).json({
        status: "error",
        message: "Sender or recipient not found",
      });
    }

    // KIỂM TRA ĐÃ LÀ BẠN CHƯA
    if (sender.friends.includes(recipient.keycloakId)) {
      return res.status(400).json({
        status: "error",
        message: "Already friends with this user",
      });
    }

    // KIỂM TRA ĐÃ GỬI REQUEST CHƯA
    const existingRequest = await FriendRequest.findOne({
      $or: [
        {
          sender: senderKeycloakId,
          recipient: recipientKeycloakId,
          status: "Pending",
        },
        {
          sender: recipientKeycloakId,
          recipient: senderKeycloakId,
          status: "Pending",
        },
      ],
    });

    if (existingRequest) {
      return res.status(400).json({
        status: "error",
        message: "Friend request already exists",
      });
    }

    // TẠO FRIEND REQUEST
    const friendRequest = await FriendRequest.create({
      sender: senderKeycloakId,
      recipient: recipientKeycloakId,
      status: "Pending",
    });

    // LẤY THÔNG TIN ĐẦY ĐỦ ĐỂ TRẢ VỀ
    const [senderInfo, recipientInfo] = await Promise.all([
      User.findOne({ keycloakId: senderKeycloakId }).select(
        "keycloakId username fullName avatar"
      ),
      User.findOne({ keycloakId: recipientKeycloakId }).select(
        "keycloakId username fullName avatar"
      ),
    ]);

    const populatedRequest = {
      _id: friendRequest._id,
      sender: senderInfo,
      recipient: recipientInfo,
      status: friendRequest.status,
      createdAt: friendRequest.createdAt,
      respondedAt: friendRequest.respondedAt,
    };

    console.log("✅ Friend request sent successfully:", friendRequest._id);

    res.status(201).json({
      status: "success",
      message: "Friend request sent successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("❌ Error sending friend request:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to send friend request",
    });
  }
});

exports.cancelFriendRequest = catchAsync(async (req, res) => {
  try {
    const { senderKeycloakId, recipientKeycloakId } = req.body;

    console.log("🗑️ Canceling friend request:", {
      senderKeycloakId,
      recipientKeycloakId,
    });

    // VALIDATION
    if (!senderKeycloakId || !recipientKeycloakId) {
      return res.status(400).json({
        status: "error",
        message: "senderKeycloakId and recipientKeycloakId are required",
      });
    }

    // TÌM VÀ XÓA FRIEND REQUEST
    const friendRequest = await FriendRequest.findOneAndDelete({
      sender: senderKeycloakId,
      recipient: recipientKeycloakId,
      status: "Pending",
    });

    if (!friendRequest) {
      return res.status(404).json({
        status: "error",
        message: "Friend request not found or already processed",
      });
    }

    console.log("✅ Friend request canceled successfully");

    res.status(200).json({
      status: "success",
      message: "Friend request canceled successfully",
    });
  } catch (error) {
    console.error("❌ Error canceling friend request:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to cancel friend request",
    });
  }
});

exports.respondToFriendRequest = catchAsync(async (req, res) => {
  try {
    const { requestId, keycloakId, action } = req.body; // action: 'accept' or 'reject'

    console.log("📨 Responding to friend request:", {
      requestId,
      keycloakId,
      action,
    });

    // VALIDATION
    if (!requestId || !keycloakId || !action) {
      return res.status(400).json({
        status: "error",
        message: "requestId, keycloakId, and action are required",
      });
    }

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        status: "error",
        message: "Action must be either 'accept' or 'reject'",
      });
    }

    // TÌM FRIEND REQUEST
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({
        status: "error",
        message: "Friend request not found",
      });
    }

    // KIỂM TRA QUYỀN (chỉ recipient mới có thể respond)
    if (friendRequest.recipient !== keycloakId) {
      return res.status(403).json({
        status: "error",
        message: "Only the recipient can respond to this friend request",
      });
    }

    if (friendRequest.status !== "Pending") {
      return res.status(400).json({
        status: "error",
        message: "Friend request already processed",
      });
    }

    // TÌM USERS
    const [sender, recipient] = await Promise.all([
      User.findOne({ keycloakId: friendRequest.sender }),
      User.findOne({ keycloakId: friendRequest.recipient }),
    ]);

    if (!sender || !recipient) {
      return res.status(404).json({
        status: "error",
        message: "Sender or recipient not found",
      });
    }

    if (action === "accept") {
      // THÊM VÀO DANH SÁCH BẠN BÈ
      await Promise.all([
        User.findOneAndUpdate(
          { keycloakId: friendRequest.sender },
          { $addToSet: { friends: friendRequest.recipient } }
        ),
        User.findOneAndUpdate(
          { keycloakId: friendRequest.recipient },
          { $addToSet: { friends: friendRequest.sender } }
        ),
      ]);

      // CẬP NHẬT STATUS FRIEND REQUEST
      friendRequest.status = "Accepted";
      friendRequest.respondedAt = new Date();
      await friendRequest.save();

      console.log("✅ Friend request accepted");

      // LẤY THÔNG TIN ĐẦY ĐỦ ĐỂ TRẢ VỀ
      const [senderInfo, recipientInfo] = await Promise.all([
        User.findOne({ keycloakId: friendRequest.sender }).select(
          "keycloakId username fullName avatar"
        ),
        User.findOne({ keycloakId: friendRequest.recipient }).select(
          "keycloakId username fullName avatar"
        ),
      ]);

      const populatedRequest = {
        _id: friendRequest._id,
        sender: senderInfo,
        recipient: recipientInfo,
        status: friendRequest.status,
        createdAt: friendRequest.createdAt,
        respondedAt: friendRequest.respondedAt,
      };

      res.status(200).json({
        status: "success",
        message: "Friend request accepted",
        data: populatedRequest,
      });
    } else if (action === "reject") {
      // CẬP NHẬT STATUS FRIEND REQUEST
      friendRequest.status = "Rejected";
      friendRequest.respondedAt = new Date();
      await friendRequest.save();

      console.log("❌ Friend request rejected");

      // LẤY THÔNG TIN ĐẦY ĐỦ ĐỂ TRẢ VỀ
      const [senderInfo, recipientInfo] = await Promise.all([
        User.findOne({ keycloakId: friendRequest.sender }).select(
          "keycloakId username fullName avatar"
        ),
        User.findOne({ keycloakId: friendRequest.recipient }).select(
          "keycloakId username fullName avatar"
        ),
      ]);

      const populatedRequest = {
        _id: friendRequest._id,
        sender: senderInfo,
        recipient: recipientInfo,
        status: friendRequest.status,
        createdAt: friendRequest.createdAt,
        respondedAt: friendRequest.respondedAt,
      };

      res.status(200).json({
        status: "success",
        message: "Friend request rejected",
        data: populatedRequest,
      });
    }
  } catch (error) {
    console.error("❌ Error responding to friend request:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to respond to friend request",
    });
  }
});

/*
|--------------------------------------------------------------------------
| CALL MANAGEMENT - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

exports.createCall = catchAsync(async (req, res) => {
  const { type, roomId, participants } = req.body;

  if (!["audio", "video"].includes(type))
    return res.status(400).json({ message: "Invalid call type" });

  const call = await Call.create({ type, room: roomId, participants });

  res.status(201).json({ status: "success", data: call });
});

exports.endCall = catchAsync(async (req, res) => {
  const { callId } = req.body;

  const call = await Call.findByIdAndUpdate(
    callId,
    { status: "Ended", endedAt: new Date() },
    { new: true }
  );

  if (!call) return res.status(404).json({ message: "Call not found" });

  res.status(200).json({ status: "success", data: call });
});

exports.getCallHistory = catchAsync(async (req, res) => {
  const { keycloakId } = req.user;

  console.log("📞 Fetching call history for user:", keycloakId);

  const calls = await Call.find({ participants: keycloakId })
    .populate("room", "name")
    .sort({ startedAt: -1 })
    .lean();

  // Lấy thông tin user cho tất cả participants
  const allParticipantIds = [
    ...new Set(calls.flatMap((call) => call.participants)),
  ];

  const users = await User.find({
    keycloakId: { $in: allParticipantIds },
  }).select("keycloakId username fullName avatar status");

  const userMap = users.reduce((map, user) => {
    map[user.keycloakId] = user;
    return map;
  }, {});

  // Map participants với user info
  const callsWithUserDetails = calls.map((call) => ({
    ...call,
    participantsDetails: call.participants.map(
      (participantId) =>
        userMap[participantId] || {
          keycloakId: participantId,
          username: "Unknown User",
          fullName: "Unknown User",
          avatar: null,
          status: "Offline",
        }
    ),
  }));

  res.status(200).json({
    status: "success",
    data: callsWithUserDetails,
  });
});

/*
|--------------------------------------------------------------------------
| GET ALL ROOMS FOR USER (DIRECT + GROUP) - GIỮ NGUYÊN
|--------------------------------------------------------------------------
*/

exports.getUserRooms = catchAsync(async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const rooms = await Room.find({ members: user._id })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate("createdBy", "keycloakId username avatar")
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    })
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json({ status: "success", results: rooms.length, data: rooms });
});

// 🆕 THÊM: Socket events cho pin/unpin messages - SỬA LẠI NHẬN DATA TỪ BODY
// 🆕 SỬA: Hàm checkUserAccess hỗ trợ cả direct và group chat
// 🆕 SỬA: Hàm checkUserAccess - NHẬN KEYCLOAKID TỪ PARAMETER
const checkUserAccess = async (keycloakId, roomId) => {
  try {
    console.log("🔍 Checking user access:", { keycloakId, roomId });

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      console.log(`❌ Invalid roomId: ${roomId}`);
      return false;
    }

    // FIX: Tìm kiếm trong cả Room và OneToOneMessage
    let room = await Room.findById(roomId);
    let isOneToOneMessage = false;

    if (!room) {
      // Nếu không tìm thấy trong Room, thử tìm trong OneToOneMessage
      room = await OneToOneMessage.findById(roomId);
      if (room) {
        isOneToOneMessage = true;
      }
    } else {
      console.log(`✅ Found in Room: ${roomId}`);
    }

    if (!room) {
      console.log(`❌ Room/OneToOneMessage not found: ${roomId}`);
      return false;
    }

    const user = await User.findOne({ keycloakId });
    if (!user) {
      console.log(`❌ User not found with keycloakId: ${keycloakId}`);
      return false;
    }

    // FIX: Logic kiểm tra quyền truy cập cho cả hai loại
    if (isOneToOneMessage) {
      // OneToOneMessage: participants chứa keycloakId (string)
      const hasAccess =
        room.participants && room.participants.includes(keycloakId);
      console.log(`🔍 OneToOneMessage access check: ${hasAccess}`, {
        roomId,
        keycloakId,
        participants: room.participants,
        userInParticipants: room.participants?.includes(keycloakId),
      });
      return hasAccess;
    } else {
      // Room collection
      if (room.isGroup) {
        // Group chat: members chứa keycloakId (string)
        const hasAccess = room.members && room.members.includes(keycloakId);
        console.log(`🔍 Group room access check: ${hasAccess}`, {
          roomId,
          keycloakId,
          members: room.members,
        });
        return hasAccess;
      } else {
        // Direct chat trong Room collection: members chứa userId (ObjectId)
        const hasAccess =
          room.members &&
          room.members.some(
            (member) => member.toString() === user._id.toString()
          );
        console.log(`🔍 Direct room access check: ${hasAccess}`, {
          roomId,
          userId: user._id,
          members: room.members,
        });
        return hasAccess;
      }
    }
  } catch (error) {
    console.error("❌ Error in checkUserAccess:", error);
    return false;
  }
};

// 🆕 SỬA: Hàm handlePinMessage - PHÂN BIỆT DIRECT VÀ GROUP
// 🆕 HOÀN THIỆN: Hàm handlePinMessage với real-time updates
// 🆕 SỬA: handlePinMessage cho schema embedded sender
exports.handlePinMessage = catchAsync(async (socket, data) => {
  const { messageId, roomId } = data;
  const keycloakId = socket.userId;

  console.log("📌 Pin message request:", { messageId, roomId, keycloakId });

  if (!messageId) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Message ID is required",
    });
  }

  // SỬA: Không cần populate vì sender là embedded object
  const message = await Message.findById(messageId);

  if (!message) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Message not found",
    });
  }

  // DEBUG: Kiểm tra thông tin sender trong message
  console.log("🔍 Message sender debug:", {
    messageId: message._id,
    sender: message.sender,
    hasSender: !!message.sender,
    senderId: message.sender?.id,
    senderName: message.sender?.name,
  });

  // Xác định roomId thực tế từ message
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // Kiểm tra số lượng tin nhắn được pin
  const pinnedCount = await Message.countDocuments({
    room: actualRoomId,
    isPinned: true,
  });

  if (pinnedCount >= 5) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Maximum 5 pinned messages allowed",
    });
  }

  // SỬA: Cập nhật message - KHÔNG cần populate
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: true,
      pinnedAt: new Date(),
      pinnedBy: keycloakId,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // DEBUG: Kiểm tra message sau khi update
  console.log("🔍 Updated message debug:", {
    messageId: updatedMessage._id,
    isPinned: updatedMessage.isPinned,
    pinnedAt: updatedMessage.pinnedAt,
    pinnedBy: updatedMessage.pinnedBy,
    sender: updatedMessage.sender,
  });

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // SỬA: Lấy danh sách pinned messages - KHÔNG cần populate
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // DEBUG: Kiểm tra dữ liệu pinned messages
  console.log("🔍 Pinned messages debug:", {
    count: pinnedMessages.length,
    messages: pinnedMessages.map((msg) => ({
      id: msg._id,
      sender: msg.sender,
      senderId: msg.sender?.id,
      senderName: msg.sender?.name,
      content: msg.content,
      pinnedAt: msg.pinnedAt,
    })),
  });

  // Gửi event đến tất cả users trong room
  socket.to(actualRoomId).emit("message_pinned", {
    messageId: messageId,
    chatType: chatType,
    roomId: actualRoomId,
    pinnedAt: updatedMessage.pinnedAt,
    pinnedBy: keycloakId,
    pinnedMessages: pinnedMessages, // GỬI DANH SÁCH ĐẦY ĐỦ
  });

  // BROADCAST: Cập nhật danh sách pinned messages
  socket.to(actualRoomId).emit("pinned_messages_updated", {
    roomId: actualRoomId,
    chatType: chatType,
    pinnedMessages: pinnedMessages,
    action: "pin",
    messageId: messageId,
  });

  // Response cho user thực hiện
  socket.emit("pin_message_response", {
    status: "success",
    message: "Message pinned successfully",
    data: {
      messageId: messageId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
    },
  });

  console.log("✅ Message pinned:", {
    messageId,
    chatType,
    roomId: actualRoomId,
    pinnedMessagesCount: pinnedMessages.length,
    senderName: message.sender?.name, // THÊM sender name để debug
  });
});

// 🆕 HOÀN THIỆN: Hàm handleUnpinMessage với real-time updates
// 🆕 SỬA: handleUnpinMessage cho schema embedded sender
exports.handleUnpinMessage = catchAsync(async (socket, data) => {
  const { messageId, roomId } = data;
  const keycloakId = socket.userId;

  console.log("📌 Unpin message request:", { messageId, roomId, keycloakId });

  if (!messageId) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message ID is required",
    });
  }

  // Tìm message để kiểm tra
  const message = await Message.findById(messageId);
  if (!message) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message not found",
    });
  }

  // DEBUG: Kiểm tra sender trước khi unpin
  console.log("🔍 Message to unpin debug:", {
    messageId: message._id,
    sender: message.sender,
    isPinned: message.isPinned,
  });

  // Xác định roomId thực tế từ message
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  if (!message.isPinned) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message is not pinned",
    });
  }

  // SỬA: Cập nhật message
  await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // CẢI THIỆN: Gửi event với đầy đủ thông tin
  socket.to(actualRoomId).emit("message_unpinned", {
    messageId: messageId,
    chatType: chatType,
    roomId: actualRoomId,
    pinnedMessages: pinnedMessages,
  });

  // BROADCAST: Cập nhật danh sách pinned messages cho tất cả clients
  socket.to(actualRoomId).emit("pinned_messages_updated", {
    roomId: actualRoomId,
    chatType: chatType,
    pinnedMessages: pinnedMessages,
    action: "unpin",
    messageId: messageId,
  });

  // Response cho user thực hiện
  socket.emit("unpin_message_response", {
    status: "success",
    message: "Message unpinned successfully",
    data: {
      messageId: messageId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
    },
  });

  console.log("✅ Message unpinned:", {
    messageId,
    chatType,
    roomId: actualRoomId,
    pinnedMessagesCount: pinnedMessages.length,
    senderName: message.sender?.name, // THÊM sender name để debug
  });
});

// 🆕 HOÀN THIỆN: Hàm getPinnedMessages
// 🆕 SỬA: getPinnedMessages cho schema embedded sender
exports.getPinnedMessages = catchAsync(async (req, res) => {
  const { roomId, keycloakId } = req.body;

  if (!roomId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Room ID and User ID are required in request body",
    });
  }

  console.log(
    "📌 Fetching pinned messages for room:",
    roomId,
    "user:",
    keycloakId
  );

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, roomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // SỬA: Lấy pinned messages - KHÔNG cần populate
  const pinnedMessages = await Message.find({
    room: roomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // DEBUG: Log để kiểm tra dữ liệu trả về
  console.log("🔍 API Pinned messages debug:", {
    count: pinnedMessages.length,
    messages: pinnedMessages.map((msg) => ({
      id: msg._id,
      sender: msg.sender,
      senderId: msg.sender?.id,
      senderName: msg.sender?.name,
      content: msg.content,
      pinnedAt: msg.pinnedAt,
    })),
  });

  console.log(
    `✅ Found ${pinnedMessages.length} pinned messages for room ${roomId}`
  );

  res.status(200).json({
    status: "success",
    results: pinnedMessages.length,
    data: pinnedMessages,
  });
});

// 🆕 HOÀN THIỆN: Hàm pinMessage cho HTTP API
// 🆕 SỬA: pinMessage cho HTTP API với schema embedded sender
exports.pinMessage = catchAsync(async (req, res) => {
  const { messageId, roomId, keycloakId } = req.body;

  if (!messageId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Message ID and User ID are required",
    });
  }

  // Tìm message để lấy roomId
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  // DEBUG: Kiểm tra sender trong message gốc
  console.log("🔍 Original message sender:", {
    sender: message.sender,
    senderId: message.sender?.id,
    senderName: message.sender?.name,
  });

  // Xác định roomId thực tế
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // Kiểm tra số lượng tin nhắn được pin
  const pinnedCount = await Message.countDocuments({
    room: actualRoomId,
    isPinned: true,
  });

  if (pinnedCount >= 5) {
    return res.status(400).json({
      status: "error",
      message: "Maximum 5 pinned messages allowed",
    });
  }

  // SỬA: Sử dụng findByIdAndUpdate thay vì save()
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: true,
      pinnedAt: new Date(),
      pinnedBy: keycloakId,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // Gửi socket event
  if (req.app.get("io")) {
    const io = req.app.get("io");

    io.to(actualRoomId).emit("message_pinned", {
      messageId: messageId,
      chatType: chatType,
      roomId: actualRoomId,
      pinnedMessages: pinnedMessages,
    });

    io.to(actualRoomId).emit("pinned_messages_updated", {
      roomId: actualRoomId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
      action: "pin",
      messageId: messageId,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Message pinned successfully",
    data: {
      message: updatedMessage,
      pinnedMessages: pinnedMessages,
    },
  });
});

// 🆕 HOÀN THIỆN: Hàm unpinMessage cho HTTP API
// 🆕 SỬA: unpinMessage cho HTTP API với schema embedded sender
exports.unpinMessage = catchAsync(async (req, res) => {
  const { messageId, roomId, keycloakId } = req.body;

  if (!messageId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Message ID and User ID are required",
    });
  }

  // Tìm message để lấy roomId
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  // Xác định roomId thực tế
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  if (!message.isPinned) {
    return res.status(400).json({
      status: "error",
      message: "Message is not pinned",
    });
  }

  // SỬA: Sử dụng findByIdAndUpdate thay vì save()
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // Gửi socket event
  if (req.app.get("io")) {
    const io = req.app.get("io");

    io.to(actualRoomId).emit("message_unpinned", {
      messageId: messageId,
      chatType: chatType,
      roomId: actualRoomId,
      pinnedMessages: pinnedMessages,
    });

    io.to(actualRoomId).emit("pinned_messages_updated", {
      roomId: actualRoomId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
      action: "unpin",
      messageId: messageId,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Message unpinned successfully",
    data: {
      message: updatedMessage,
      pinnedMessages: pinnedMessages,
    },
  });
});

// =============================================
// 🆕 E2EE ENCRYPTION FUNCTIONS - HOÀN CHỈNH
// =============================================

/*
|--------------------------------------------------------------------------
| E2EE KEY MANAGEMENT - CƠ BẢN
|--------------------------------------------------------------------------
*/
