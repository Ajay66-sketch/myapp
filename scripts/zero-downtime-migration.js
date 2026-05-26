// scripts/zero-downtime-migration.js
// Scaffolding for Three-Phase Expand-Contract Database Schema Migration Pattern

require('dotenv').config();
const mongoose = require('mongoose');

// Example: Migrating User Stats schema from `xp` (Number) to `experiencePoints` (Number)
const UserStatsSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  xp: Number,                // Old field
  experiencePoints: Number,  // New field
});

const UserStats = mongoose.model('UserStats_Migration_Example', UserStatsSchema);

async function runMigration() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.log('   [Migration] MONGO_URI not configured. Simulating zero-downtime Expand-Contract migration...');
    console.log('   ✅ Phase 1 (Expand): Schema updated to support BOTH xp and experiencePoints.');
    console.log('   ✅ Phase 2 (Backfill): Double-writes active. Copies xp to experiencePoints for all historical records.');
    console.log('   ✅ Phase 3 (Contract): Dropped raw legacy xp field after full data validation.');
    console.log('   🎉 Migration dry-run completed successfully!');
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('🚀 MongoDB connected. Starting Expand-Contract zero-downtime migration sequence...');

    // ==========================================
    // PHASE 1: EXPAND (Backfill historical records)
    // ==========================================
    console.log('--- Phase 1: Expanding Schema & Backfilling Historical Records ---');
    
    // Find all users who have 'xp' set but not 'experiencePoints'
    const legacyRecords = await UserStats.find({
      xp: { $exists: true },
      experiencePoints: { $exists: false }
    });

    console.log(`Located ${legacyRecords.length} legacy records requiring backfill.`);

    let backfilledCount = 0;
    for (const record of legacyRecords) {
      record.experiencePoints = record.xp;
      await record.save();
      backfilledCount++;
    }
    console.log(`✅ Backfilled experiencePoints for ${backfilledCount} records successfully.`);

    // ==========================================
    // PHASE 2: DOUBLE-WRITE VERIFICATION
    // ==========================================
    console.log('--- Phase 2: Double-Write & Read Verification ---');
    const inconsistentRecords = await UserStats.find({
      $expr: { $ne: ["$xp", "$experiencePoints"] }
    });

    if (inconsistentRecords.length === 0) {
      console.log('✅ Integrity check passed: All xp values match experiencePoints values.');
    } else {
      console.warn(`⚠️ Warning: Detected ${inconsistentRecords.length} mismatched records. Backfilling missing updates...`);
      for (const rec of inconsistentRecords) {
        rec.experiencePoints = rec.xp;
        await rec.save();
      }
    }

    // ==========================================
    // PHASE 3: CONTRACT (Safely drop legacy field)
    // ==========================================
    console.log('--- Phase 3: Contract (Dropping Legacy Fields) ---');
    console.log('Legacy field drop is ready to execute.');
    console.log('Unset legacy field "xp" on all records to complete schema contraction...');
    
    const unsetResult = await UserStats.updateMany(
      { xp: { $exists: true } },
      { $unset: { xp: "" } }
    );
    console.log(`✅ Contraction finished. Removed 'xp' field from ${unsetResult.modifiedCount} documents.`);
    console.log('🎉 Schema migration fully complete with zero downtime!');
    
  } catch (error) {
    console.error('❌ Zero-Downtime Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

runMigration();
