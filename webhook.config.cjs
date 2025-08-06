module.exports = {
  apps: [
    {
      name: 'enoterra-webhook',
      script: './webhook_deploy.js',
      cwd: '/home/root/enoterra_erp',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/home/root/enoterra_erp/logs/webhook-error.log',
      out_file: '/home/root/enoterra_erp/logs/webhook-out.log',
      log_file: '/home/root/enoterra_erp/logs/webhook-combined.log'
    }
  ]
};