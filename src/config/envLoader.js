// src/config/envLoader.js
// Centralized environment loader supporting base configurations and mode-specific overrides

const path = require('path');
const dotenv = require('dotenv');

if (!global.__envLoaded) {
  global.__envLoaded = true;

  // Preserve initial OS environment variables to guarantee their precedence
  const originalEnv = { ...process.env };

  const rootDir = path.resolve(__dirname, '../..');

  // 1. Load base .env file using absolute path
  dotenv.config({
    path: path.resolve(rootDir, '.env')
  });

  // 2. Default to development if not explicitly configured
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
  }

  // 3. Load mode-specific overrides (override base variables)
  const envFile = `.env.${process.env.NODE_ENV}`;
  const envPath = path.resolve(rootDir, envFile);
  
  dotenv.config({
    path: envPath,
    override: true
  });

  // 4. Restore original OS environment variables to preserve OS precedence
  for (const key of Object.keys(originalEnv)) {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key];
    }
  }

  console.log(`📡 [EnvLoader] Loaded base configuration & overrides from ${envFile} (Mode: ${process.env.NODE_ENV.toUpperCase()})`);
}

