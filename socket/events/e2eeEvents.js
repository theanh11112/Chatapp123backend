// socket/events/e2eeEvents.js - Separate E2EE events
const e2eeUtils = require("../../utils/e2ee");

console.log("🔐 [e2eeEvents] Module loaded successfully");

/**
 * Register E2EE broadcast events
 */
function registerE2EEEvents(socket, io) {
  if (!socket.user) {
    console.error("❌ [e2eeEvents] Socket has no user object!");
    return;
  }

  const { keycloakId, username } = socket.user;

  console.log(
    `🔐 [e2eeEvents] Registering E2EE broadcast events for ${username}`
  );

  // ==================== E2EE BROADCAST EVENTS ====================

  // 1. E2EE Key Exchange Request (Nhận từ peer)
  socket.on("key_exchange_request", (data) => {
    console.log(
      `🔄 [e2eeEvents - ${username}] Received key exchange request from ${data.from}`
    );

    // Broadcast to client để xử lý
    socket.emit("key_exchange_request_received", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 2. E2EE Key Exchange Confirmation (Nhận từ peer)
  socket.on("key_exchange_confirmed", (data) => {
    console.log(
      `✅ [e2eeEvents - ${username}] Received key exchange confirmation from ${data.from}`
    );

    // Broadcast to client
    socket.emit("key_exchange_confirmed_received", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 3. Friend E2EE Status Changed (Nhận từ friend)
  socket.on("friend_e2ee_status_changed", (data) => {
    console.log(
      `🔄 [e2eeEvents - ${username}] Friend ${data.userId} changed E2EE status: ${data.e2eeEnabled}`
    );

    // Broadcast to client
    socket.emit("friend_e2ee_status_updated", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 4. Friend E2EE Key Updated (Nhận từ friend)
  socket.on("friend_e2ee_key_updated", (data) => {
    console.log(
      `🔑 [e2eeEvents - ${username}] Friend ${data.userId} updated E2EE key`
    );

    // Broadcast to client
    socket.emit("friend_e2ee_key_updated_received", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 5. Friend E2EE Key Changed (Nhận từ friend)
  socket.on("friend_e2ee_key_changed", (data) => {
    console.log(
      `🔄 [e2eeEvents - ${username}] Friend ${data.userId} changed active E2EE key`
    );

    // Broadcast to client
    socket.emit("friend_e2ee_key_changed_received", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 6. Encrypted Message Received
  socket.on("encrypted_message_received", (data) => {
    console.log(
      `🔐 [e2eeEvents - ${username}] Received encrypted message from ${data.from}`
    );

    // Broadcast to client
    socket.emit("encrypted_message", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  // 7. Encrypted Group Message Received
  socket.on("encrypted_group_message", (data) => {
    console.log(
      `🔐 [e2eeEvents - ${username}] Received encrypted group message`
    );

    // Broadcast to client
    socket.emit("encrypted_group_message_received", {
      ...data,
      receivedAt: new Date(),
      source: "e2eeEvents",
    });
  });

  console.log(
    `✅ [e2eeEvents] E2EE broadcast events registered for ${username}`
  );
}

module.exports = registerE2EEEvents;
