// src/config/db.js
// MongoDB connection using Mongoose

const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.log('   [MongoDB] Not configured. Starting with in-memory storage.');
    return false;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: process.env.MONGO_POOL_SIZE || 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`   ✅ MongoDB connected: ${conn.connection.host}`);
    return conn.connection.host;
  } catch (error) {
    console.log(`   [MongoDB] Connection unavailable: ${error.message}`);
    console.log('   [MongoDB] Continuing with in-memory storage.');
    return false;
  }
};

module.exports = connectDB;
