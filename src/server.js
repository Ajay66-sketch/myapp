// src/server.js
// Entry point - sets up Express, Socket.io, and connects to MongoDB

require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');
// require('./workers/aiWorker'); // Initialize the async AI worker (disabled for UI demo)
// require('./workers/notificationWorker'); // Initialize the notification worker (disabled for UI demo)

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

const serverInstance = server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const gracefulShutdown = () => {
  console.log('🛑 Received shutdown signal. Closing server...');
  
  serverInstance.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
      }
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force close after 10s
  setTimeout(() => {
    console.error('Forcing server down after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
