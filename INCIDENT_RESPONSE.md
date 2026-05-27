# SRE Incident Response Playbook

This playbook provides standard operating procedures for detecting, triaging, mitigating, and resolving production incidents on our platform.

---

## 🚨 Incident Severity Classifications

| Severity | Impact | Description | SLO Resolution |
| :--- | :--- | :--- | :--- |
| **SEV-1** | **Critical Outage** | Main platform down. API offline, WebSockets rejecting connections, or payments blocked. | **< 30 minutes** |
| **SEV-2** | **Degraded Service**| Degradation of non-blocking features (e.g. latency > 1.5s, AI tutor slow response, Sockets dropping occasionally). | **< 2 hours** |
| **SEV-3** | **Minor Anomaly**  | Administrative interface anomalies, minor telemetry errors, or non-user facing issues. | **< 24 hours** |

---

## 🧭 Triage Sequence Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  1. DETECT   │ ───> │  2. CONTAIN  │ ───> │ 3. MITIGATE  │ ───> │  4. RESOLVE  │
│  Alerts/SLAs │      │ Isolate Bug  │      │ Redeploy/Scale │      │ Root Cause   │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

---

## 🛠️ Emergency Incident Runbooks

### Incident 1: MongoDB Database Connection Failures (SEV-1)

#### 1. Symptoms
- HTTP `/api/health` returns status `503` with `systems.mongodb.status = "offline"`.
- Winston logs print: `❌ [MongoDB] Connection failed` or `❌ [FATAL] MongoDB is offline`.

#### 2. Triage & Actions
1. **Check Atlas Status**:
   Visit [MongoDB Atlas Status](https://status.mongodb.com/) to confirm if it is an upstream cloud outage.
2. **Verify Whitelist IP**:
   If you recently redeployed or scaled the cluster, verify that the application server's outbound NAT/IP addresses are still allowed in the Atlas Security IP Whitelist panel.
3. **Verify Pool Expiry**:
   If connection pools are exhausted, scale up Atlas instances or decrease `MONGO_POOL_SIZE` temporarily to release connections.
4. **Emergency Restart**:
   Restart the API server container to release any stale network sockets.

---

### Incident 2: Redis Client Outages or Reconnect Storms (SEV-1/SEV-2)

#### 1. Symptoms
- HTTP `/api/health` returns `503` with `systems.redis.healthy = false`.
- Telemetry logs emit `redis:down` event: `[Redis Client Error]: Connection lost`.
- BullMQ queue metrics show `bullMqActive = false`.

#### 2. Triage & Actions
1. **Check CPU metrics**:
   High Redis CPU (e.g. due to intensive Lua scripts or key scans) will trigger connection drops.
2. **Mitigate Redis Reconnect storms**:
   Our tuned `productionRetryStrategy` implements a maximum backoff wait of 10 seconds to avoid crashing the server.
3. **Increase Pool limits**:
   Verify if the Redis provider has run out of client connection handles.
4. **Emergency Switch**:
   If Redis cannot recover, adjust `REDIS_URL` to a fallback replica node or reboot the Redis instance in your cloud dashboard.

---

### Incident 3: WebSocket Scaling/Disconnection Storms (SEV-2)

#### 1. Symptoms
- Socket.IO client connections dropping rapidly.
- p95 latency rises dramatically.
- Express server memory leaks or process crashes (`unhandledException: memory limit exceeded`).

#### 2. Triage & Actions
1. **Verify Redis Adapter**:
   Ensure `socket.js` is successfully using the `@socket.io/redis-adapter` for multi-node message passing. If the adapter is failing, the nodes cannot coordinate timer broadcasts.
2. **Check Sticky Sessions**:
   Confirm that your hosting router (Render or Cloudflare) has **Sticky Sessions (IP Hashing)** enabled. Without sticky sessions, Socket.IO polling handshakes will fail with `Session ID unknown` errors.
3. **Scale Web Instances**:
   If memory RSS exceeds 80% capacity, provision an additional container block in your Render/Railway dashboards.

---

### Incident 4: Stripe Webhook Delivery Processing Failures (SEV-2)

#### 1. Symptoms
- Customers complain subscriptions are paid but focus levels are not upgraded.
- Express logs print: `Webhook signature verification failed`.

#### 2. Triage & Actions
1. **Verify raw body parser**:
   Ensure `express.json` is saving raw buffers in `req.rawBody` for webhook requests (configured in `src/app.js`).
2. **Verify secret integrity**:
   Confirm that the `STRIPE_WEBHOOK_SECRET` in environment variables matches the secret in the Stripe Dashboard Webhook configuration. If Stripe rotated the webhook secret, update it immediately.
3. **Simulate a delivery**:
   Use Stripe CLI to resend:
   ```bash
   stripe trigger customer.subscription.created --api-key sk_test_...
   ```

---

## 📢 Emergency Communications Templates

During a SEV-1 incident, communications must be sent within **15 minutes** of detection.

### 1. Internal Team Alert (Slack/Teams)
```
🚨 SEV-1 INCIDENT ALERT
Incident: [Describe issue, e.g. API Gateway responding with 503 errors]
Impact: [e.g. Users unable to log in or sync timers]
Lead SRE: [Your Name]
Triage Bridge: [Zoom link]
Dashboard: [Render/Prometheus link]
```

### 2. External Customer Notice (Status Page)
```
Title: Investigating Core API Disruptions
Body: We are actively investigating issues causing API gateway timeout errors. Our engineering team is currently triaging the managed database clusters. Real-time synchronizations might be temporarily degraded.
Update (15m later): We have isolated a degraded managed cache node and are initiating a failover. Further updates will follow shortly.
```
