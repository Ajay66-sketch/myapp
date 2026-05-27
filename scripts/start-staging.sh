#!/bin/bash
# scripts/start-staging.sh
# Staging High-Resilience Entrypoint Script
# Performs strict dependency pre-flight checks before booting the system in staging mode

set -e

echo "====================================================="
echo "🚧 INITIATING STAGING BOOTSTRAP SEQUENCE"
echo "====================================================="

export NODE_ENV=staging

# 1. Run Pre-flight probes
echo "🔍 Step 1: Performing SRE Connection Probes..."
node -e "
const connectDB = require('./src/config/db');
const { getRedisClient } = require('./src/config/redisClient');

async function runProbes() {
  console.log('   - Probe: Testing MongoDB Staging Connection...');
  const mongoHost = await connectDB().catch(err => {
    console.error('   ❌ Probe Failed: MongoDB Connection Crash:', err.message);
    return null;
  });
  if (!mongoHost) {
    process.exit(1);
  }

  console.log('   - Probe: Testing Redis Staging Connection...');
  const redis = getRedisClient();
  if (!redis) {
    console.error('   ❌ Probe Failed: Redis initialization failed');
    process.exit(1);
  }

  // Await connection status
  await new Promise((resolve, reject) => {
    if (redis.status === 'ready') return resolve();
    redis.once('ready', resolve);
    redis.once('error', reject);
    setTimeout(() => reject(new Error('Redis connection timed out after 5000ms')), 5000);
  }).catch(err => {
    console.error('   ❌ Probe Failed:', err.message);
    process.exit(1);
  });

  console.log('   ✅ All pre-flight database and connection checks passed.');
  process.exit(0);
}
runProbes();
"

# 2. Dynamic execution path based on PROCESS_TYPE
if [ "$PROCESS_TYPE" = "worker" ]; then
  echo "📦 Step 2: Booting background [BULLMQ WORKER] process in STAGING..."
  exec node src/workers/index.js
elif [ "$PROCESS_TYPE" = "socket" ]; then
  echo "📦 Step 2: Booting decoupled [SOCKET SERVER] process in STAGING..."
  exec node src/socketServer.js
else
  echo "📦 Step 2: Booting core [EXPRESS WEB + SOCKET SERVER] monolith in STAGING..."
  exec node src/server.js
fi
