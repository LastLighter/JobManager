// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'my-next-app',
    script: 'pnpm',
    args: 'start',
    cwd: '/root/JobManager', // 替换为你的实际路径
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: '4G', // 根据服务器内存调整
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    env: {
      NODE_ENV: 'production'
    }
  }]
};