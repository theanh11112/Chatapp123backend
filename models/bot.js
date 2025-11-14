const mongoose = require("mongoose");

const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  keycloakClientId: { type: String, index: true },
  description: { type: String },
  type: { type: String, enum: ["system", "support", "integration"], default: "support" },
  status: { type: String, enum: ["Active", "Inactive", "Suspended"], default: "Active" },
  apiToken: { type: String },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  subscriptions: [{
    type: { type: String, enum: ["room", "user"], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
  }],
  meta: {
    lastInteraction: Date,
    totalInteractions: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model("Bot", botSchema);
