// test-e2ee-complete.js
const { io } = require("socket.io-client");
const axios = require("axios");
const crypto = require("crypto");

const SERVER_URL = "http://localhost:3001";
const KEYCLOAK_URL = "http://localhost:8080";
const REALM = "chat-app";
const CLIENT_ID = "my-react-app";
const CLIENT_SECRET = "bFUtkzEs7nOV0DPBcRnD9ibVhiSYlkqF";

class E2EECompleteTest {
  constructor() {
    this.sockets = {};
    this.tokens = {};
    this.testResults = [];
    this.aliceId = "f5dcb70a-4b2e-4f9c-a17f-3015cb6aed42"; // hoangngan
    this.bobId = "ba025aa5-6cfb-463c-b245-e94472081d45"; // honghao

    // Các room ID sẽ được lấy từ API
    this.roomId = null;
    this.directRoomId = null;

    // Thêm debug mode
    this.debug = true;
  }

  async getToken(username, password) {
    try {
      console.log(`\n🔐 Getting token for ${username}...`);
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
          timeout: 5000,
        }
      );

      const token = response.data.access_token;
      console.log(`✅ Token obtained (${token.length} chars)`);
      return token;
    } catch (error) {
      console.error(`❌ Token error: ${error.message}`);
      throw error;
    }
  }

  async connectSocket(username, token) {
    return new Promise((resolve, reject) => {
      console.log(`\n🔌 Connecting socket for ${username}...`);

      const socket = io(SERVER_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: 10000,
        forceNew: true,
      });

      // Debug listeners - tăng cường logging
      socket.onAny((event, ...args) => {
        if (this.debug) {
          console.log(
            `📡 [${username}] ${event}:`,
            args.length > 1 ? args : args[0]
          );
        }
      });

      socket.on("connect", () => {
        console.log(`✅ ${username} connected! Socket ID: ${socket.id}`);
        resolve(socket);
      });

      socket.on("connect_error", (error) => {
        console.error(`❌ ${username} connection error:`, error.message);
        reject(error);
      });

      // Thêm socket event listeners để debug E2EE
      socket.on("e2ee_error", (error) => {
        console.error(`❌ [${username}] E2EE Error:`, error);
      });

      socket.on("e2ee_access_denied", (data) => {
        console.error(`❌ [${username}] E2EE Access Denied:`, data);
      });

      socket.on("encrypted_message_sent", (data) => {
        console.log(`✅ [${username}] Encrypted message sent:`, data);
      });

      setTimeout(() => {
        if (!socket.connected) {
          reject(new Error(`Connection timeout for ${username}`));
        }
      }, 15000);
    });
  }

  async testEvent(socket, eventName, data = null, timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      console.log(`\n🧪 Testing ${eventName}...`);
      if (data && this.debug) {
        console.log(`   Data:`, data);
      }

      const timeoutId = setTimeout(() => {
        console.log(`⏰ ${eventName} timeout after ${timeout}ms`);
        resolve({
          test: eventName,
          success: false,
          error: "Timeout",
          duration: Date.now() - startTime,
        });
      }, timeout);

      const eventsWithoutData = [
        "ping",
        "get_e2ee_info",
        "get_my_e2ee_keys",
        "health_check",
      ];

      const handler = (response) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.log(`📨 ${eventName} response (${duration}ms):`, response);
        resolve({
          test: eventName,
          success: response?.success === true || response?.status === "success",
          data: response,
          duration,
        });
      };

      if (eventsWithoutData.includes(eventName)) {
        socket.emit(eventName, handler);
      } else {
        socket.emit(eventName, data, handler);
      }
    });
  }

  async makeAPIRequest(method, endpoint, data = null, token = null) {
    try {
      const url = `${SERVER_URL}${endpoint}`;
      if (this.debug) {
        console.log(`🌐 API ${method}: ${url}`);
      }

      const config = {
        headers: {},
        timeout: 10000,
      };

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      let response;
      switch (method.toLowerCase()) {
        case "get":
          response = await axios.get(url, config);
          break;
        case "post":
          config.headers["Content-Type"] = "application/json";
          response = await axios.post(url, data, config);
          break;
        case "patch":
          config.headers["Content-Type"] = "application/json";
          response = await axios.patch(url, data, config);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return response.data;
    } catch (error) {
      console.error(`❌ API Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        if (error.response.data) {
          console.error(
            `   Data:`,
            JSON.stringify(error.response.data, null, 2)
          );
        }
      }
      throw error;
    }
  }

  async checkRoomInDatabase(roomId) {
    try {
      console.log(`\n🔍 Checking room ${roomId} in database...`);

      // Test bằng cách gọi API kiểm tra room
      const response = await this.makeAPIRequest(
        "post",
        "/users/conversations/direct",
        { roomId: roomId },
        this.tokens.alice
      );

      if (response.data && response.data._id === roomId) {
        console.log(`✅ Room exists in database`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error checking room: ${error.message}`);
      return false;
    }
  }

  async testRoomAccess(roomId) {
    try {
      console.log(`\n🔐 Testing access to room ${roomId}...`);

      // Test 1: Gửi tin nhắn bình thường trước
      const testMessage = {
        roomId: roomId,
        content: "Test message for access verification",
        type: "text",
      };

      console.log(`📝 Sending test message to verify access...`);
      const messageResponse = await this.makeAPIRequest(
        "post",
        "/users/message",
        testMessage,
        this.tokens.alice
      );

      console.log(`✅ Room access verified:`, messageResponse);
      return true;
    } catch (error) {
      console.error(
        `❌ Room access denied:`,
        error.response?.data || error.message
      );

      // Check specific error
      if (error.response?.data?.message?.includes("Access denied")) {
        console.log(`\n💡 ACCESS ISSUE DETECTED:`);
        console.log(`   1. Room ID: ${roomId}`);
        console.log(`   2. Alice ID: ${this.aliceId}`);
        console.log(`   3. Error: ${error.response.data.message}`);
        console.log(`\n🔧 SOLUTIONS:`);
        console.log(`   • Check if room exists in MongoDB`);
        console.log(`   • Check if Alice is in room members`);
        console.log(`   • Check room schema structure`);
      }

      return false;
    }
  }

  async getOrCreateDirectRoom() {
    try {
      console.log(
        `\n🔍 Looking for existing direct room between Alice and Bob...`
      );

      // Thử lấy conversations trực tiếp
      try {
        const conversations = await this.makeAPIRequest(
          "get",
          "/users/conversations/direct",
          null,
          this.tokens.alice
        );

        if (conversations.data && conversations.data.length > 0) {
          console.log(
            `📋 Found ${conversations.data.length} direct conversations`
          );

          // Tìm conversation có cả 2 users
          const directConv = conversations.data.find((conv) => {
            const participantIds =
              conv.participants?.map((p) =>
                typeof p === "string" ? p : p.keycloakId || p._id
              ) || [];

            if (this.debug) {
              console.log(
                `   Checking conversation ${conv._id}:`,
                participantIds
              );
            }

            return (
              participantIds.includes(this.aliceId) &&
              participantIds.includes(this.bobId)
            );
          });

          if (directConv) {
            this.directRoomId = directConv._id;
            console.log(
              `✅ Found existing direct conversation: ${this.directRoomId}`
            );

            // Kiểm tra access ngay lập tức
            await this.testRoomAccess(this.directRoomId);
            return this.directRoomId;
          }
        }
      } catch (error) {
        console.log(
          `⚠️  Could not fetch direct conversations: ${error.message}`
        );
      }

      // Nếu không tìm thấy, thử tạo room trực tiếp
      console.log(`\n🏗️  Creating new direct room between Alice and Bob...`);

      const roomData = {
        memberKeycloakIds: [this.aliceId, this.bobId],
        type: "direct",
        name: "Test E2EE Direct Chat",
      };

      console.log(`📝 Creating room with data:`, roomData);

      // Thử tạo room qua endpoint create room
      try {
        const roomResponse = await this.makeAPIRequest(
          "post",
          "/users/room/create",
          roomData,
          this.tokens.alice
        );

        if (roomResponse.data && roomResponse.data._id) {
          this.directRoomId = roomResponse.data._id;
          console.log(`✅ Direct room created: ${this.directRoomId}`);

          // Đợi một chút để room được lưu vào database
          await this.delay(2000);

          // Kiểm tra access
          await this.testRoomAccess(this.directRoomId);
          return this.directRoomId;
        }
      } catch (error) {
        console.log(`⚠️  Room create endpoint failed: ${error.message}`);
      }

      console.log(`❌ Could not create or find direct room`);
      return null;
    } catch (error) {
      console.error(`❌ Error in getOrCreateDirectRoom: ${error.message}`);
      return null;
    }
  }

  async runCompleteTest() {
    console.log("=".repeat(70));
    console.log("🚀 COMPLETE E2EE BACKEND TEST");
    console.log("=".repeat(70));
    console.log(`Server: ${SERVER_URL}`);
    console.log(`Keycloak: ${KEYCLOAK_URL}`);
    console.log(`Alice ID: ${this.aliceId}`);
    console.log(`Bob ID: ${this.bobId}`);
    console.log(`Debug Mode: ${this.debug}`);
    console.log("=".repeat(70));

    try {
      // ==================== PHASE 1: SETUP ====================
      console.log("\n📋 PHASE 1: SETUP");
      console.log("-".repeat(50));

      // Get tokens
      this.tokens.alice = await this.getToken("hoangngan", "1234");
      this.tokens.bob = await this.getToken("honghao", "1234");

      // Connect sockets
      this.sockets.alice = await this.connectSocket("Alice", this.tokens.alice);
      this.sockets.bob = await this.connectSocket("Bob", this.tokens.bob);

      await this.delay(2000);

      // ==================== PHASE 1.5: ROOM SETUP ====================
      console.log("\n📋 PHASE 1.5: ROOM SETUP");
      console.log("-".repeat(50));

      // Tạo hoặc tìm direct room
      console.log(`\n🔄 Creating/finding direct room...`);
      this.roomId = await this.getOrCreateDirectRoom();

      if (!this.roomId) {
        console.log(`\n❌ CRITICAL: No room available for testing!`);
        console.log(`💡 TROUBLESHOOTING:`);
        console.log(`   1. Check if users exist in database`);
        console.log(`   2. Check room creation API endpoint`);
        console.log(`   3. Check server logs for errors`);
        console.log(`\n⚠️  Continuing with room ID = null (tests will fail)`);
      } else {
        console.log(`\n✅ Room ID for testing: ${this.roomId}`);

        // Kiểm tra kỹ hơn về room
        await this.checkRoomInDatabase(this.roomId);
        await this.testRoomAccess(this.roomId);
      }

      await this.delay(2000);

      // ==================== PHASE 2: BASIC HANDLERS ====================
      console.log("\n📋 PHASE 2: BASIC HANDLERS TEST");
      console.log("-".repeat(50));

      // Test 1: Ping
      const pingResult = await this.testEvent(this.sockets.alice, "ping");
      this.testResults.push(pingResult);

      // Test 2: Health Check
      const healthResult = await this.testEvent(
        this.sockets.alice,
        "health_check"
      );
      this.testResults.push(healthResult);

      // Test 3: Get E2EE Info
      const infoResult = await this.testEvent(
        this.sockets.alice,
        "get_e2ee_info"
      );
      this.testResults.push(infoResult);

      // Test 4: Get My E2EE Keys
      const keysResult = await this.testEvent(
        this.sockets.alice,
        "get_my_e2ee_keys"
      );
      this.testResults.push(keysResult);

      await this.delay(1000);

      // ==================== PHASE 3: KEY MANAGEMENT ====================
      console.log("\n📋 PHASE 3: KEY MANAGEMENT");
      console.log("-".repeat(50));

      // Generate test keys
      const aliceKey = crypto.createECDH("prime256v1");
      aliceKey.generateKeys();
      const alicePublicKey = aliceKey.getPublicKey("base64");

      const bobKey = crypto.createECDH("prime256v1");
      bobKey.generateKeys();
      const bobPublicKey = bobKey.getPublicKey("base64");

      console.log(`🔑 Generated test keys:`);
      console.log(`   Alice: ${alicePublicKey.substring(0, 30)}...`);
      console.log(`   Bob: ${bobPublicKey.substring(0, 30)}...`);

      // Test 5: Update Alice's key
      const updateAliceResult = await this.testEvent(
        this.sockets.alice,
        "update_e2ee_key",
        {
          publicKey: alicePublicKey,
          keyType: "ecdh",
        }
      );
      this.testResults.push(updateAliceResult);

      // Test 6: Update Bob's key
      const updateBobResult = await this.testEvent(
        this.sockets.bob,
        "update_e2ee_key",
        {
          publicKey: bobPublicKey,
          keyType: "ecdh",
        }
      );
      this.testResults.push(updateBobResult);

      await this.delay(2000);

      // Test 7: Enable E2EE for Alice
      const enableAliceResult = await this.testEvent(
        this.sockets.alice,
        "toggle_e2ee",
        { enabled: true }
      );
      this.testResults.push(enableAliceResult);

      // Test 8: Enable E2EE for Bob
      const enableBobResult = await this.testEvent(
        this.sockets.bob,
        "toggle_e2ee",
        { enabled: true }
      );
      this.testResults.push(enableBobResult);

      await this.delay(3000);

      // ==================== PHASE 4: KEY EXCHANGE ====================
      console.log("\n📋 PHASE 4: KEY EXCHANGE");
      console.log("-".repeat(50));

      // Test 9: Alice requests Bob's key
      const requestKeyResult = await this.testEvent(
        this.sockets.alice,
        "request_e2ee_key",
        { userId: this.bobId }
      );
      this.testResults.push(requestKeyResult);

      // Test 10: Check Bob's E2EE status
      const checkStatusResult = await this.testEvent(
        this.sockets.alice,
        "check_e2ee_status",
        { userId: this.bobId }
      );
      this.testResults.push(checkStatusResult);

      // Test 11: Initiate key exchange
      const initiateExchangeResult = await this.testEvent(
        this.sockets.alice,
        "initiate_key_exchange",
        { peerId: this.bobId }
      );
      this.testResults.push(initiateExchangeResult);

      await this.delay(3000);

      // ==================== PHASE 5: ENCRYPTED MESSAGING ====================
      console.log("\n📋 PHASE 5: ENCRYPTED MESSAGING");
      console.log("-".repeat(50));

      if (!this.roomId) {
        console.log(
          `\n⚠️  SKIPPING encrypted messaging tests - no room available`
        );
        console.log(`💡 Please check room creation above`);
      } else {
        console.log(
          `\n📝 Testing encrypted messaging with room: ${this.roomId}`
        );

        // Test 12: Kiểm tra E2EE access trước
        console.log(`\n🔐 Checking E2EE access for room ${this.roomId}...`);
        const checkAccessResult = await this.testEvent(
          this.sockets.alice,
          "check_e2ee_status",
          { userId: this.bobId }
        );

        if (checkAccessResult.success && checkAccessResult.data.canEncrypt) {
          console.log(`✅ Both users have E2EE enabled and can encrypt`);
        } else {
          console.log(`❌ E2EE not properly enabled:`, checkAccessResult.data);
        }

        // Test 13: Try to send encrypted message với cấu trúc đơn giản hơn
        const ciphertext = crypto.randomBytes(32).toString("base64");
        const iv = crypto.randomBytes(12).toString("base64");

        console.log(`\n🔐 Preparing encrypted message...`);

        const encryptedMsgData = {
          roomId: this.roomId,
          ciphertext: ciphertext,
          iv: iv,
          keyId: "TEST1234", // Sử dụng key ID đơn giản
          algorithm: "AES-GCM-256",
          // Thêm metadata đơn giản
          metadata: JSON.stringify({
            test: true,
            timestamp: Date.now(),
            sender: this.aliceId,
            messageType: "text",
          }),
        };

        console.log(`📤 Sending encrypted message...`);
        const encryptedMsgResult = await this.testEvent(
          this.sockets.alice,
          "send_encrypted_message",
          encryptedMsgData
        );
        this.testResults.push(encryptedMsgResult);

        // Nếu thất bại, thử alternative approach
        if (!encryptedMsgResult.success) {
          console.log(`\n🔄 Trying alternative approach...`);

          // Thử gửi message bình thường trước để verify room access
          try {
            const normalMessage = {
              roomId: this.roomId,
              content: "Test normal message before encrypted",
              type: "text",
            };

            const normalResult = await this.makeAPIRequest(
              "post",
              "/users/message",
              normalMessage,
              this.tokens.alice
            );

            console.log(`✅ Normal message sent:`, normalResult);
          } catch (error) {
            console.log(`❌ Normal message also failed:`, error.message);
          }
        }

        // Test 14: Verify fingerprint
        const verifyResult = await this.testEvent(
          this.sockets.alice,
          "verify_fingerprint",
          {
            publicKey: alicePublicKey,
            expectedFingerprint: "TEST1234",
          }
        );
        this.testResults.push(verifyResult);

        // Test 15: Get encrypted messages from room - với timeout ngắn hơn
        console.log(`\n📨 Attempting to get encrypted messages...`);
        const getMessagesPromise = this.testEvent(
          this.sockets.alice,
          "get_encrypted_messages",
          {
            roomId: this.roomId,
            limit: 5,
          },
          10000 // 10 seconds timeout
        );

        // Thêm timeout handler riêng
        const getMessagesResult = await Promise.race([
          getMessagesPromise,
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                test: "get_encrypted_messages",
                success: false,
                error: "Handler not implemented or timeout",
                duration: 10000,
              });
            }, 10000);
          }),
        ]);

        this.testResults.push(getMessagesResult);
      }

      await this.delay(2000);

      // ==================== PHASE 6: CLEANUP ====================
      console.log("\n📋 PHASE 6: CLEANUP");
      console.log("-".repeat(50));

      // Test 16: Disable E2EE for Alice
      const disableAliceResult = await this.testEvent(
        this.sockets.alice,
        "toggle_e2ee",
        { enabled: false }
      );
      this.testResults.push(disableAliceResult);

      // Test 17: Disable E2EE for Bob
      const disableBobResult = await this.testEvent(
        this.sockets.bob,
        "toggle_e2ee",
        { enabled: false }
      );
      this.testResults.push(disableBobResult);

      await this.delay(1000);

      // ==================== DISCONNECT ====================
      console.log("\n🔌 Disconnecting sockets...");
      this.sockets.alice.disconnect();
      this.sockets.bob.disconnect();

      await this.delay(1000);

      // ==================== PRINT RESULTS ====================
      this.printResults();
    } catch (error) {
      console.error("\n❌ TEST FAILED:", error.message);
      console.error("Stack:", error.stack);

      Object.values(this.sockets).forEach((socket) => {
        if (socket && socket.connected) {
          socket.disconnect();
        }
      });

      this.printResults();
      throw error;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printResults() {
    console.log("\n" + "=".repeat(70));
    console.log("📊 E2EE BACKEND TEST RESULTS");
    console.log("=".repeat(70));

    const total = this.testResults.length;
    const passed = this.testResults.filter((t) => t.success).length;
    const failed = total - passed;

    console.log(`Total tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(
      `📈 Success rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`
    );

    console.log("\n📋 Detailed Results:");
    this.testResults.forEach((result, index) => {
      const icon = result.success ? "✅" : "❌";
      const time = result.duration ? `${result.duration}ms` : "";
      console.log(`${index + 1}. ${icon} ${result.test} ${time}`);

      if (!result.success) {
        if (result.error === "Timeout") {
          console.log(`   ⚠️  Timeout - Handler không phản hồi`);
        } else if (result.data?.error) {
          console.log(`   ❌ ${result.data.error}`);
        } else if (result.error) {
          console.log(`   ❌ ${result.error}`);
        }

        // Special handling for specific errors
        if (result.test === "send_encrypted_message") {
          console.log(`   🔍 Room ID: ${this.roomId}`);
          console.log(`   💡 Check E2EE handler and room access`);
        }

        if (result.test === "get_encrypted_messages") {
          console.log(`   ⚠️  Handler may not be implemented`);
          console.log(
            `   💡 Check if get_encrypted_messages exists in e2eeHandlers.js`
          );
        }
      }
    });

    console.log("\n" + "=".repeat(70));
    console.log("🔍 ROOT CAUSE ANALYSIS:");
    console.log("=".repeat(70));

    const sendEncryptedTest = this.testResults.find(
      (t) => t.test === "send_encrypted_message"
    );
    const getEncryptedTest = this.testResults.find(
      (t) => t.test === "get_encrypted_messages"
    );

    if (sendEncryptedTest && !sendEncryptedTest.success) {
      console.log("\n🔐 ISSUE 1: send_encrypted_message FAILED");
      console.log(
        `   Error: ${sendEncryptedTest.data?.error || sendEncryptedTest.error}`
      );
      console.log(`   Room ID: ${this.roomId}`);
      console.log(`\n💡 POSSIBLE CAUSES:`);
      console.log(`   1. Room access permission issue`);
      console.log(`   2. E2EE not properly enabled for both users`);
      console.log(`   3. Handler checkE2EEAccess() returning false`);
      console.log(`   4. Room doesn't exist or has wrong schema`);
      console.log(`\n🔧 QUICK FIXES:`);
      console.log(`   • Check server logs for "Access denied" details`);
      console.log(
        `   • Verify room exists: db.rooms.find({_id: ObjectId("${this.roomId}")})`
      );
      console.log(
        `   • Check room members: db.rooms.findOne({_id: ObjectId("${this.roomId}")}, {members: 1})`
      );
      console.log(`   • Test with simple message first via API`);
    }

    if (getEncryptedTest && !getEncryptedTest.success) {
      console.log("\n📨 ISSUE 2: get_encrypted_messages TIMEOUT");
      console.log(`   Error: Handler not responding`);
      console.log(`\n💡 POSSIBLE CAUSES:`);
      console.log(`   1. Handler not implemented in e2eeHandlers.js`);
      console.log(`   2. Handler exists but not registered properly`);
      console.log(`   3. Database query hanging`);
      console.log(`\n🔧 QUICK FIXES:`);
      console.log(`   • Check if get_encrypted_messages handler exists`);
      console.log(`   • Check server startup logs for handler registration`);
      console.log(`   • Reduce timeout or implement the handler`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("🔧 RECOMMENDED ACTIONS:");
    console.log("=".repeat(70));

    console.log(`
1. CHECK SERVER LOGS:
   tail -f server.log | grep -E "(E2EE|send_encrypted|access)"

2. CHECK DATABASE:
   mongo
   use chat-app
   db.rooms.find({_id: ObjectId("${this.roomId}")})
   db.e2eekeys.find({keycloakId: "${this.aliceId}"})

3. TEST MANUALLY:
   curl -X POST http://localhost:3001/users/message \\
     -H "Authorization: Bearer ${this.tokens.alice?.substring(0, 50)}..." \\
     -H "Content-Type: application/json" \\
     -d '{
       "roomId": "${this.roomId}",
       "content": "Test message",
       "type": "text"
     }'

4. CHECK HANDLER IMPLEMENTATION:
   Look for sendEncryptedMessage() in controllers/e2eeController.js
   Look for checkE2EEAccess() function

5. VERIFY SOCKET HANDLERS:
   Check e2eeHandlers.js for send_encrypted_message handler
   Check if callback is being called
    `);

    console.log("=".repeat(70));
    console.log("🏁 Test completed!");
  }
}

// Run the complete test
async function main() {
  const test = new E2EECompleteTest();

  try {
    await test.runCompleteTest();
  } catch (error) {
    console.error("❌ Complete test failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = E2EECompleteTest;
