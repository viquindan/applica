module.exports = {
  apps: [
    {
      name: 'applica-web',
      script: 'npm',
      args: 'run start',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PATH: '/root/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    },
    {
      name: 'applica-worker',
      script: 'npx',
      args: 'tsx src/core/jobs/worker.ts',
      instances: 1, // Only 1 worker instance to avoid duplicate job claims if not handled well
      env: {
        NODE_ENV: 'production',
        PATH: '/root/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    }
  ]
};
