#!/usr/bin/env bash
# scripts/backup-mongodb.sh
# Enterprise automated encrypted MongoDB backup script

set -euo pipefail

# Configurations
DB_NAME="${MONGO_DB_NAME:-scholar-prod}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/$DB_NAME}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-scholar-super-secret-backup-passphrase-2026}"
S3_BUCKET="${BACKUP_S3_BUCKET:-scholar-backups-bucket}"
BACKUP_DIR="/tmp/mongodb-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${DB_NAME}_backup_${TIMESTAMP}"

echo "Starting automated MongoDB encrypted backup process..."

# 1. Create temporary directory
mkdir -p "${BACKUP_DIR}"

# 2. Perform mongodump
echo "Running mongodump for database: ${DB_NAME}..."
mongodump --uri="${MONGO_URI}" --archive="${BACKUP_DIR}/${BACKUP_NAME}.archive" --gzip

# 3. Encrypt the backup via GPG symmetric encryption
echo "Encrypting backup archive using GPG symmetric encryption..."
gpg --batch --yes --symmetric --passphrase "${PASSPHRASE}" \
    --cipher-algo AES256 \
    --output "${BACKUP_DIR}/${BACKUP_NAME}.archive.gpg" \
    "${BACKUP_DIR}/${BACKUP_NAME}.archive"

# 4. Upload to S3 (S3-compatible API compatible)
echo "Uploading encrypted backup to S3-compatible bucket: s3://${S3_BUCKET}/${BACKUP_NAME}.archive.gpg..."
if command -v aws &> /dev/null; then
  aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}.archive.gpg" "s3://${S3_BUCKET}/${BACKUP_NAME}.archive.gpg"
  echo "✅ Upload completed successfully via AWS CLI."
else
  echo "⚠️ AWS CLI not installed. Simulation mode: file created locally at ${BACKUP_DIR}/${BACKUP_NAME}.archive.gpg"
fi

# 5. Clean up local unencrypted archive
rm -f "${BACKUP_DIR}/${BACKUP_NAME}.archive"
echo "✅ Backup process finished. Cleaned up raw archive files."
