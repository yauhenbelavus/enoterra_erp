module.exports = {
  apps: [
    {
      name: 'enoterra_erp',
      script: 'server/index.js',
      cwd: '/home/username/public_html',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/home/username/logs/enoterra_erp_error.log',
      out_file: '/home/username/logs/enoterra_erp_out.log',
      log_file: '/home/username/logs/enoterra_erp_combined.log',
      time: true
    }
  ]
}; 