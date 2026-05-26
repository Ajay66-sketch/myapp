// src/socketServer.js
// Standalone persistent realtime server for Socket.IO

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initSocket } = require('./socket');
const connectDB = require('./config/db');

const env = require('./config/env');
const PORT = process.env.SOCKET_PORT || 6000;
const allowedOrigins = env.getSocketAllowedOrigins();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Realtime socket server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

env.validateSocketEnv();
console.log(`Socket server allowed origins: ${allowedOrigins.join(', ')}`);
console.log(`Socket client URL: ${env.getSocketOrigin()}`);
console.log(`API URL: ${env.getApiOrigin()}`);

if (process.env.MONGO_URI) {
  connectDB();
} else {
  console.warn('⚠️ MongoDB disabled for realtime server (MONGO_URI not set). Running without database.');
}

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Realtime Socket.IO server running on port ${PORT}`);
  console.log('Socket.IO transport configured: websocket + polling');
});

const gracefulShutdown = () => {
  console.log('🛑 Received shutdown signal. Closing realtime server...');
  server.close(() => {
    console.log('Realtime HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forcing realtime server down after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
