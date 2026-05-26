// src/config/status.js
// System status tracking - centralized state and metrics for all backend systems

const status = {
  auth: {
    loaded: false,
    message: 'Auth system not initialized',
  },
  socket: {
    loaded: false,
    message: 'Socket.IO not initialized',
  },
  database: {
    mode: process.env.MONGO_URI ? 'mongodb' : 'memory',
    connected: false,
    message: process.env.MONGO_URI ? 'MongoDB connection pending' : 'Using in-memory storage (dev mode)',
  },
  redis: {
    enabled: Boolean(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT),
    connected: false,
    message: process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT
      ? 'Redis connection pending'
      : 'Redis not configured',
  },
};

const metrics = {
  websocket: {
    activeConnections: 0,
    eventsReceived: 0,
    eventsSent: 0,
    connectsCount: 0,
    disconnectsCount: 0,
  }
};

const setAuthLoaded = () => {
  status.auth.loaded = true;
  status.auth.message = 'Auth system ready';
};

const setSocketLoaded = () => {
  status.socket.loaded = true;
  status.socket.message = 'Socket.IO initialized';
};

const setDatabaseConnected = (connected, host = null) => {
  status.database.connected = connected;
  if (connected) {
    status.database.message = `Connected to MongoDB at ${host || 'unknown host'}`;
  } else if (status.database.mode === 'mongodb') {
    status.database.message = 'MongoDB unavailable - using in-memory fallback';
    status.database.mode = 'memory';
  } else {
    status.database.message = 'Using in-memory storage (dev mode)';
  }
};

const setRedisConnected = (connected) => {
  status.redis.connected = connected;
  if (connected) {
    status.redis.message = 'Redis connected and enabled';
  } else if (status.redis.enabled) {
    status.redis.message = 'Redis disabled or unavailable (optional dep, continuing without)';
  } else {
    status.redis.message = 'Redis not configured';
  }
};

const recordSocketConnect = (activeCount) => {
  metrics.websocket.activeConnections = activeCount;
  metrics.websocket.connectsCount += 1;
};

const recordSocketDisconnect = (activeCount) => {
  metrics.websocket.activeConnections = activeCount;
  metrics.websocket.disconnectsCount += 1;
};

const recordSocketEventReceived = () => {
  metrics.websocket.eventsReceived += 1;
};

const recordSocketEventSent = () => {
  metrics.websocket.eventsSent += 1;
};

const getStatus = () => {
  const memory = process.memoryUsage();
  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round((memory.rss / 1024 / 1024) * 100) / 100} MB`,
      heapTotal: `${Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100} MB`,
      heapUsed: `${Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100} MB`,
      external: `${Math.round((memory.external / 1024 / 1024) * 100) / 100} MB`,
    },
    systems: status,
    metrics,
  };
};

module.exports = {
  setAuthLoaded,
  setSocketLoaded,
  setDatabaseConnected,
  setRedisConnected,
  recordSocketConnect,
  recordSocketDisconnect,
  recordSocketEventReceived,
  recordSocketEventSent,
  getStatus,
};
