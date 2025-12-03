// models/call.js - SOCKET.IO AUDIO VERSION (ĐÃ SỬA HOÀN CHỈNH)
const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    // ======================
    // BASIC CALL INFORMATION
    // ======================
    type: {
      type: String,
      enum: ["audio", "video"],
      required: true,
      index: true,
    },

    callType: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      required: true,
      index: true,
    },

    // ======================
    // ROOM AND IDENTIFICATION
    // ======================
    roomID: {
      type: String,
      required: function () {
        return this.callMethod === "socketio";
      },
      default: function () {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${this.type}_room_${timestamp}_${random}`;
      },
      index: true,
    },

    room: {
      type: String,
      default: function () {
        return (
          this.roomID ||
          `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        );
      },
      index: true,
    },

    // ======================
    // CALL METHOD
    // ======================
    callMethod: {
      type: String,
      enum: ["socketio", "zego", "webrtc"],
      default: "socketio",
      index: true,
    },

    // ======================
    // PARTICIPANTS
    // ======================
    participants: [
      {
        type: String, // keycloakId
        required: true,
        index: true,
      },
    ],

    participantDetails: [
      {
        userId: {
          type: String,
          required: true,
          index: true,
        },
        userName: {
          type: String,
        },
        userAvatar: {
          type: String,
        },
        joinedAt: {
          type: Date,
        },
        leftAt: Date,
        duration: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          enum: [
            "invited",
            "joined",
            "declined",
            "missed",
            "left",
            "ringing",
            "cancelled",
          ],
          default: "invited",
        },
        streamID: {
          type: String,
        },
        peerId: {
          type: String,
        },
        webrtc: {
          offer: mongoose.Schema.Types.Mixed,
          answer: mongoose.Schema.Types.Mixed,
          candidates: [mongoose.Schema.Types.Mixed],
        },
      },
    ],

    // ======================
    // CALL MANAGEMENT
    // ======================
    startedBy: {
      type: String,
      required: true,
      index: true,
    },

    endedBy: {
      type: String,
    },

    initiatedTo: {
      type: String,
    },

    // ======================
    // TIMING
    // ======================
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    endedAt: {
      type: Date,
    },

    ringingStartedAt: {
      type: Date,
    },

    answeredAt: {
      type: Date,
    },

    ringingEndedAt: {
      type: Date,
    },

    // ======================
    // STATUS
    // ======================
    status: {
      type: String,
      enum: [
        "initiating",
        "ringing",
        "ongoing",
        "ended",
        "completed",
        "missed",
        "declined",
        "cancelled",
      ],
      default: "initiating",
      index: true,
    },

    // ======================
    // DURATION AND METRICS
    // ======================
    duration: {
      type: Number,
      default: 0,
    },

    ringingDuration: {
      type: Number,
      default: 0,
    },

    maxParticipants: {
      type: Number,
      default: 2,
    },

    // ======================
    // MEDIA STREAMS INFO
    // ======================
    streams: [
      {
        streamID: String,
        userId: String,
        userName: String,
        type: {
          type: String,
          enum: ["audio", "video", "screen"],
        },
        startedAt: Date,
        endedAt: Date,
      },
    ],

    // ======================
    // CALL FEATURES
    // ======================
    isRecorded: {
      type: Boolean,
      default: false,
    },

    recordingUrl: {
      type: String,
    },

    hasScreenShare: {
      type: Boolean,
      default: false,
    },

    // ======================
    // METADATA
    // ======================
    callTitle: {
      type: String,
      default: function () {
        if (this.callType === "direct") {
          return `Direct ${this.type === "audio" ? "Audio" : "Video"} Call`;
        }
        return `Group ${this.type === "audio" ? "Audio" : "Video"} Call`;
      },
    },

    callCategory: {
      type: String,
      enum: ["personal", "business", "support", "other"],
      default: "personal",
    },

    tags: [String],

    // ======================
    // ERROR HANDLING
    // ======================
    errorCode: {
      type: String,
    },

    errorMessage: {
      type: String,
    },

    // ======================
    // ANALYTICS
    // ======================
    userAgent: String,
    ipAddress: String,
    deviceInfo: {
      os: String,
      browser: String,
      isMobile: Boolean,
    },

    // ======================
    // SOCKET.IO SPECIFIC
    // ======================
    socketioRoom: {
      type: String,
      default: function () {
        const room = this.roomID || this.room || `call_${Date.now()}`;
        return `call_${room}`;
      },
    },

    webrtcConfig: {
      stunServers: [String],
      turnServers: [
        {
          urls: String,
          username: String,
          credential: String,
        },
      ],
    },

    webrtcSignaling: {
      offers: [mongoose.Schema.Types.Mixed],
      answers: [mongoose.Schema.Types.Mixed],
      iceCandidates: [mongoose.Schema.Types.Mixed],
    },
  },
  {
    timestamps: true,
    strictPopulate: false,
  }
);

// ======================
// INDEXES
// ======================
callSchema.index({ participants: 1, createdAt: -1 });
callSchema.index({ startedBy: 1, createdAt: -1 });
callSchema.index({ roomID: 1 });
callSchema.index({ room: 1 });
callSchema.index({ status: 1, startedAt: -1 });
callSchema.index({ "participantDetails.userId": 1 });
callSchema.index({ type: 1, startedAt: -1 });
callSchema.index({ callType: 1, startedAt: -1 });
callSchema.index({ callMethod: 1 });
callSchema.index({ socketioRoom: 1 });

// ======================
// VIRTUAL FIELDS
// ======================
callSchema.virtual("calculatedDuration").get(function () {
  if (this.endedAt && this.startedAt) {
    return Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return 0;
});

callSchema.virtual("participantCount").get(function () {
  return this.participants.length;
});

callSchema.virtual("starterInfo", {
  ref: "User",
  localField: "startedBy",
  foreignField: "keycloakId",
  justOne: true,
});

callSchema.virtual("participantInfos", {
  ref: "User",
  localField: "participants",
  foreignField: "keycloakId",
  justOne: false,
});

callSchema.virtual("activeParticipants").get(function () {
  return this.participantDetails
    .filter((p) => p.status === "joined" || p.status === "ringing")
    .map((p) => p.userId);
});

callSchema.virtual("isActive").get(function () {
  return this.status === "ringing" || this.status === "ongoing";
});

// ======================
// METHODS - ĐÃ SỬA HOÀN CHỈNH
// ======================

/**
 * Add participant to call - KHÔNG gọi save() ở đây
 */
callSchema.methods.addParticipant = function (
  userId,
  status = "invited",
  userInfo = {}
) {
  const existingParticipant = this.participantDetails.find(
    (p) => p.userId === userId
  );

  if (!existingParticipant) {
    this.participantDetails.push({
      userId,
      userName:
        userInfo.userName || userInfo.username || userInfo.fullName || "User",
      userAvatar: userInfo.avatar || "",
      status,
      joinedAt: status === "joined" ? new Date() : undefined,
      streamID:
        userInfo.streamID || `stream-${this.roomID || this.room}-${userId}`,
      peerId: userInfo.peerId,
    });
  }

  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }

  // ❌ KHÔNG gọi save() ở đây - để caller tự save
  return this;
};

/**
 * Update participant status - KHÔNG gọi save()
 */
callSchema.methods.updateParticipantStatus = function (userId, status) {
  const participant = this.participantDetails.find((p) => p.userId === userId);

  if (participant) {
    const oldStatus = participant.status;
    participant.status = status;

    if (status === "joined" && !participant.joinedAt) {
      participant.joinedAt = new Date();
    } else if (status === "left" && !participant.leftAt) {
      participant.leftAt = new Date();
      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (new Date() - participant.joinedAt) / 1000
        );
      }
    } else if (status === "ringing" && oldStatus !== "ringing") {
      if (!this.ringingStartedAt) {
        this.ringingStartedAt = new Date();
      }
    }
  }

  // ❌ KHÔNG gọi save() ở đây - để caller tự save
  return this;
};

/**
 * Update participant stream info - KHÔNG gọi save()
 */
callSchema.methods.updateParticipantStream = function (userId, streamID) {
  const participant = this.participantDetails.find((p) => p.userId === userId);

  if (participant) {
    participant.streamID =
      streamID || `stream-${this.roomID || this.room}-${userId}`;
  }

  const existingStream = this.streams.find(
    (s) => s.userId === userId && s.endedAt === undefined
  );

  if (!existingStream) {
    this.streams.push({
      streamID: streamID || `stream-${this.roomID || this.room}-${userId}`,
      userId,
      userName: participant?.userName || "User",
      type: this.type,
      startedAt: new Date(),
    });
  }

  // ❌ KHÔNG gọi save() ở đây - để caller tự save
  return this;
};

/**
 * Accept call - CHỈ gọi save() 1 lần
 */
callSchema.methods.acceptCall = function (userId) {
  console.log(`📞 Accepting call ${this._id} by user ${userId}`);

  // Update call status
  this.status = "ongoing";
  this.answeredAt = new Date();
  this.ringingEndedAt = new Date();

  // Tính ringing duration
  if (this.ringingStartedAt) {
    this.ringingDuration = Math.floor(
      (new Date() - this.ringingStartedAt) / 1000
    );
  }

  // Update participant status TRỰC TIẾP (không qua updateParticipantStatus)
  const participant = this.participantDetails.find((p) => p.userId === userId);
  if (participant) {
    participant.status = "joined";
    if (!participant.joinedAt) {
      participant.joinedAt = new Date();
    }
    console.log(`   Participant ${userId} status updated to: joined`);
  }

  console.log(`   Call ${this._id} status updated to: ${this.status}`);

  // ✅ CHỈ save() 1 lần duy nhất
  return this.save();
};

/**
 * Decline call - CHỈ gọi save() 1 lần
 */
callSchema.methods.declineCall = function (userId) {
  console.log(`📞 Declining call ${this._id} by user ${userId}`);

  this.status = "declined";
  this.endedAt = new Date();
  this.ringingEndedAt = new Date();

  // Update participant status TRỰC TIẾP
  const participant = this.participantDetails.find((p) => p.userId === userId);
  if (participant) {
    participant.status = "declined";
  }

  console.log(`   Call ${this._id} status updated to: ${this.status}`);

  // ✅ CHỈ save() 1 lần
  return this.save();
};

/**
 * End call - CHỈ gọi save() 1 lần
 */
callSchema.methods.endCall = function (endedByUserId) {
  console.log(`📴 Ending call ${this._id} by user ${endedByUserId}`);

  this.status = "ended";
  this.endedAt = new Date();
  this.endedBy = endedByUserId;

  // Tính duration
  if (this.startedAt) {
    this.duration = Math.floor((new Date() - this.startedAt) / 1000);
  }

  // Update all participants status TRỰC TIẾP
  this.participantDetails.forEach((participant) => {
    if (participant.status === "joined" || participant.status === "ringing") {
      participant.status = "left";
      participant.leftAt = new Date();

      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (new Date() - participant.joinedAt) / 1000
        );
      }
    }
  });

  console.log(
    `   Call ${this._id} ended, status: ${this.status}, duration: ${this.duration}s`
  );

  // ✅ CHỈ save() 1 lần
  return this.save();
};

/**
 * Cancel call - CHỈ gọi save() 1 lần
 */
callSchema.methods.cancelCall = function (cancelledByUserId) {
  console.log(`❌ Cancelling call ${this._id} by user ${cancelledByUserId}`);

  this.status = "cancelled";
  this.endedAt = new Date();
  this.endedBy = cancelledByUserId;

  // Update participant statuses TRỰC TIẾP
  this.participantDetails.forEach((participant) => {
    if (participant.status === "ringing") {
      participant.status = "cancelled";
    }
  });

  console.log(`   Call ${this._id} cancelled, status: ${this.status}`);

  // ✅ CHỈ save() 1 lần
  return this.save();
};

/**
 * Miss call - CHỈ gọi save() 1 lần
 */
callSchema.methods.missCall = function () {
  console.log(`⏰ Marking call ${this._id} as missed`);

  this.status = "missed";
  this.endedAt = new Date();
  this.ringingEndedAt = new Date();

  // Tính ringing duration
  if (this.ringingStartedAt) {
    this.ringingDuration = Math.floor(
      (new Date() - this.ringingStartedAt) / 1000
    );
  }

  // Update all ringing participants to missed TRỰC TIẾP
  this.participantDetails.forEach((participant) => {
    if (participant.status === "ringing") {
      participant.status = "missed";
    }
  });

  console.log(`   Call ${this._id} marked as missed, status: ${this.status}`);

  // ✅ CHỈ save() 1 lần
  return this.save();
};

// 🆕 THÊM: Helper method để lưu với retry logic
callSchema.methods.saveWithRetry = async function (maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`💾 Attempting to save call ${this._id} (attempt ${i + 1})`);
      const result = await this.save();
      console.log(`✅ Call ${this._id} saved successfully`);
      return result;
    } catch (error) {
      if (
        error.message.includes("save() the same doc multiple times") &&
        i < maxRetries - 1
      ) {
        console.log(
          `⚠️  Race condition detected, retrying... (${i + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      } else {
        throw error;
      }
    }
  }
};

// ======================
// MIDDLEWARE
// ======================
callSchema.pre("save", function (next) {
  // Calculate ringing duration
  if (this.ringingStartedAt && this.ringingEndedAt) {
    this.ringingDuration = Math.floor(
      (this.ringingEndedAt - this.ringingStartedAt) / 1000
    );
  }

  // Auto-calculate duration
  if (this.endedAt && this.startedAt && !this.duration) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }

  // Set call title for group calls
  if (this.callType === "group" && !this.callTitle) {
    const method = this.callMethod === "socketio" ? "Socket.IO" : "WebRTC";
    this.callTitle = `Group ${
      this.type === "audio" ? "Audio" : "Video"
    } Call (${method})`;
  }

  // Set socketioRoom
  if (!this.socketioRoom || this.socketioRoom === "call_undefined") {
    const room = this.roomID || this.room || `call_${Date.now()}`;
    this.socketioRoom = `call_${room}`;
  }

  // Ensure room and roomID always have values
  if (!this.roomID && this.room) {
    this.roomID = this.room;
  }

  if (!this.room && this.roomID) {
    this.room = this.roomID;
  }

  if (!this.room && !this.roomID) {
    const generatedRoom = `${this.type}_room_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;
    this.roomID = generatedRoom;
    this.room = generatedRoom;
  }

  next();
});

// Log after save
callSchema.post("save", function (doc) {
  console.log(
    `📝 Call saved: ${doc._id}, status: ${doc.status}, roomID: ${doc.roomID}`
  );
});

// ======================
// STATIC METHODS
// ======================

/**
 * Find active call between two users
 */
callSchema.statics.findActiveCallBetweenUsers = function (user1Id, user2Id) {
  // Chỉ tìm call với status thực sự active
  return this.findOne({
    participants: { $all: [user1Id, user2Id] },
    status: {
      $in: [
        "ringing", // Đang đổ chuông
        "ongoing", // Đang diễn ra
        "initiating", // Đang khởi tạo
      ],
    },
    callType: "direct",
    // Thêm điều kiện thời gian: chỉ tìm call trong vòng 10 phút gần đây
    $or: [
      { ringingStartedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
      { startedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
      { createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
    ],
  }).sort({ createdAt: -1 });
};

/**
 * Create a new direct call
 */
callSchema.statics.createDirectCall = async function (data) {
  const { from, to, type = "audio", roomID, callMethod = "socketio" } = data;

  const finalRoomID =
    roomID ||
    `${type}_room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const callData = {
    type,
    callType: "direct",
    roomID: finalRoomID,
    room: finalRoomID,
    callMethod,
    participants: [from, to],
    startedBy: from,
    initiatedTo: to,
    status: "ringing",
    ringingStartedAt: new Date(),
    maxParticipants: 2,
    callTitle: `Direct ${type === "audio" ? "Audio" : "Video"} Call`,
  };

  const call = await this.create(callData);

  const User = mongoose.model("User");
  const [fromUser, toUser] = await Promise.all([
    User.findOne({ keycloakId: from }),
    User.findOne({ keycloakId: to }),
  ]);

  // Add participants (không save ở đây, để save() ở create)
  call.addParticipant(from, "joined", {
    userName: fromUser?.username || fromUser?.fullName || "Caller",
    avatar: fromUser?.avatar || "",
  });

  call.addParticipant(to, "ringing", {
    userName: toUser?.username || toUser?.fullName || "Recipient",
    avatar: toUser?.avatar || "",
  });

  // Save sau khi đã add tất cả participants
  await call.save();

  return call;
};

// Đảm bảo virtual fields được include
callSchema.set("toObject", { virtuals: true });
callSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Call", callSchema);
