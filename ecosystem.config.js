// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'my-next-app',
    script: './node_modules/.bin/next', // 直接指向 next 可执行文件
    args: 'start',
    cwd: '/root/JobManager',
    instances: 1,
    exec_mode: 'fork', // 必须用 fork，Next.js 不兼容 cluster
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: '4G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    env: {
      NODE_ENV: 'production'
    },
    // 可选：指定 Node.js 路径（如果你用 nvm）
    // interpreter: '/root/.nvm/versions/node/v22.21.1/bin/node'
  }]
};