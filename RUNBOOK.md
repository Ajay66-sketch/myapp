# SRE Maintenance and Operations Runbook

This runbook documents routine administrative procedures, database operations, credential rotations, scaling plans, and maintenance guidelines.

---

## 💾 1. Database Backups

MongoDB Atlas automatically manages hourly backups, but we maintain a GPG-encrypted S3 backup workflow for disaster recovery.

### Running Manual Symmetric-Encrypted Backups
The `scripts/backup-mongodb.sh` script automates dumping the replica set, encrypting the output with AES256 via GPG, and uploading it to an S3-compatible bucket.

```bash
# Set necessary environment overrides and run the backup script
MONGO_URI="your-production-mongodb-connection-string" \
BACKUP_ENCRYPTION_PASSPHRASE="highly-cryptic-passphrase-key" \
BACKUP_S3_BUCKET="scholar-backups-bucket" \
./scripts/backup-mongodb.sh
```

- **Cron Schedule (SaaS Staging/Production)**: Run this script daily at `02:00 UTC` via Kubernetes CronJob or Render Cron task:
  `0 2 * * * /home/node/app/scripts/backup-mongodb.sh`

---

## 🔄 2. Disaster Recovery & Restores

In the event of a critical server corruption or database data loss, run the disaster recovery playbook script:

```bash
# Run disaster recovery targeting a specific archive, or let it fetch the latest from S3
MONGO_URI="your-production-mongodb-connection-string" \
BACKUP_ENCRYPTION_PASSPHRASE="highly-cryptic-passphrase-key" \
BACKUP_S3_BUCKET="scholar-backups-bucket" \
./scripts/disaster-recovery.sh [optional-specific-archive-s3-path]
```

- **Safety Warning**: The restore script runs with `--drop` which will drop collection tables in your target DB before writing restored data! Verify the target URI double-submit coordinates before initiating.

---

## 🔐 3. Secret and Credential Rotation

Rotate secrets every **90 days** or immediately following any suspected team credential leakage.

### A. JWT Secret Rotation (Zero-Downtime)
1. **Prepare New Secret**: Generate a new secure 256-bit cryptographically strong secret:
   ```bash
   openssl rand -base64 32
   ```
2. **Double-Signing Verification (Optional)**: If you rotate `JWT_SECRET` instantly, all active users will be logged out because their current tokens cannot be verified. To prevent this, our authentication system is configured to gracefully fallback:
   - Apply the new secret as `JWT_SECRET`.
   - Keep the old secret in `JWT_SECRET_FALLBACK` (if configured) so existing tokens are validated until they expire (15-minute token TTL).
3. **Apply and Restart**: Apply variables in Railway/Render dashboard and trigger a rolling update restart.

### B. Stripe Webhook Signing Key Rotation
If Stripe rotates your webhook webhook keys:
1. Navigate to the **Stripe Dashboard -> Developers -> Webhooks**.
2. Click on the production webhook URL, then click **Rotate Secret**.
3. Copy the new secret string (`whsec_...`).
4. Update `STRIPE_WEBHOOK_SECRET` in Render/Railway dashboard env variables.
5. Trigger a rolling redeploy.

---

## 📈 4. Horizontal Pod and Process Scaling

Our platform scales web servers and worker processes independently to maintain high performance at a low infrastructure cost.

### Web Server Scaling (API & Sockets)
Scale the Web Service when:
- CPU utilization is consistently **> 70%** over 10 minutes.
- Memory consumption consistently **> 75%** of container allocation.
- **Sticky Session (IP Hashing)** MUST be enabled at the load balancer level, so Socket.IO connection polling connects to the same container instance.

### BullMQ Worker Scaling
Scale the Worker Service when:
- The `telemetryQueue` or `aiTutorQueue` has a delay queue size consistently **> 500 jobs**.
- Winston logs print: `[BullMQ] Worker overloaded, delaying jobs`.
- Workers do NOT require sticky sessions and can be scaled linearly.

---

## 🛠️ 5. Zero-Downtime Schema Migrations

Always follow the **Expand and Contract Pattern** when writing database schema updates.

1. **Step 1 (Expand)**: Deploy code that supports BOTH the old and new schema fields.
2. **Step 2 (Migrate Data)**: Run an async data migration task to update historical records.
3. **Step 3 (Contract)**: Deploy code that strictly uses the new schema, and run database scripts to drop old deprecated fields.
