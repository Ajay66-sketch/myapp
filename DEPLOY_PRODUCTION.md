# Scholar Platform: Staging & Production Deployment Manual

This document outlines the architecture, prerequisites, environment variables, step-by-step deploy procedures, and SRE-grade validation verification steps to deploy our realtime SaaS platform to staging and production.

---

## 🏛️ Production Architecture Overview

The system uses a decoupled, container-native or Node-runtime hybrid deployment topology optimized for cost-efficiency and horizontal scaling:

```
                  ┌────────────────────────┐
                  │   DNS / HTTPS (CDN)    │
                  └───────────┬────────────┘
                              ▼
                  ┌────────────────────────┐
                  │    Load Balancer /     │
                  │ Sticky-Session Proxy   │
                  └───────────┬────────────┘
                              ▼
        ┌──────────────────────────────────────────┐
        │  Managed Web & Worker Compute Cluster    │
        │                                          │
        │   ┌──────────────────────────────────┐   │
        │   │    Web Service (API & Sockets)   │   │
        │   │    - Scaling: Sticky sessions    │   │
        │   └────────────────┬─────────────────┘   │
        │                    │ (BullMQ Jobs)       │
        │                    ▼                     │
        │   ┌──────────────────────────────────┐   │
        │   │    Worker Service (BullMQ Core)  │   │
        │   │    - Scaling: Queue concurrency  │   │
        │   └──────────────────────────────────┘   │
        └────────────────────┬─────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌────────────────────────┐        ┌────────────────────────┐
│  Managed MongoDB Atlas │        │      Managed Redis     │
│  (Database Replica)    │        │  (Caching & Adapter)   │
└────────────────────────┘        └────────────────────────┘
```

---

## 📋 Pre-deployment Requirements

### 1. Managed Databases
- **MongoDB Atlas**: Set up an M0/M10 multi-region replica set.
- **Redis (Managed)**: Set up a managed Redis cluster or single node (e.g. Railway Redis, Render Redis, Upstash, or Aiven) with TLS enabled.

### 2. DNS & TLS
- Setup custom domains: `api.scholarplatform.com` and `app.scholarplatform.com`.
- Setup Let's Encrypt or Cloudflare HTTPS certificates.

---

## 🔑 Environment Variable Audit Checklist

The server runs strict pre-flight gates on boot. The server **WILL CRASH IMMEDIATELY** if any mandatory variable below is missing or insecure when `NODE_ENV=production` or `NODE_ENV=staging`.

| Category | Variable | Required | Staging Default | Production Recommendation | Description |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **System** | `NODE_ENV` | Yes | `staging` | `production` | Enforces environment profiles. |
| **System** | `PORT` | Yes | `5000` | `5000` | Process binding port. |
| **Database** | `MONGO_URI` | Yes | *Atlas Staging URI* | *Atlas Production URI* | MongoDB Atlas connection string. |
| **Database** | `MONGO_POOL_SIZE`| No | `30` | `50` | Max connection pool sizes. |
| **Cache** | `REDIS_URL` | Yes | *Redis Staging URL* | *Redis Production URL* | TLS connection string. |
| **Security** | `JWT_SECRET` | Yes | *Min 32 Char Cryptic*| `openssl rand -base64 32` | JWT authentication signature key. |
| **Security** | `CORS_ALLOWED_ORIGINS`| Yes | `http://localhost,http://staging.myapp.com` | `https://scholarplatform.com` | Restrictive CORS domain allowlist. |
| **Security** | `CLIENT_URL` | Yes | `http://staging.myapp.com` | `https://scholarplatform.com` | Primary client app URL redirect point. |
| **Security** | `COOKIE_SECURE` | No | `true` | `true` | Enforces HTTPS cookie transmission. |
| **Security** | `DISABLE_CSRF` | No | `false` | `false` | Stateless double-submit cookie gate. |
| **Security** | `TRUST_PROXIES` | No | `1` | `1` | Configures Express trust proxy headers. |
| **Billing** | `RAZORPAY_KEY_ID` | Yes | `rzp_test_...` | `rzp_live_...` | Razorpay Key ID. |
| **Billing** | `RAZORPAY_KEY_SECRET`| Yes | `sk_test_...` | `sk_live_...` | Razorpay Key Secret. |
| **Billing** | `RAZORPAY_WEBHOOK_SECRET`| Yes | `whsec_...` | `whsec_...` | Razorpay Webhook signature verification key. |
| **Billing** | `RAZORPAY_MONTHLY_PRICE`| Yes | `500` | `500` | Monthly price amount. |
| **Billing** | `RAZORPAY_YEARLY_PRICE`| Yes | `5000` | `5000` | Yearly price amount. |

---

## 🚀 Step-by-Step Deploy Guide

### Option A: Railway (Recommended)
1. **Install Railway CLI**: `npm i -g @railway/cli`
2. **Login to Railway**: `railway login`
3. **Link to Project**: `railway link`
4. **Provision Redis & MongoDB Variables**:
   Set `MONGO_URI` and `REDIS_URL` in the Railway service settings.
5. **Set Environment Profiles**: Set variables exactly as outlined in the audit checklist.
6. **Trigger Deployment**:
   ```bash
   railway up
   ```
7. Railway will read `railway.json`, build using Nixpacks, run `npm install`, start `node src/server.js`, and verify `/api/health` before scaling traffic.

### Option B: Render Deployment
1. **Register blueprint**: Link your GitHub repository to Render.
2. **Apply Blueprint**: Render will discover `render.yaml` automatically.
3. **Fill Secret Mappings**:
   Go to your Render Dashboard -> Blueprints -> select this repository -> populate secret variables.
4. **Trigger Blueprint Deploy**: Render will provision the **Web Service** (`scholar-api-prod`) and the **Background Worker** (`scholar-worker-prod`).
5. Render handles zero-downtime rolling updates and routes traffic only when the new container passes the `/api/health` probe.

---

## 🩺 SRE Post-Deployment Validation

Always run the automated smoke test immediately after a deploy:
```bash
# Set variables and query the target server
PORT=5000 node scripts/smoke-test.js
```

### 1. Manual Health Endpoint Query
```bash
curl -i https://api.scholarplatform.com/api/health
```
- Expected status code: `200 OK`
- Confirm `systems.mongodb.status` is `"connected"`
- Confirm `systems.redis.status` is `"connected"`
- Confirm `systems.websocket.status` is `"active"`

### 2. HTTPS & Secure Cookies Verification
Verify that response headers contain `secure` and `HttpOnly`:
```bash
curl -i -X POST https://api.scholarplatform.com/api/v1/auth/login
```
Check response headers:
- `set-cookie: accessToken=...; Max-Age=900; Path=/; Secure; HttpOnly; SameSite=Strict`

### 3. Restrictive CORS Verification
```bash
curl -i -H "Origin: https://malicious.com" https://api.scholarplatform.com/api/v1/auth/me
```
- Expected outcome: The response should reject or omit `Access-Control-Allow-Origin: https://malicious.com`.

### 4. WebSocket Sticky Session Handshake
Verify that Socket.IO upgrades successfully over HTTPS:
```bash
curl -i "https://api.scholarplatform.com/socket.io/?EIO=4&transport=polling"
```
- Expected status code: `200 OK` with JSON handshake session ID.

---

## 🛑 EMERGENCY ROLLBACK INSTRUCTIONS

If automated smoke tests fail or SRE latency rules trigger alerts (e.g. p95 > 1.5s):

### 1. Render Rollback
1. Open the **Render Dashboard**.
2. Select the `scholar-api-prod` service.
3. Navigate to **Deployments**.
4. Find the previous deployment labeled "Passed" and click **Rollback to this deploy**.

### 2. Railway Rollback
1. Open **Railway Console**.
2. Click on the backend service block.
3. Navigate to **Deployments**.
4. Click on the 3 dots next to the previously active, stable deployment, and select **Redeploy**.

### 3. Git Command Line Fail-safe
If hosting automatic deploy-on-push is enabled:
```bash
git checkout v1.2.0-stable # Stable tag
git push origin main --force
```
This forces the webhook to rebuild and redeploy the previously verified stable tag!
