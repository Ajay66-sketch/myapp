# Production Deployment Playbook & Architecture Guide

Welcome to the production deployment guide for the realtime student productivity SaaS platform. This document outlines local, containerized, and cloud setups, highlighting the architecture and step-by-step procedures to build, deploy, scale, and monitor the unified application.

---

## System Architecture Diagram

```mermaid
graph TD
    Client[Web Browser / Socket.IO Client] -->|HTTP / HTTPS / WSS| Nginx[Nginx Reverse Proxy Gateway]
    
    subgraph Container Stack (Docker Network)
        Nginx -->|SPA Static Assets| Frontend[Vite Frontend Server]
        Nginx -->|/api REST & /socket.io WSS (Sticky Sessions ip_hash)| Backend[Node.js Clustered Backend]
        Backend -->|Redis Socket.IO Adapter| Redis[(Redis Caching & PubSub Broker)]
        Backend -->|Database Pool Connection| Mongo[(MongoDB Instance)]
    end
```

---

## 1. Environment Configurations

We maintain distinct environment presets for seamless deployment transitions. Copy the matching template before running the application:

| File Template | Target Environment | Key Configuration Presets |
| :--- | :--- | :--- |
| `.env.development` | Local Development | In-memory fallbacks enabled, CSRF disabled, dev-unsafe keys, CORS open. |
| `.env.staging` | Staging Release | Enabled CSRF, lax cookies, strict CORS checks, MongoDB pool (30). |
| `.env.production` | Live Production | Secure & httpOnly strict cookies, strict CORS, PM2 clustering active, MongoDB pool (50). |

---

## 2. Local Bare-Metal Startup

### Initial Setup
Ensure Node.js v20+ is installed on your local machine.

```bash
# 1. Install dependencies across both backend and client workspaces
npm install
cd client && npm install && cd ..

# 2. Select your environment template (e.g., Development)
cp .env.development .env
cp client/.env.development client/.env
```

### Dev Command Reference

*   **Run Backend & Frontend Concurrently:**
    ```bash
    npm run dev:all
    ```
*   **Run Backend API + Websocket server only:**
    ```bash
    npm run server
    ```
*   **Run Frontend Vite dev server only:**
    ```bash
    cd client && npm run dev
    ```

---

## 3. Containerized Deployment (Docker Compose)

Our containerized architecture offers isolated runtimes for all modules, utilizing Alpine-based micro-images.

### A. High-Speed Local Development Stack
Spin up the hot-reloading development cluster. Code modifications in `/src` or `/client` automatically reload in the running containers without requiring rebuilds:

```bash
docker-compose -f docker-compose.dev.yml up --build
```
*   **Frontend Access:** `http://localhost:3000`
*   **Backend Access:** `http://localhost:5000/api/v1`

### B. Hardened Production Stack
Boot the production-grade cluster, featuring multi-stage builds, MongoDB & Redis health probes, static-serving client Nginx container, and the sticky reverse proxy gateway:

```bash
docker-compose -f docker-compose.yml up -d --build
```
*   **Production Gateway Access:** `http://localhost` (Nginx reverse proxy handles routing automatically)

---

## 4. VPS Production Deployment (PM2 + Systemd + Nginx)

For Virtual Private Servers (AWS EC2, DigitalOcean, Linode, Hetzner) running Ubuntu/Debian.

### A. Install PM2 and Node.js
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### B. Configure Backend Clustering (PM2)
Our deployment incorporates an `ecosystem.config.js` configuration which launches Express and Socket.IO inside a high-speed logical cluster, utilizing all available CPU cores:

```bash
# Start backend in cluster mode
pm2 start ecosystem.config.js --env production

# Setup PM2 autostart on system boot
pm2 startup systemd
pm2 save
```

#### Zero-Downtime Hot Reloading
When updating production code, run a rolling restart so no socket connections or HTTP requests are dropped:
```bash
pm2 reload myapp-backend
```

### C. Nginx Reverse Proxy Setup (VPS)
Install Nginx and mount our custom reverse proxy rules to handle sticky Socket.IO routing:

```bash
sudo apt-get update && sudo apt-get install -y nginx

# Backup default nginx configs
sudo mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak

# Copy our optimized nginx configuration file
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo systemctl restart nginx
```

### D. Secure SSL Certificates (Let's Encrypt + Certbot)
Harden all client connections with secure TLS/HTTPS:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 5. Serverless & PaaS Deployment (Render / Railway / Heroku)

Because Render and Railway run ephemeral/stateless instances, you must isolate the WebSocket server from the serverless API.

### API Server Setup
*   **Entry Script:** `src/server.js` (Express REST only)
*   **Platform:** Render Web Service or Railway Service.
*   **Environment Variables required:** `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`.

### Standalone Realtime WebSocket Server Setup
*   **Entry Script:** `src/socketServer.js` (Standalone WSS server)
*   **Platform:** Render Web Service or Railway Service (ensure persistent disk is NOT required).
*   **Environment Variables required:**
    *   `SOCKET_PORT=6000`
    *   `REDIS_URL` (mandatory to synchronize room states across scaling server instances)
    *   `MONGO_URI`
    *   `CLIENT_URL` (CORS safety checking)

---

## 6. Live Uptime Observability & Diagnostics

We provide a comprehensive telemetry system exposed at the health endpoint `/api/health`.

### A. Health Payload Output Example
```json
{
  "status": "healthy",
  "timestamp": "2026-05-24T16:15:38Z",
  "uptime": 3600.45,
  "memory": {
    "rss": "54.12 MB",
    "heapTotal": "28.45 MB",
    "heapUsed": "18.32 MB",
    "external": "1.05 MB"
  },
  "systems": {
    "auth": { "loaded": true, "message": "Auth system ready" },
    "socket": { "loaded": true, "message": "Socket.IO initialized" },
    "database": { "mode": "mongodb", "connected": true, "message": "Connected to MongoDB" },
    "redis": { "enabled": true, "connected": true, "message": "Redis connected" }
  },
  "metrics": {
    "websocket": {
      "activeConnections": 156,
      "eventsReceived": 8945,
      "eventsSent": 18234,
      "connectsCount": 240,
      "disconnectsCount": 84
    }
  }
}
```

### B. Trigger Uptime Diagnostic Verification
Run our custom compiler smoke test programmatically to verify server initialization and JSON telemetry completeness:
```bash
npm test
```
