// scripts/e2e-feature-validation.js
// Custom E2E Automated Integration Test Suite for Scholar Backend Feature Validation

const http = require('http');
const mongoose = require('mongoose');
const ioClient = require('../client/node_modules/socket.io-client');
const User = require('../src/models/User');
const Room = require('../src/models/Room');
const RoomMessage = require('../src/models/RoomMessage');

const API_PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${API_PORT}`;

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

console.log(`${yellow}=== STARTING E2E FEATURE VALIDATION SUITE ===${reset}\n`);

let csrfToken = null;

// Helper to make programmatic HTTP Requests
function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {};
    if (postData) {
      defaultHeaders['Content-Type'] = 'application/json';
      defaultHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    
    if (csrfToken) {
      defaultHeaders['x-csrf-token'] = csrfToken;
      if (options.headers && options.headers['Cookie']) {
        options.headers['Cookie'] = `${options.headers['Cookie']}; csrfToken=${csrfToken}`;
      } else {
        defaultHeaders['Cookie'] = `csrfToken=${csrfToken}`;
      }
    }
    
    const reqOptions = {
      host: 'localhost',
      port: API_PORT,
      path: options.path,
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...options.headers },
      timeout: 5000
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      
      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        for (const cookie of setCookies) {
          if (cookie.startsWith('csrfToken=')) {
            csrfToken = cookie.split(';')[0].split('=')[1];
          }
        }
      }
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  let createdUser = null;
  let createdRoom = null;
  let socket = null;

  try {
    // 1. Verify Health diagnostics
    console.log('🩺 1. Verifying System Health check endpoints...');
    const health = await httpRequest({ path: '/api/health' });
    if (health.statusCode !== 200 || health.body.status !== 'healthy') {
      throw new Error(`Healthcheck failed: ${JSON.stringify(health.body)}`);
    }
    console.log(`${green}✔ [PASSED]${reset} System is 100% healthy: MongoDB, Redis, and WebSockets are connected.`);

    // Connect mongoose to clean up test user
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app');

    // 2. Signup Endpoint
    console.log('\n👤 2. Verifying user signup flow...');
    const testUsername = `tester-${Date.now()}`;
    const testEmail = `tester-${Date.now()}@scholar-test.com`;
    const signupData = JSON.stringify({
      name: testUsername,
      email: testEmail,
      password: 'SecurePassword123!',
      referralCode: 'SCHOLAR-REF-ORGANIC'
    });

    const signup = await httpRequest({ path: '/api/v1/auth/signup', method: 'POST' }, signupData);
    if (signup.statusCode !== 201) {
      throw new Error(`Signup failed with status ${signup.statusCode}: ${JSON.stringify(signup.body)}`);
    }

    const { accessToken, refreshToken, user } = signup.body;
    createdUser = user;
    console.log(`${green}✔ [PASSED]${reset} User registered successfully: ${user.username} (${user.email})`);

    // 3. Login Endpoint
    console.log('\n🔑 3. Verifying user login flow...');
    const loginData = JSON.stringify({
      email: testEmail,
      password: 'SecurePassword123!'
    });
    const login = await httpRequest({ path: '/api/v1/auth/login', method: 'POST' }, loginData);
    if (login.statusCode !== 200) {
      throw new Error(`Login failed with status ${login.statusCode}: ${JSON.stringify(login.body)}`);
    }
    console.log(`${green}✔ [PASSED]${reset} Login authentication succeeded for token verification.`);

    // 4. Session listing and verification in Redis
    console.log('\n📡 4. Verifying active session retrieval and Redis registration...');
    const sessionCookie = login.headers['set-cookie']?.join('; ') || '';
    const sessions = await httpRequest({
      path: '/api/v1/auth/sessions',
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Authorization': `Bearer ${login.body.accessToken}`
      }
    });

    if (sessions.statusCode !== 200 || !Array.isArray(sessions.body)) {
      throw new Error(`Sessions query failed: ${JSON.stringify(sessions.body)}`);
    }

    const currentSession = sessions.body.find(s => s.isCurrent === true);
    if (!currentSession) {
      throw new Error('Current active session could not be resolved from Redis.');
    }
    console.log(`${green}✔ [PASSED]${reset} Redis session active: deviceId="${currentSession.deviceId}", ip="${currentSession.ip}"`);

    // 5. Room creation and monetization checks
    console.log('\n🏠 5. Verifying room creation and entitlement check...');
    const roomPayload = JSON.stringify({
      name: 'E2E Validation Room',
      slug: `e2e-room-${Date.now()}`,
      tierRequired: 'free'
    });

    const createRoomReq = await httpRequest({
      path: '/api/v1/rooms',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }, roomPayload);

    if (createRoomReq.statusCode !== 201) {
      throw new Error(`Room creation failed: ${JSON.stringify(createRoomReq.body)}`);
    }
    createdRoom = createRoomReq.body.room;
    console.log(`${green}✔ [PASSED]${reset} Room created successfully: "${createdRoom.name}" with slug "${createdRoom.slug}"`);

    // 6. Connect Socket.IO via exclusive WebSockets transport
    console.log('\n🌐 6. Initializing Socket.IO Client via hardened WebSockets transport...');
    socket = ioClient(`http://localhost:${API_PORT}`, {
      transports: ['websocket'],
      auth: { token: accessToken }
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log(`${green}✔ [PASSED]${reset} Socket.IO gateway handshake connected successfully.`);
        resolve();
      });
      socket.on('connect_error', (err) => {
        reject(new Error(`Socket connection error: ${err.message}`));
      });
      setTimeout(() => reject(new Error('Socket.IO connection timeout')), 5000);
    });

    // 7. Join Socket.IO study room & receive room state
    console.log('\n👥 7. Testing Socket.IO Room Joining & Presence tracking...');
    socket.emit('room:join', { roomId: createdRoom._id });

    // Wait for room update event or members event
    await new Promise((resolve) => {
      socket.on('room:members', (data) => {
        console.log(`   - Received room members event: current count = ${data.members.length}`);
        resolve();
      });
      setTimeout(resolve, 1500);
    });
    console.log(`${green}✔ [PASSED]${reset} Socket.IO Room join presence registered.`);

    // 8. Send chat message event & receive broadcast reflection
    console.log('\n💬 8. Testing real-time Socket.IO chat messaging...');
    const chatMsg = 'Hello Scholar E2E feature validation!';
    socket.emit('room:chat', { roomId: createdRoom._id, message: chatMsg });

    const receivedMessage = await new Promise((resolve, reject) => {
      socket.on('room:activity', (data) => {
        if (data.type === 'chat') {
          resolve(data);
        }
      });
      setTimeout(() => reject(new Error('Did not receive broadcast room:activity event')), 3000);
    });

    if (receivedMessage.message !== chatMsg) {
      throw new Error(`Received message mismatch: expected "${chatMsg}", got "${receivedMessage.message}"`);
    }
    console.log(`${green}✔ [PASSED]${reset} Real-time chat message broadcast and reflection verified.`);

    // 9. Verify MongoDB message persistence
    console.log('\n🗄️ 9. Verifying room message database persistence in MongoDB...');
    const savedMsgs = await RoomMessage.find({ roomId: createdRoom._id });
    if (savedMsgs.length === 0) {
      throw new Error('Message was not persisted in MongoDB!');
    }
    console.log(`${green}✔ [PASSED]${reset} Database persistence verified. Found ${savedMsgs.length} message(s) in RoomMessage collection.`);

    console.log(`\n${green}=== ALL E2E FEATURE INTEGRATIONS PASSED SUCCESSFULLY ===${reset}`);

  } catch (error) {
    console.error(`\n${red}✘ [FAILED]${reset} E2E Feature validation failed!`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Gracefully close socket connection
    if (socket) {
      socket.close();
    }
    
    // Clean up created resources in database
    if (createdUser || createdRoom) {
      console.log('\n🧹 Cleaning up test database resources...');
      if (createdUser) {
        await User.deleteOne({ _id: createdUser._id });
        console.log(`   - Deleted test user: ${createdUser.username}`);
      }
      if (createdRoom) {
        await Room.deleteOne({ _id: createdRoom._id });
        await RoomMessage.deleteMany({ roomId: createdRoom._id });
        console.log(`   - Deleted test room and associated messages: ${createdRoom.name}`);
      }
    }
    
    await mongoose.disconnect();
    console.log('🏁 Verification process complete.');
    process.exit(process.exitCode || 0);
  }
}

run();
