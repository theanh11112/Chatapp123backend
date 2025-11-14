const mongoose = require("mongoose");

const oneToOneMessageSchema = new mongoose.Schema({
  participants: [{ type: String, required: true }],
  messages: [{
    from: { type: String, required: true },
    to: { type: String, required: true },
    type: { type: String, enum: ["text", "image", "file", "video", "system"], default: "text" },
    content: { type: String, required: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    seen: { type: Boolean, default: false },
  }],
}, { timestamps: true });

oneToOneMessageSchema.index({ participants: 1 });
oneToOneMessageSchema.index({ "messages.from": 1 });
oneToOneMessageSchema.index({ "messages.to": 1 });

module.exports = mongoose.model("OneToOneMessage", oneToOneMessageSchema);
