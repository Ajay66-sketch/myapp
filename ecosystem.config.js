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
    },
    {
      name: 'study-worker-orchestrator',
      script: 'src/workers/index.js',
      instances: 1,              // Scaled horizontally via thread loops or additional containers
      exec_mode: 'fork',         // Stateful workers run in single process fork mode
      watch: false,
      max_memory_restart: '1.5G',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
