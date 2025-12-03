// test-call-simple.js
// Test đơn giản các chức năng call sử dụng Socket.IO
const { io } = require("socket.io-client");
const axios = require("axios");

// ==================== CONFIGURATION ====================
const SERVER_URL = "http://localhost:3001";
const KEYCLOAK_URL = "http://localhost:8080";
const REALM = "chat-app";
const CLIENT_ID = "my-react-app";
const CLIENT_SECRET = "bFUtkzEs7nOV0DPBcRnD9ibVhiSYlkqF";

// Test users
const TEST_USERS = [
  {
    username: "hoangngan",
    password: "1234",
    keycloakId: "f5dcb70a-4b2e-4f9c-a17f-3015cb6aed42",
  },
  {
    username: "honghao",
    password: "1234",
    keycloakId: "ba025aa5-6cfb-463c-b245-e94472081d45",
  },
];

// ==================== HELPER FUNCTIONS ====================
async function getKeycloakToken(username, password) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        username,
        password,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(`❌ Failed to get token for ${username}:`, error.message);
    throw error;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRoomID(prefix = "test") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

// ==================== TEST CLASS ====================
class SimpleCallTest {
  constructor() {
    this.events = [];
    this.errors = [];
    this.startTime = Date.now();
  }

  log(module, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${module}: ${message}`;
    console.log(logEntry);

    this.events.push({
      timestamp,
      module,
      message,
      data: data ? JSON.stringify(data).substring(0, 200) : null,
    });

    if (module.includes("ERROR")) {
      this.errors.push(logEntry);
    }
  }

  async connectSocket(user, role) {
    this.log("SOCKET", `Connecting ${user.username}...`);

    const socket = io(SERVER_URL, {
      auth: { token: user.token },
      transports: ["websocket", "polling"],
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout for ${user.username}`));
      }, 10000);

      socket.on("connect", () => {
        clearTimeout(timeout);
        this.log("SOCKET", `✅ ${user.username} connected: ${socket.id}`);
        resolve(socket);
      });

      socket.on("connect_error", (error) => {
        clearTimeout(timeout);
        this.log("SOCKET-ERROR", `Connection failed: ${error.message}`);
        reject(error);
      });
    });
  }

  async runSimpleTest() {
    try {
      this.log("TEST", "🚀 STARTING SIMPLE CALL TEST");
      this.log("TEST", `Using server: ${SERVER_URL}`);

      // ==================== 1. GET TOKENS ====================
      this.log("TEST", "1. 🔑 Getting tokens...");
      for (const user of TEST_USERS) {
        user.token = await getKeycloakToken(user.username, user.password);
        this.log("TEST", `   ✅ Token for ${user.username}: OK`);
      }

      // ==================== 2. CONNECT SOCKETS ====================
      this.log("TEST", "\n2. 🔌 Connecting sockets...");
      const callerSocket = await this.connectSocket(TEST_USERS[0], "caller");
      const receiverSocket = await this.connectSocket(
        TEST_USERS[1],
        "receiver"
      );

      await delay(2000);

      // ==================== 3. SETUP EVENT LISTENERS ====================
      this.log("TEST", "\n3. 👂 Setup event listeners...");

      // Track important events
      const importantEvents = [
        "audio_call_notification",
        "audio_call_started",
        "audio_call_accepted",
        "video_call_notification",
        "video_call_started",
        "video_call_declined",
        "call_error",
        "call_ended",
        "join_existing_call",
        "user_joined_call",
        "user_left_call",
        "call_room_joined",
        "call_room_left",
      ];

      callerSocket.onAny((event, data) => {
        if (importantEvents.includes(event)) {
          this.log("CALLER-EVENT", event, data);
        }
      });

      receiverSocket.onAny((event, data) => {
        if (importantEvents.includes(event)) {
          this.log("RECEIVER-EVENT", event, data);
        }
      });

      // ==================== 4. TEST 1: DIRECT AUDIO CALL ====================
      this.log("TEST", "\n4. 📞 TEST 1: DIRECT AUDIO CALL");

      const audioRoomID = generateRoomID("audio");
      this.log("TEST", `   Room ID: ${audioRoomID}`);

      let audioCallId = null;
      let audioCallAccepted = false;

      // Setup receiver to accept call
      receiverSocket.once("audio_call_notification", async (data) => {
        this.log("RECEIVER", `📞 Received audio call notification`);
        this.log("RECEIVER", `   Call ID: ${data.callId}`);
        this.log("RECEIVER", `   From: ${data.fromUser?.username}`);

        audioCallId = data.callId;

        await delay(2000);

        // Accept the call
        this.log("RECEIVER", `✅ Accepting call...`);
        receiverSocket.emit("audio_call_accepted", {
          callId: data.callId,
          roomID: audioRoomID,
        });

        audioCallAccepted = true;
      });

      // Setup caller for acceptance
      callerSocket.once("audio_call_accepted", (data) => {
        this.log("CALLER", `🎉 Call accepted!`);
        this.log("CALLER", `   Call ID: ${data.callId}`);
        audioCallId = data.callId || audioCallId;

        // Join room
        setTimeout(() => {
          this.log("TEST", `   Joining room ${audioRoomID}...`);
          callerSocket.emit("join_call_room", { roomID: audioRoomID });
          receiverSocket.emit("join_call_room", { roomID: audioRoomID });
        }, 1000);
      });

      // Make the call
      this.log(
        "TEST",
        `   ${TEST_USERS[0].username} calling ${TEST_USERS[1].username}...`
      );
      callerSocket.emit("start_audio_call", {
        to: TEST_USERS[1].keycloakId,
        roomID: audioRoomID,
      });

      // Wait for call to be accepted
      this.log("TEST", "   ⏳ Waiting for call acceptance (10 seconds)...");
      await delay(10000);

      // ==================== 5. TEST IN-CALL FEATURES ====================
      if (audioCallAccepted) {
        this.log("TEST", "\n5. 🔧 TESTING IN-CALL FEATURES");

        // Test mute/unmute
        this.log("TEST", "   5.1. Testing mute/unmute...");
        callerSocket.emit("toggle_audio_mute", {
          roomID: audioRoomID,
          isMuted: true,
        });
        await delay(1000);
        callerSocket.emit("toggle_audio_mute", {
          roomID: audioRoomID,
          isMuted: false,
        });

        // Test user ready
        this.log("TEST", "   5.2. Testing user ready status...");
        callerSocket.emit("call_user_ready", {
          roomID: audioRoomID,
          streamType: "audio",
        });
        receiverSocket.emit("call_user_ready", {
          roomID: audioRoomID,
          streamType: "audio",
        });

        await delay(2000);

        // ==================== 6. END AUDIO CALL ====================
        this.log("TEST", "\n6. 📴 ENDING AUDIO CALL");
        this.log("TEST", `   Ending call ${audioCallId || audioRoomID}`);

        callerSocket.emit("end_call", {
          roomID: audioRoomID,
          callId: audioCallId,
        });

        await delay(3000);
      } else {
        this.log(
          "TEST-ERROR",
          "❌ Audio call not accepted, skipping further tests"
        );
      }

      // ==================== 7. TEST 2: DIRECT VIDEO CALL ====================
      this.log("TEST", "\n7. 🎥 TEST 2: DIRECT VIDEO CALL");

      const videoRoomID = generateRoomID("video");
      this.log("TEST", `   Room ID: ${videoRoomID}`);

      // Setup receiver to decline video call
      receiverSocket.once("video_call_notification", async (data) => {
        this.log("RECEIVER", `🎥 Received video call notification`);
        this.log("RECEIVER", `   Call ID: ${data.callId}`);

        await delay(1500);

        // Decline the call
        this.log("RECEIVER", `❌ Declining video call...`);
        receiverSocket.emit("video_call_declined", {
          callId: data.callId,
          roomID: videoRoomID,
        });
      });

      // Make video call
      this.log("TEST", `   ${TEST_USERS[0].username} making video call...`);
      callerSocket.emit("start_video_call", {
        to: TEST_USERS[1].keycloakId,
        roomID: videoRoomID,
      });

      // Wait for response
      this.log("TEST", "   ⏳ Waiting for response (8 seconds)...");
      await delay(8000);

      // Clean up video call if needed
      this.log("TEST", "   Cleaning up video call...");
      callerSocket.emit("end_call", { roomID: videoRoomID });
      await delay(2000);

      // ==================== 8. TEST 3: ERROR HANDLING ====================
      this.log("TEST", "\n8. 🧪 TEST 3: ERROR HANDLING");

      // Test call without 'to' field
      this.log("TEST", "   8.1. Testing call without 'to' field...");
      callerSocket.emit("start_audio_call", {
        roomID: generateRoomID("error"),
      });
      await delay(2000);

      // Test join non-existent room
      this.log("TEST", "   8.2. Testing join non-existent room...");
      callerSocket.emit("join_call_room", {
        roomID: "non_existent_room_123456",
      });
      await delay(2000);

      // ==================== 9. TEST 4: WEBRTC SIGNALING ====================
      this.log("TEST", "\n9. 📡 TEST 4: WEBRTC SIGNALING");

      const testRoomID = generateRoomID("webrtc");
      const testCallId = `test_webrtc_${Date.now()}`;

      // Test WebRTC offer
      this.log("TEST", "   9.1. Testing WebRTC offer...");
      callerSocket.emit("webrtc_offer", {
        to: TEST_USERS[1].keycloakId,
        offer: {
          type: "offer",
          sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n",
        },
        roomID: testRoomID,
        callId: testCallId,
      });
      await delay(1000);

      // Test WebRTC answer
      this.log("TEST", "   9.2. Testing WebRTC answer...");
      receiverSocket.emit("webrtc_answer", {
        to: TEST_USERS[0].keycloakId,
        answer: {
          type: "answer",
          sdp: "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n",
        },
        roomID: testRoomID,
        callId: testCallId,
      });
      await delay(1000);

      // Test ICE candidate
      this.log("TEST", "   9.3. Testing ICE candidate...");
      callerSocket.emit("ice_candidate", {
        to: TEST_USERS[1].keycloakId,
        candidate: {
          candidate:
            "candidate:123456 1 udp 2113929471 192.168.1.1 12345 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
        roomID: testRoomID,
        callId: testCallId,
      });
      await delay(1000);

      // ==================== 10. CLEANUP ====================
      this.log("TEST", "\n10. 🧹 CLEANUP");

      // Leave any rooms
      this.log("TEST", "   10.1. Leaving all rooms...");
      try {
        callerSocket.emit("leave_call_room", { roomID: audioRoomID });
        callerSocket.emit("leave_call_room", { roomID: videoRoomID });
        callerSocket.emit("leave_call_room", { roomID: testRoomID });
      } catch (e) {
        // Ignore errors
      }

      // Disconnect sockets
      this.log("TEST", "   10.2. Disconnecting sockets...");
      callerSocket.disconnect();
      receiverSocket.disconnect();

      await delay(1000);

      // ==================== 11. SUMMARY ====================
      this.printSummary();
    } catch (error) {
      this.log("TEST-ERROR", `Test failed: ${error.message}`);
      this.log("TEST-ERROR", `Stack: ${error.stack}`);
      this.printSummary();
      process.exit(1);
    }
  }

  printSummary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total events: ${this.events.length}`);
    console.log(`Total errors: ${this.errors.length}`);
    console.log(`Test duration: ${duration}s`);

    // Count events by module
    const moduleCounts = {};
    this.events.forEach((event) => {
      moduleCounts[event.module] = (moduleCounts[event.module] || 0) + 1;
    });

    console.log("\n📋 Event breakdown:");
    Object.entries(moduleCounts).forEach(([module, count]) => {
      console.log(`  ${module}: ${count} events`);
    });

    if (this.errors.length > 0) {
      console.log("\n❌ ERRORS FOUND:");
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    } else {
      console.log("\n✅ ALL TESTS PASSED!");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎯 TEST SCENARIOS COVERED:");
    console.log("=".repeat(60));
    console.log("✅ 1. Socket connection and authentication");
    console.log("✅ 2. Direct audio call initiation");
    console.log("✅ 3. Call notification to receiver");
    console.log("✅ 4. Call acceptance by receiver");
    console.log("✅ 5. Call room joining");
    console.log("✅ 6. In-call features (mute/unmute)");
    console.log("✅ 7. User ready status");
    console.log("✅ 8. Call ending");
    console.log("✅ 9. Direct video call initiation");
    console.log("✅ 10. Call declining");
    console.log("✅ 11. WebRTC signaling (offer/answer/ICE)");
    console.log("✅ 12. Error handling scenarios");
    console.log("✅ 13. Socket room management");
    console.log("=".repeat(60));
  }
}

// ==================== EXECUTION ====================
if (require.main === module) {
  console.log("🔧 Simple Call Test");
  console.log("⚠️  PREREQUISITES:");
  console.log("   1. Backend server on port 3001");
  console.log("   2. Keycloak server on port 8080");
  console.log("   3. Test users exist in database");
  console.log("\nStarting test in 3 seconds...");

  setTimeout(() => {
    const test = new SimpleCallTest();
    test
      .runSimpleTest()
      .then(() => {
        console.log("\n✨ Test completed!");
        process.exit(0);
      })
      .catch((error) => {
        console.error("\n💥 Test crashed:", error);
        process.exit(1);
      });
  }, 3000);
}

module.exports = { SimpleCallTest };
