// models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ["bug", "feature", "complaint", "suggestion", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved", "rejected", "closed"],
      default: "pending",
    },
    reportedBy: {
      type: String, // keycloakId của user báo cáo
      required: true,
    },
    reportedByEmail: {
      type: String, // Email của user (nếu có)
      required: false,
    },
    assignedTo: {
      type: String, // keycloakId của admin được assign
      required: false,
    },
    category: {
      type: String,
      enum: ["technical", "content", "user_behavior", "payment", "general"],
      default: "general",
    },
    attachments: [
      {
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolution: {
      resolvedBy: {
        type: String, // keycloakId của admin xử lý
        required: false,
      },
      resolvedAt: {
        type: Date,
        required: false,
      },
      resolutionNote: {
        type: String,
        maxlength: 1000,
        required: false,
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Theo dõi thời gian xử lý
    firstResponseAt: {
      type: Date,
      required: false,
    },
    closedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index cho hiệu suất
reportSchema.index({ reportedBy: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: -1 });
reportSchema.index({ assignedTo: 1 });
reportSchema.index({ type: 1, category: 1 });
reportSchema.index({ createdAt: -1 });

// Virtual để tính thời gian xử lý
reportSchema.virtual("responseTime").get(function () {
  if (this.firstResponseAt && this.createdAt) {
    return this.firstResponseAt - this.createdAt;
  }
  return null;
});

reportSchema.virtual("resolutionTime").get(function () {
  if (this.closedAt && this.createdAt) {
    return this.closedAt - this.createdAt;
  }
  return null;
});

// Middleware để cập nhật thời gian
reportSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    const now = new Date();

    // Cập nhật thời gian phản hồi đầu tiên
    if (this.status !== "pending" && !this.firstResponseAt) {
      this.firstResponseAt = now;
    }

    // Cập nhật thời gian đóng
    if (
      ["resolved", "rejected", "closed"].includes(this.status) &&
      !this.closedAt
    ) {
      this.closedAt = now;
    }
  }
  next();
});

module.exports = mongoose.model("Report", reportSchema);
