// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'my-next-app',
    script: 'pnpm',              // 👈 关键：使用 pnpm
    args: 'run start',           // 👈 执行 pnpm run start
    cwd: '/root/JobManager',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: '4G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    env: {
      NODE_ENV: 'production'
    }
  }]
};