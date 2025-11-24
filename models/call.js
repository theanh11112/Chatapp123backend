const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    // Basic call information
    type: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },
    callType: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      required: true,
    },

    // Room and identification
    roomID: {
      type: String,
      required: true,
      index: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },

    // Participants
    participants: [
      {
        type: String, // user IDs
        required: true,
      },
    ],
    participantDetails: [
      {
        userId: {
          type: String,
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        leftAt: Date,
        duration: {
          type: Number, // seconds
          default: 0,
        },
        status: {
          type: String,
          enum: ["invited", "joined", "declined", "missed", "left"],
          default: "invited",
        },
      },
    ],

    // Call management
    startedBy: {
      type: String, // user ID
      required: true,
      index: true,
    },
    endedBy: {
      type: String, // user ID
    },
    initiatedTo: {
      type: String, // user ID (for direct calls)
    },

    // Timing
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    ringingStartedAt: {
      type: Date, // When call started ringing
    },
    answeredAt: {
      type: Date, // When call was answered
    },

    // Status
    status: {
      type: String,
      enum: [
        "initiating",
        "ringing",
        "ongoing",
        "ended",
        "missed",
        "declined",
        "cancelled",
      ],
      default: "initiating",
    },

    // Duration and metrics
    duration: {
      type: Number, // total call duration in seconds
      default: 0,
    },
    ringingDuration: {
      type: Number, // how long it rang before answer/end
      default: 0,
    },
    maxParticipants: {
      type: Number,
      default: 1,
    },

    // Call quality and technical info
    callQuality: {
      type: String,
      enum: ["excellent", "good", "fair", "poor", "unknown"],
      default: "unknown",
    },
    serverRegion: {
      type: String, // Zego server region used
    },
    zegoAppID: {
      type: Number,
      default: 1642584767,
    },

    // Media streams info
    streams: [
      {
        streamID: String,
        userId: String,
        type: {
          type: String,
          enum: ["audio", "video", "screen"],
        },
        startedAt: Date,
        endedAt: Date,
      },
    ],

    // Call features
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

    // Metadata
    callTitle: {
      type: String, // For group calls
    },
    callCategory: {
      type: String,
      enum: ["personal", "business", "support", "other"],
      default: "personal",
    },
    tags: [String],

    // Error handling
    errorCode: {
      type: String, // If call failed
    },
    errorMessage: {
      type: String,
    },

    // Analytics
    userAgent: String,
    ipAddress: String,
    deviceInfo: {
      os: String,
      browser: String,
      isMobile: Boolean,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
callSchema.index({ startedBy: 1, createdAt: -1 });
callSchema.index({ participants: 1, createdAt: -1 });
callSchema.index({ roomID: 1 });
callSchema.index({ status: 1 });
callSchema.index({ "participantDetails.userId": 1 });
callSchema.index({ startedAt: -1 });

// Virtual for call duration calculation
callSchema.virtual("calculatedDuration").get(function () {
  if (this.endedAt && this.startedAt) {
    return Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return 0;
});

// Method to add participant
callSchema.methods.addParticipant = function (userId, status = "invited") {
  const existingParticipant = this.participantDetails.find(
    (p) => p.userId === userId
  );

  if (!existingParticipant) {
    this.participantDetails.push({
      userId,
      status,
      joinedAt: status === "joined" ? new Date() : undefined,
    });
  }

  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }

  return this.save();
};

// Method to update participant status
callSchema.methods.updateParticipantStatus = function (userId, status) {
  const participant = this.participantDetails.find((p) => p.userId === userId);

  if (participant) {
    participant.status = status;

    if (status === "joined" && !participant.joinedAt) {
      participant.joinedAt = new Date();
    } else if (status === "left" && !participant.leftAt) {
      participant.leftAt = new Date();
      // Calculate participant duration
      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (new Date() - participant.joinedAt) / 1000
        );
      }
    }
  }

  return this.save();
};

// Method to end call
callSchema.methods.endCall = function (endedByUserId, duration) {
  this.status = "ended";
  this.endedBy = endedByUserId;
  this.endedAt = new Date();
  this.duration = duration || this.calculatedDuration;

  // Update all participants who are still in call
  this.participantDetails.forEach((participant) => {
    if (participant.status === "joined" && !participant.leftAt) {
      participant.status = "left";
      participant.leftAt = this.endedAt;
      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (this.endedAt - participant.joinedAt) / 1000
        );
      }
    }
  });

  return this.save();
};

// Static method to find user's call history
callSchema.statics.findByUserId = function (userId, limit = 50, skip = 0) {
  return this.find({
    participants: userId,
  })
    .sort({ startedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to find ongoing calls for a user
callSchema.statics.findOngoingByUserId = function (userId) {
  return this.find({
    participants: userId,
    status: { $in: ["ringing", "ongoing"] },
  });
};

// Pre-save middleware to calculate durations
callSchema.pre("save", function (next) {
  // Calculate ringing duration
  if (this.ringingStartedAt && this.answeredAt) {
    this.ringingDuration = Math.floor(
      (this.answeredAt - this.ringingStartedAt) / 1000
    );
  }

  // Auto-calculate duration if not provided
  if (this.endedAt && this.startedAt && !this.duration) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }

  next();
});

module.exports = mongoose.model("Call", callSchema);
