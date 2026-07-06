/**
 * Standalone launcher for the background worker. Loads .env.local BEFORE the
 * worker (and its db/client) are imported, avoiding the ESM import-hoisting
 * issue that leaves DATABASE_URL unset when run via tsx.
 *
 * Run: npx tsx scripts/startWorker.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

// Keep the worker alive through errors thrown inside job handlers. Node kills the
// process on an unhandled rejection/exception by default, which silently took the
// worker down mid-session (so clicking "Abrir y aplicar" queued a job with nobody
// to run it). Log and keep running instead - a single bad apply must not stop the
// whole queue.
process.on('unhandledRejection', (reason) => {
  console.error('[startWorker] Unhandled rejection (worker stays up):', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[startWorker] Uncaught exception (worker stays up):', err?.stack ?? err);
});

async function main() {
  const { startWorkers } = await import('../src/core/jobs/worker');
  await startWorkers();
  console.log('[startWorker] Worker is running. Press Ctrl+C to stop.');
}

main().catch((err) => { console.error('[startWorker] Fatal on startup:', err); process.exit(1); });
