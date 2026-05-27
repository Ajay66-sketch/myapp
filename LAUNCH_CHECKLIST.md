# Operational Launch Checklist: Preparing for Paying Users

This checklist compiles all critical pre-flight verification gates and operational readiness markers required to transition the Scholar platform to an active production sandbox.

---

## 🔒 1. Security & Secrets Management
- [ ] **Rotate Production Secrets**:
  - `JWT_SECRET` must be set to a cryptographically secure 32+ character key.
  - Set production-safe `COOKIE_SECRET` and secure double-submit CSRF cookie configurations.
- [ ] **Verify Transport Security**: Enforce HTTPS redirects at proxy boundary gateways (`nginx`/`cloudflare`).
- [ ] **CORS Origins Audit**: Restrict `CLIENT_URL` strictly to trusted domains (e.g. `https://scholar.antigravity.io`), removing all wildcard `*` fallback routes.
- [ ] **Enforce Process Fail-Safes**: Zod schema environment validation (`src/config/env.js`) must be active, causing the process to crash instantly (exit code 1) on missing secrets.

---

## 💳 2. Billing & Stripe Integrations
- [ ] **Stripe Production Secret Keys**: Transition from `sk_test_*` and `pk_test_*` credentials to active production credentials.
- [ ] **Webhooks Registration**:
  - Register the staging and production webhook endpoint URLs (e.g. `https://api.scholar.antigravity.io/v1/billing/webhook`) inside the Stripe developers dashboard.
  - Subscribe to events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`.
- [ ] **Webhook Signature Verification**: Securely record and validation match `STRIPE_WEBHOOK_SECRET` keys.
- [ ] **Billing Grace Cycles**: Verify grace intervals (7-day period for failed payments) trigger automated email notifications before final Pro tier revocation.

---

## ⚙️ 3. Infrastructure & Resilience
- [ ] **Database Connection Pool Tuning**: Verify connection limits for cloud MongoDB Atlas cluster (configured in `src/config/db.js` with `maxPoolSize: 50` and write concerns).
- [ ] **Redis High Availability**: Verify connection backoff timeout retries are active, keeping BullMQ background workers robust to temporary reconnection storms.
- [ ] **Concurrency Sizing**: Scale WebSocket (`scholar-websocket`) and BullMQ background workers (`scholar-workers`) horizontally in separate Kubernetes namespaces or container instances.

---

## 📊 4. Observability & SRE Metrics
- [ ] **Prometheus Alert Manager**:
  - Set Service Uptime alert rule to notify administrators if services fall offline.
  - Set p95 Latency SLA alert threshold at 1.5 seconds.
  - Set 5xx Error SLA threshold alerting at >1% in 5-minute intervals.
- [ ] **Cohort & Revenue Logs**: Access administrative dashboards weekly to trace Monthly Recurring Revenue (MRR), subscriber churn rates, and cumulative AI gross margin metrics.
- [ ] **Transactional Email Logs**: Inspect `emails-log.json` weekly to audit delivery of onboarding welcomes, payment recoveries, and trial ending guides.
