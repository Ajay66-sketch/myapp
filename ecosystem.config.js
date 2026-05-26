// ecosystem.config.js
// Enterprise clustering and zero-downtime reload ecosystem config for PM2

module.exports = {
  apps: [
    {
      name: 'study-backend-cluster',
      script: 'src/server.js',
      instances: 'max',          // Autoscale to max physical/logical CPU cores
      exec_mode: 'cluster',      // Horizontal scaling cluster mode
      watch: false,
      max_memory_restart: '1G',  // Prevent process memory leaks
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
