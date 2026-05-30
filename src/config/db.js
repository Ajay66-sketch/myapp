// src/config/db.js
// MongoDB connection configuration with strict production pre-boot validation and auto-reconnect enforcements

const mongoose = require('mongoose');

const connectDB = async () => {
  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  if (!process.env.MONGO_URI) {
    if (isProdOrStaging) {
      console.error('❌ [FATAL] MONGO_URI is missing in production/staging! Refusing startup to prevent split-brain states.');
      process.exit(1);
    }
    console.log('   [MongoDB] Not configured. Starting with local in-memory storage.');
    return false;
  }

  try {
    const mongoOptions = {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '50', 10),
      minPoolSize: isProdOrStaging ? 10 : 2, // Retain hot connection pool in production/staging
      serverSelectionTimeoutMS: 5000, // Fail fast during startup checks
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      heartbeatFrequencyMS: isProdOrStaging ? 10000 : 30000, // Keep connection hot
    };

    if (isProdOrStaging) {
      mongoOptions.readPreference = 'secondaryPreferred';
      mongoOptions.autoIndex = false; // Disable auto indexing to prevent errors on read-replica
      mongoOptions.autoCreate = false; // Disable auto collection creation to prevent errors on read-replica
    } else {
      // In local development/testing, omit or set to primary to allow autoIndex and autoCreate on standalone Mongo
      mongoOptions.autoIndex = true;
      mongoOptions.autoCreate = true;
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, mongoOptions);
    
    console.log(`   ✅ MongoDB connected: ${conn.connection.host}`);
    return conn.connection.host;
  } catch (error) {
    console.error(`❌ [MongoDB] Connection failed: ${error.message}`);
    
    if (isProdOrStaging) {
      console.error('❌ [FATAL] MongoDB is offline during production/staging startup! Refusing server boot.');
      process.exit(1);
    }

    console.log('   [MongoDB] Continuing with local in-memory storage fallback.');
    return false;
  }
};

module.exports = connectDB;
