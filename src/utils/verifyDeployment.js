// src/utils/verifyDeployment.js
// Production configuration and deployment template integrity validator

const fs = require('fs');
const path = require('path');

function verifyNginxConfig() {
  console.log('Validating Nginx load balancer configuration...');
  const nginxPath = path.join(__dirname, '../../nginx/nginx.conf');
  
  if (!fs.existsSync(nginxPath)) {
    throw new Error('Nginx configuration file missing at nginx/nginx.conf');
  }
  
  const content = fs.readFileSync(nginxPath, 'utf8');
  if (!content.includes('upstream backend_cluster') || !content.includes('ip_hash')) {
    throw new Error('Nginx load balancer config is missing sticky-session configurations');
  }
  if (!content.includes('proxy_set_header Upgrade $http_upgrade') || !content.includes('Connection "upgrade"')) {
    throw new Error('Nginx configuration is missing WebSocket upgrade parameters');
  }
  console.log('✅ Nginx configuration conforms to production standards.');
}

function verifyPm2Clustering() {
  console.log('Validating PM2 Process Cluster ecosystem configuration...');
  const pm2Path = path.join(__dirname, '../../ecosystem.config.js');
  
  if (!fs.existsSync(pm2Path)) {
    throw new Error('PM2 ecosystem configuration missing at ecosystem.config.js');
  }
  
  const config = require(pm2Path);
  if (!config.apps || !Array.isArray(config.apps) || config.apps.length === 0) {
    throw new Error('Invalid PM2 config structure');
  }
  
  const app = config.apps[0];
  if (app.exec_mode !== 'cluster') {
    throw new Error('PM2 must be configured in cluster mode for horizontal scaling');
  }
  console.log('✅ PM2 process cluster configurations are production-ready.');
}

function verifyDockerCompose() {
  console.log('Validating Docker Compose container orchestration configurations...');
  const composePath = path.join(__dirname, '../../docker-compose.yml');
  
  if (!fs.existsSync(composePath)) {
    throw new Error('Docker Compose configuration file missing at docker-compose.yml');
  }
  
  const content = fs.readFileSync(composePath, 'utf8');
  if (!content.includes('redis:') || !content.includes('mongodb:') || !content.includes('backend:')) {
    throw new Error('Docker compose is missing key required microservices');
  }
  if (!content.includes('healthcheck:') || !content.includes('condition: service_healthy')) {
    throw new Error('Docker Compose orchestration is missing dependency health gates');
  }
  console.log('✅ Docker Compose orchestration configuration verified.');
}

function runDeploymentVerification() {
  try {
    verifyNginxConfig();
    verifyPm2Clustering();
    verifyDockerCompose();
    console.log('\n🌟 Production deployment templates validated successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Deployment configuration validation failed:', err.message);
    process.exit(1);
  }
}

runDeploymentVerification();
