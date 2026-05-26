#!/usr/bin/env bash
# scripts/disaster-recovery.sh
# Enterprise Disaster Recovery (DR) playbook automation script

set -euo pipefail

DB_NAME="${MONGO_DB_NAME:-scholar-prod}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/$DB_NAME}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-scholar-super-secret-backup-passphrase-2026}"
S3_BUCKET="${BACKUP_S3_BUCKET:-scholar-backups-bucket}"
RECOVERY_DIR="/tmp/mongodb-recovery"

echo "====== STARTING DISASTER RECOVERY PLAYBOOK SUITE ======"

# 1. Initialize environment
mkdir -p "${RECOVERY_DIR}"

# 2. Check for targeted backup archive or download latest
TARGET_ARCHIVE=""
if [ $# -gt 0 ]; then
  TARGET_ARCHIVE="$1"
  echo "Target restore archive manually specified: ${TARGET_ARCHIVE}"
else
  echo "Fetching latest backup listings from s3://${S3_BUCKET}..."
  if command -v aws &> /dev/null; then
    LATEST_S3_PATH=$(aws s3 ls "s3://${S3_BUCKET}/" | sort | tail -n 1 | awk '{print $4}')
    if [ -n "${LATEST_S3_PATH}" ]; then
      echo "Latest backup located: ${LATEST_S3_PATH}. Downloading..."
      aws s3 cp "s3://${S3_BUCKET}/${LATEST_S3_PATH}" "${RECOVERY_DIR}/${LATEST_S3_PATH}"
      TARGET_ARCHIVE="${RECOVERY_DIR}/${LATEST_S3_PATH}"
    fi
  else
    echo "⚠️ AWS CLI not available. Searching local /tmp/mongodb-backups directory for simulations..."
    LATEST_LOCAL=$(find /tmp/mongodb-backups -name "*.archive.gpg" 2>/dev/null | sort | tail -n 1 || true)
    if [ -n "${LATEST_LOCAL}" ] && [ -f "${LATEST_LOCAL}" ]; then
      echo "Local simulation backup found: ${LATEST_LOCAL}"
      TARGET_ARCHIVE="${LATEST_LOCAL}"
    else
      echo "❌ No backup archive found to restore. DR terminated."
      exit 1
    fi
  fi
fi

# 3. Decrypt the archive
DECRYPTED_ARCHIVE="${RECOVERY_DIR}/decrypted_recovery.archive"
echo "Decrypting backup archive: ${TARGET_ARCHIVE}..."
gpg --batch --yes --decrypt --passphrase "${PASSPHRASE}" \
    --output "${DECRYPTED_ARCHIVE}" \
    "${TARGET_ARCHIVE}"
echo "✅ Decryption succeeded."

# 4. Perform mongorestore
echo "Running mongorestore from decrypted archive..."
mongorestore --uri="${MONGO_URI}" --archive="${DECRYPTED_ARCHIVE}" --gzip --drop
echo "✅ Database restore finished."

# 5. Validate Replica Set connection and health status
echo "Verifying MongoDB connection and replica set health..."
if command -v mongosh &> /dev/null; then
  mongosh "${MONGO_URI}" --eval "db.adminCommand({ ping: 1 })"
  mongosh "${MONGO_URI}" --eval "rs.status()" || echo "⚠️ Replica set not initialized or single node instance. Ping check passed."
else
  echo "⚠️ mongosh shell not found. Database restoration complete."
fi

# 6. Cleanup
rm -f "${DECRYPTED_ARCHIVE}"
echo "====== DISASTER RECOVERY RESTORATION COMPLETE ======"
