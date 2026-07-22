// `cwd` is a FIXED path, not the directory this file happens to live in -
// `/var/www/applica-current` is a symlink the deploy pipeline repoints
// atomically at the newly-built release directory only AFTER the build
// succeeds (see .github/workflows/deploy.yml). Before this, `npm run build`
// ran in place inside the SAME `.next` the live process was reading from,
// which broke real requests mid-deploy (real 2026-07-21 incident: "Cannot
// find module .../setup-node-env.external.js", "Failed to find Server
// Action" - confirmed in prod logs, not hypothetical). PM2 re-reads `cwd`
// from this file on every `pm2 restart ecosystem.config.js`, so each deploy
// picks up whatever `current` points to at restart time.
const CWD = '/var/www/applica-current';

module.exports = {
  apps: [
    {
      name: 'applica-web',
      script: 'npm',
      args: 'run start',
      cwd: CWD,
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
      cwd: CWD,
      instances: 1, // Only 1 worker instance to avoid duplicate job claims if not handled well
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PATH: '/root/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        // Real bug found in QA (2026-07-21): assisted-apply launches a HEADFUL
        // browser (see docs/APPLY-ENGINE.md §4/§5) - on this headless Linux
        // VPS that always crashed ("Missing X server or $DISPLAY") and the
        // worker silently reverted the application back to pending_review
        // with zero trace (no error, no applicationSubmissions row) - looked
        // exactly like nothing had happened. Xvfb (systemd service, :99) now
        // provides a virtual display for headful Chromium to render into.
        DISPLAY: ':99'
      }
    }
  ]
};
