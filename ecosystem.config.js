// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'my-next-app',
    script: '/root/.local/share/pnpm/pnpm', // 使用 pnpm 的绝对路径
    args: 'run start',
    interpreter: 'bash', // 👈 强制用 bash 执行
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