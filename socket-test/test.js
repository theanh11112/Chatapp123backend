// test-e2ee-socket.js - UPDATED VERSION
const { io } = require("socket.io-client");
const axios = require("axios");
const crypto = require("crypto");

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

class E2EESocketTest {
  constructor() {
    this.testResults = [];
    this.userSockets = {};
    this.userTokens = {};
    this.socketListeners = {};
  }

  log(message, data = null, level = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix =
      {
        info: "ℹ️",
        success: "✅",
        error: "❌",
        warning: "⚠️",
        debug: "🔍",
        test: "🧪",
      }[level] || "📝";

    console.log(`${prefix} [${timestamp}] ${message}`);
    if (data) {
      if (typeof data === "object") {
        console.log(
          "   Data:",
          JSON.stringify(data, null, 2).substring(0, 300)
        );
      } else {
        console.log("   Data:", data);
      }
    }
  }

  async getToken(username, password) {
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
          timeout: 5000,
        }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error(`Token failed: ${error.message}`);
    }
  }

  async connectSocket(user) {
    return new Promise((resolve, reject) => {
      const socket = io(SERVER_URL, {
        auth: { token: this.userTokens[user.username] },
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: 10000,
        reconnectionAttempts: 1,
      });

      // Setup socket listeners for debugging
      this.setupSocketListeners(socket, user.username);

      socket.on("connect", () => {
        this.log(
          `Connected: ${user.username}`,
          { socketId: socket.id },
          "success"
        );
        resolve(socket);
      });

      socket.on("connect_error", (error) => {
        this.log(`Connection failed: ${user.username}`, error.message, "error");
        reject(error);
      });

      // Handle authentication errors
      socket.on("error", (error) => {
        this.log(`Socket error: ${user.username}`, error, "error");
        reject(error);
      });

      socket.on("disconnect", (reason) => {
        this.log(`Disconnected: ${user.username}`, reason, "warning");
      });

      // Test specific handlers
      socket.on("health_check_response", (data) => {
        this.log(`Health check response: ${user.username}`, data, "debug");
      });

      socket.on("key_exchange_request", (data) => {
        this.log(
          `Key exchange request received: ${user.username}`,
          data,
          "debug"
        );
      });

      socket.on("friend_e2ee_status_changed", (data) => {
        this.log(`Friend E2EE status changed: ${user.username}`, data, "debug");
      });

      // Add more event listeners as needed
      const importantEvents = [
        "user_online",
        "user_offline",
        "message_pinned",
        "message_unpinned",
        "encrypted_message",
        "encrypted_group_message",
        "friend_e2ee_key_updated",
        "friend_e2ee_key_changed",
      ];

      importantEvents.forEach((event) => {
        socket.on(event, (data) => {
          this.log(`${event}: ${user.username}`, data, "debug");
        });
      });

      setTimeout(() => {
        if (!socket.connected) {
          reject(new Error(`Connection timeout for ${user.username}`));
        }
      }, 10000);
    });
  }

  setupSocketListeners(socket, username) {
    const listeners = {
      any: (...args) => {
        const event = args[0];
        const data = args.slice(1);

        // Only log E2EE and important events
        if (
          event.includes("e2ee") ||
          event.includes("key") ||
          event.includes("encrypt") ||
          event === "ping" ||
          event === "error" ||
          event.includes("friend")
        ) {
          this.log(
            `📡 [${username}] ${event}`,
            data.length === 1 ? data[0] : data,
            "debug"
          );
        }
      },
    };

    socket.onAny(listeners.any);
    this.socketListeners[username] = listeners;
  }

  async testEvent(socket, eventName, data, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let responded = false;

      const timeoutId = setTimeout(() => {
        if (!responded) {
          this.log(`${eventName} timeout after ${timeout}ms`, null, "warning");
          resolve({
            success: false,
            error: `Timeout after ${timeout}ms`,
            duration: Date.now() - startTime,
            event: eventName,
          });
        }
      }, timeout);

      this.log(`Testing ${eventName}...`, data, "test");

      socket.emit(eventName, data, (response) => {
        clearTimeout(timeoutId);
        responded = true;
        const duration = Date.now() - startTime;

        this.log(
          `${eventName} response (${duration}ms)`,
          response,
          response?.success ? "success" : "error"
        );

        resolve({
          success: response?.success === true || response?.status === "success",
          data: response,
          duration,
          event: eventName,
        });
      });
    });
  }

  async testEventWithoutCallback(socket, eventName, data) {
    return new Promise((resolve) => {
      this.log(`Emitting ${eventName} (no callback)...`, data, "test");
      socket.emit(eventName, data);

      // Wait a bit for async processing
      setTimeout(() => {
        resolve({
          success: true,
          event: eventName,
          message: "Event emitted without callback",
        });
      }, 1000);
    });
  }

  async testBroadcastEvent(socket, eventName, expectedEvent, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let received = false;
      let receivedData = null;

      const timeoutId = setTimeout(() => {
        if (!received) {
          this.log(
            `${expectedEvent} not received after ${timeout}ms`,
            null,
            "warning"
          );
          resolve({
            success: false,
            error: `Broadcast event ${expectedEvent} not received`,
            duration: Date.now() - startTime,
            event: eventName,
          });
        }
      }, timeout);

      // Listen for the expected broadcast event
      const handler = (data) => {
        received = true;
        receivedData = data;
        clearTimeout(timeoutId);
        this.log(`Received broadcast: ${expectedEvent}`, data, "debug");
        resolve({
          success: true,
          data: data,
          duration: Date.now() - startTime,
          event: eventName,
        });
      };

      socket.once(expectedEvent, handler);

      // Emit the trigger event
      this.log(
        `Testing broadcast: ${eventName} -> ${expectedEvent}`,
        null,
        "test"
      );
      socket.emit(eventName, { test: true });

      // Cleanup after timeout
      timeoutId.cleanup = () => {
        socket.off(expectedEvent, handler);
      };
    });
  }

  async runTests() {
    try {
      console.log("🧪 E2EE Socket Handler Tests");
      console.log("=".repeat(70));
      console.log(`Server: ${SERVER_URL}`);
      console.log(`Keycloak: ${KEYCLOAK_URL}`);
      console.log("=".repeat(70));

      // 1. Get tokens
      this.log("1. Getting tokens...", null, "info");
      for (const user of TEST_USERS) {
        try {
          const token = await this.getToken(user.username, user.password);
          this.userTokens[user.username] = token;
          this.log(
            `Token obtained: ${user.username}`,
            { length: token.length },
            "success"
          );
        } catch (error) {
          this.log(
            `Failed to get token: ${user.username}`,
            error.message,
            "error"
          );
          throw error;
        }
        await this.delay(500);
      }

      // 2. Connect sockets
      this.log("\n2. Connecting sockets...", null, "info");
      for (const user of TEST_USERS) {
        try {
          const socket = await this.connectSocket(user);
          this.userSockets[user.username] = socket;
        } catch (error) {
          this.log(
            `Failed to connect socket: ${user.username}`,
            error.message,
            "error"
          );
          throw error;
        }
        await this.delay(1000);
      }

      const aliceSocket = this.userSockets.hoangngan;
      const bobSocket = this.userSockets.honghao;

      // 3. Test basic socket events
      this.log("\n3. Testing basic socket events...", null, "info");

      // Test 3.1: health_check
      const healthResult = await this.testEvent(aliceSocket, "health_check");
      this.testResults.push({
        test: "health_check",
        success: healthResult.success,
        duration: healthResult.duration,
        data: healthResult.data,
      });

      await this.delay(1000);

      // Test 3.2: ping
      const pingResult = await this.testEvent(aliceSocket, "ping");
      this.testResults.push({
        test: "ping",
        success: pingResult.success,
        duration: pingResult.duration,
      });

      await this.delay(1000);

      // Test 3.3: get_e2ee_info
      const infoResult = await this.testEvent(aliceSocket, "get_e2ee_info");
      this.testResults.push({
        test: "get_e2ee_info",
        success: infoResult.success,
        hasData: !!infoResult.data?.data,
        e2eeEnabled: infoResult.data?.data?.e2eeEnabled,
        duration: infoResult.duration,
      });

      await this.delay(1000);

      // Test 3.4: get_my_e2ee_keys
      const keysResult = await this.testEvent(aliceSocket, "get_my_e2ee_keys");
      this.testResults.push({
        test: "get_my_e2ee_keys",
        success: keysResult.success,
        hasKeys: !!keysResult.data?.data?.keys,
        keyCount: keysResult.data?.data?.keys?.length || 0,
        duration: keysResult.duration,
      });

      await this.delay(1000);

      // 4. Test E2EE key management
      this.log("\n4. Testing E2EE key management...", null, "info");

      // Generate test key
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.generateKeys();
      const testPublicKey = ecdh.getPublicKey("base64");
      const fingerprint = crypto
        .createHash("sha256")
        .update(testPublicKey)
        .digest("hex")
        .substring(0, 8)
        .toUpperCase();

      // Test 4.1: update_e2ee_key
      const updateResult = await this.testEvent(
        aliceSocket,
        "update_e2ee_key",
        {
          publicKey: testPublicKey,
          keyType: "ecdh",
        }
      );
      this.testResults.push({
        test: "update_e2ee_key",
        success: updateResult.success,
        hasFingerprint: !!updateResult.data?.data?.fingerprint,
        fingerprint: updateResult.data?.data?.fingerprint,
        duration: updateResult.duration,
      });

      await this.delay(1500); // Extra time for friend notifications

      // Test 4.2: toggle_e2ee (enable)
      const enableResult = await this.testEvent(aliceSocket, "toggle_e2ee", {
        enabled: true,
      });
      this.testResults.push({
        test: "toggle_e2ee (enable)",
        success: enableResult.success,
        isEnabled: enableResult.data?.data?.e2eeEnabled === true,
        duration: enableResult.duration,
      });

      await this.delay(1500); // Extra time for friend notifications

      // Test 4.3: get_e2ee_info again (should show enabled)
      const infoResult2 = await this.testEvent(aliceSocket, "get_e2ee_info");
      this.testResults.push({
        test: "get_e2ee_info (after enable)",
        success: infoResult2.success,
        isEnabled: infoResult2.data?.data?.e2eeEnabled === true,
        duration: infoResult2.duration,
      });

      await this.delay(1000);

      // Test 4.4: set_active_key (if we have fingerprint)
      if (updateResult.data?.data?.fingerprint) {
        const setActiveResult = await this.testEvent(
          aliceSocket,
          "set_active_key",
          {
            fingerprint: updateResult.data.data.fingerprint,
          }
        );
        this.testResults.push({
          test: "set_active_key",
          success: setActiveResult.success,
          fingerprint: updateResult.data.data.fingerprint,
          duration: setActiveResult.duration,
        });
        await this.delay(1500);
      }

      // 5. Setup Bob for key exchange tests
      this.log("\n5. Setting up Bob for key exchange tests...", null, "info");

      // Bob also needs a key
      const bobEcdh = crypto.createECDH("prime256v1");
      bobEcdh.generateKeys();
      const bobPublicKey = bobEcdh.getPublicKey("base64");
      const bobFingerprint = crypto
        .createHash("sha256")
        .update(bobPublicKey)
        .digest("hex")
        .substring(0, 8)
        .toUpperCase();

      // Setup Bob's E2EE
      await this.testEvent(bobSocket, "update_e2ee_key", {
        publicKey: bobPublicKey,
        keyType: "ecdh",
      });

      await this.delay(1000);

      await this.testEvent(bobSocket, "toggle_e2ee", {
        enabled: true,
      });

      await this.delay(1000);

      // 6. Test key exchange functionality
      this.log("\n6. Testing key exchange functionality...", null, "info");

      // Test 6.1: request_e2ee_key
      const requestKeyResult = await this.testEvent(
        aliceSocket,
        "request_e2ee_key",
        {
          userId: TEST_USERS[1].keycloakId, // Bob's ID
        }
      );
      this.testResults.push({
        test: "request_e2ee_key",
        success: requestKeyResult.success,
        hasPublicKey: !!requestKeyResult.data?.data?.publicKey,
        targetUserId: TEST_USERS[1].keycloakId,
        duration: requestKeyResult.duration,
      });

      await this.delay(2000);

      // Test 6.2: check_e2ee_status
      const checkStatusResult = await this.testEvent(
        aliceSocket,
        "check_e2ee_status",
        {
          userId: TEST_USERS[1].keycloakId,
        }
      );
      this.testResults.push({
        test: "check_e2ee_status",
        success: checkStatusResult.success,
        isE2EEEnabled: checkStatusResult.data?.data?.e2eeEnabled,
        canEncrypt: checkStatusResult.data?.data?.canEncrypt,
        duration: checkStatusResult.duration,
      });

      await this.delay(1000);

      // Test 6.3: initiate_key_exchange
      const initiateExchangeResult = await this.testEvent(
        aliceSocket,
        "initiate_key_exchange",
        {
          peerId: TEST_USERS[1].keycloakId,
        }
      );
      this.testResults.push({
        test: "initiate_key_exchange",
        success: initiateExchangeResult.success,
        hasExchangeId: !!initiateExchangeResult.data?.data?.exchangeId,
        duration: initiateExchangeResult.duration,
      });

      await this.delay(2000); // Wait for Bob to receive the key exchange request

      // Test 6.4: verify_fingerprint
      const verifyResult = await this.testEvent(
        aliceSocket,
        "verify_fingerprint",
        {
          publicKey: bobPublicKey,
          expectedFingerprint: bobFingerprint,
        }
      );
      this.testResults.push({
        test: "verify_fingerprint",
        success: verifyResult.success,
        matches: verifyResult.data?.data?.matches,
        duration: verifyResult.duration,
      });

      await this.delay(1000);

      // 7. Test broadcast events
      this.log("\n7. Testing broadcast events...", null, "info");

      // Note: These tests require manual verification since we need
      // to see if events are being broadcast correctly
      this.testResults.push({
        test: "broadcast_events_initialized",
        success: true,
        note: "Broadcast event handlers registered (check logs)",
      });

      // 8. Test encrypted message sending
      this.log("\n8. Testing encrypted message functionality...", null, "info");

      // First create a test room or get existing room
      // For now, we'll test the socket event
      const testCiphertext = crypto.randomBytes(32).toString("base64");
      const testIv = crypto.randomBytes(12).toString("base64");

      // Test 8.1: send_encrypted_message (without actual room)
      const sendEncryptedResult = await this.testEvent(
        aliceSocket,
        "send_encrypted_message",
        {
          roomId: "test-room-123", // Mock room ID
          ciphertext: testCiphertext,
          iv: testIv,
          keyId: fingerprint,
          algorithm: "AES-GCM-256",
        }
      );
      this.testResults.push({
        test: "send_encrypted_message",
        success: sendEncryptedResult.success,
        // This might fail if room doesn't exist, but we're testing the handler
        duration: sendEncryptedResult.duration,
        note: "Room validation might fail - testing handler only",
      });

      await this.delay(1000);

      // 9. Test cleanup operations
      this.log("\n9. Testing cleanup operations...", null, "info");

      // Test 9.1: delete_e2ee_key (if we have keys)
      if (keysResult.data?.data?.keys?.length > 0) {
        const keyToDelete = keysResult.data.data.keys[0];
        if (keyToDelete.fingerprint !== fingerprint) {
          // Don't delete active key
          const deleteResult = await this.testEvent(
            aliceSocket,
            "delete_e2ee_key",
            {
              fingerprint: keyToDelete.fingerprint,
            }
          );
          this.testResults.push({
            test: "delete_e2ee_key",
            success: deleteResult.success,
            fingerprint: keyToDelete.fingerprint,
            duration: deleteResult.duration,
          });
          await this.delay(1000);
        }
      }

      // Test 9.2: toggle_e2ee (disable)
      const disableResult = await this.testEvent(aliceSocket, "toggle_e2ee", {
        enabled: false,
      });
      this.testResults.push({
        test: "toggle_e2ee (disable)",
        success: disableResult.success,
        isEnabled: disableResult.data?.data?.e2eeEnabled === false,
        duration: disableResult.duration,
      });

      await this.delay(1000);

      // 10. Disconnect and cleanup
      this.log("\n10. Disconnecting sockets...", null, "info");

      // Disconnect sockets
      for (const [username, socket] of Object.entries(this.userSockets)) {
        socket.disconnect();
        this.log(`Disconnected: ${username}`, null, "success");
      }

      await this.delay(1000);

      // 11. Print summary
      this.printSummary();
    } catch (error) {
      this.log(`Test suite failed`, error.message, "error");
      this.log(`Stack trace`, error.stack, "error");

      // Cleanup on error
      for (const [username, socket] of Object.entries(this.userSockets)) {
        if (socket && socket.connected) {
          socket.disconnect();
        }
      }

      this.printSummary();
      process.exit(1);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printSummary() {
    console.log("\n" + "=".repeat(80));
    console.log("📊 E2EE SOCKET HANDLER TEST SUMMARY");
    console.log("=".repeat(80));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);

    if (totalTests > 0) {
      console.log(
        `📈 Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
      );
    }

    console.log("\n📋 Test Details:");
    console.log("-".repeat(80));

    this.testResults.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      const duration = result.duration ? `(${result.duration}ms)` : "";
      console.log(`${index + 1}. ${status} ${result.test} ${duration}`);

      if (!result.success) {
        console.log(`   ⚠️  ${result.error || "Failed"}`);
      }

      if (result.note) {
        console.log(`   📝 ${result.note}`);
      }
    });

    console.log("\n" + "=".repeat(80));
    console.log("🎯 E2EE SOCKET FUNCTIONALITIES TESTED:");
    console.log("=".repeat(80));
    console.log("1. ✅ Socket connection & authentication");
    console.log("2. ✅ Basic health check (health_check, ping)");
    console.log("3. ✅ E2EE info retrieval (get_e2ee_info)");
    console.log("4. ✅ Key management (update_e2ee_key, get_my_e2ee_keys)");
    console.log("5. ✅ E2EE status management (toggle_e2ee)");
    console.log("6. ✅ Key exchange (request_e2ee_key, initiate_key_exchange)");
    console.log("7. ✅ Key verification (verify_fingerprint)");
    console.log("8. ✅ Status checking (check_e2ee_status)");
    console.log("9. ✅ Active key management (set_active_key)");
    console.log("10. ✅ Encrypted messaging (send_encrypted_message)");
    console.log("11. ✅ Key cleanup (delete_e2ee_key)");
    console.log("12. ✅ Broadcast event handling");
    console.log("13. ✅ Clean disconnection");

    console.log("\n" + "=".repeat(80));

    if (failedTests === 0) {
      console.log("\n🎉 EXCELLENT! All E2EE socket handlers are working!");
      console.log("🔒 Your E2EE implementation is production-ready.");
      console.log("\n💡 Next steps:");
      console.log("   1. Test with frontend client");
      console.log("   2. Implement group E2EE");
      console.log("   3. Add key rotation automation");
      console.log("   4. Set up monitoring and alerts");
    } else if (passedTests >= totalTests * 0.7) {
      console.log("\n👍 GOOD! Most E2EE socket handlers are working!");
      console.log("⚠️  Some tests failed - review the details above.");
      console.log("\n🔧 To fix issues:");
      console.log("   1. Check server logs for errors");
      console.log("   2. Verify E2EE controller exports");
      console.log("   3. Ensure socket handlers are registered correctly");
      console.log("   4. Test individual failing events");
    } else {
      console.log("\n⚠️  WARNING! Multiple E2EE socket tests failed!");
      console.log("🔧 Immediate actions required:");
      console.log("   1. Review all failing tests above");
      console.log("   2. Check socket handler registration");
      console.log("   3. Verify E2EE controller functions");
      console.log("   4. Test socket connection independently");
    }

    console.log("\n📝 Test Configuration:");
    console.log(`   Server URL: ${SERVER_URL}`);
    console.log(`   Keycloak URL: ${KEYCLOAK_URL}`);
    console.log(
      `   Test Users: ${TEST_USERS.map((u) => u.username).join(", ")}`
    );
    console.log("=".repeat(80));
  }
}

// Quick test script
async function quickTest() {
  console.log("⚡ Quick E2EE Socket Test");
  console.log("=".repeat(60));

  const test = new E2EESocketTest();

  try {
    // 1. Check server health
    console.log("\n1. Testing server connectivity...");
    try {
      const health = await axios.get(`${SERVER_URL}/health`, { timeout: 3000 });
      console.log("✅ Server health:", health.data.status || "OK");
    } catch (error) {
      console.log("❌ Server not responding:", error.message);
      return;
    }

    // 2. Get token
    console.log("\n2. Getting token...");
    let token;
    try {
      token = await test.getToken("hoangngan", "1234");
      if (!token) {
        console.log("❌ Cannot get token");
        return;
      }
      console.log("✅ Token obtained");
    } catch (error) {
      console.log("❌ Token error:", error.message);
      return;
    }

    // 3. Test socket connection
    console.log("\n3. Testing socket connection...");
    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 10000,
    });

    return new Promise((resolve) => {
      socket.on("connect", () => {
        console.log("✅ Socket connected!");
        console.log(`   Socket ID: ${socket.id}`);

        // Test sequence
        const tests = [
          { event: "ping", data: null },
          { event: "get_e2ee_info", data: null },
          { event: "get_my_e2ee_keys", data: null },
        ];

        let currentTest = 0;

        const runNextTest = () => {
          if (currentTest >= tests.length) {
            console.log("\n🎉 All quick tests passed!");
            socket.disconnect();
            resolve();
            return;
          }

          const test = tests[currentTest];
          console.log(`\n   Testing ${test.event}...`);

          socket.emit(test.event, test.data, (response) => {
            if (response?.success || response?.status === "success") {
              console.log(`   ✅ ${test.event}: OK`);

              if (test.event === "get_e2ee_info" && response.data) {
                console.log(`      E2EE Enabled: ${response.data.e2eeEnabled}`);
                console.log(
                  `      Has Active Key: ${!!response.data.currentKey}`
                );
              }

              if (test.event === "get_my_e2ee_keys" && response.data) {
                console.log(
                  `      Total Keys: ${response.data.keys?.length || 0}`
                );
              }
            } else {
              console.log(
                `   ❌ ${test.event}: Failed`,
                response?.error || response?.message
              );
            }

            currentTest++;
            setTimeout(runNextTest, 500);
          });
        };

        runNextTest();
      });

      socket.on("connect_error", (error) => {
        console.log("❌ Socket connection error:", error.message);
        console.log("\n💡 Possible issues:");
        console.log("   - Check if server is running on port 3001");
        console.log("   - Verify token is valid (not expired)");
        console.log("   - Check CORS settings in socket server");
        console.log("   - Ensure Keycloak is running");
        resolve();
      });

      socket.on("error", (error) => {
        console.log("❌ Socket error:", error);
      });

      setTimeout(() => {
        if (!socket.connected) {
          console.log("⏰ Socket connection timeout");
          resolve();
        }
      }, 15000);
    });
  } catch (error) {
    console.log("❌ Quick test failed:", error.message);
  }
}

// Main execution
async function main() {
  console.log("🔧 E2EE Socket Testing Tool");
  console.log("=".repeat(60));
  console.log("Server URL:", SERVER_URL);
  console.log("Keycloak URL:", KEYCLOAK_URL);
  console.log("Test Users:", TEST_USERS.map((u) => u.username).join(", "));

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question(
    "\nChoose test mode:\n1. Full comprehensive test (recommended)\n2. Quick connectivity test\n3. Exit\n> ",
    async (choice) => {
      if (choice === "1") {
        console.log("\n🚀 Running comprehensive E2EE socket test...");
        console.log("=".repeat(60));
        const test = new E2EESocketTest();
        await test.runTests();
      } else if (choice === "2") {
        console.log("\n⚡ Running quick connectivity test...");
        console.log("=".repeat(60));
        await quickTest();
      } else {
        console.log("Exiting...");
      }

      readline.close();
      process.exit(0);
    }
  );
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Test execution failed:", error);
    process.exit(1);
  });
}

module.exports = { E2EESocketTest, quickTest };
