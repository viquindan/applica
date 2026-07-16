module.exports = {
  apps: [
    {
      name: 'applica-web',
      script: 'npm',
      args: 'run start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PATH: '/root/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    },
    {
      name: 'applica-worker',
      script: 'npx',
      // scripts/startWorker.ts loads .env.local BEFORE importing the worker
      // (see its own header comment) - `next start` gets .env.local for free
      // from Next's runtime, but a raw `tsx src/core/jobs/worker.ts` under
      // PM2 does not, which silently left DATABASE_URL undefined and broke
      // every DB query the worker made (SASL/password errors) since the
      // first production deploy.
      args: 'tsx scripts/startWorker.ts',
      instances: 1, // Only 1 worker instance to avoid duplicate job claims if not handled well
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PATH: '/root/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    }
  ]
};
