/**
 * Global AI rate limiter + retry.
 *
 * The Google free tier caps gemini at ~20 requests/minute. A single search
 * fans out into many calls (CV tailoring + cover letter + tailored answers per
 * vacancy), which bursts past that limit and fails generations. This serializes
 * AI calls, spaces them under the limit, and retries on quota/429 errors using
 * the API's own "retry in Ns" hint - so the worker degrades to "slower" instead
 * of "failed" while on the free tier.
 *
 * Tunables (env): AI_MIN_INTERVAL_MS (default 3500 ≈ 17/min), AI_MAX_RETRIES (4),
 * AI_CALL_TIMEOUT_MS (default 120000).
 */

const MIN_INTERVAL_MS = Number(process.env.AI_MIN_INTERVAL_MS ?? 3500);
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES ?? 2);
const MAX_BACKOFF_MS = 20_000;
const CALL_TIMEOUT_MS = Number(process.env.AI_CALL_TIMEOUT_MS ?? 120_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastStart = 0;
// A promise chain that serializes every AI call across the process.
let chain: Promise<unknown> = Promise.resolve();

function isRateLimitError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /quota|rate.?limit|\b429\b|exceeded|too many requests|resource exhausted/i.test(msg);
}

function backoffMs(err: unknown, attempt: number): number {
  const msg = String((err as any)?.message ?? err ?? '');
  const m = msg.match(/retry in ([\d.]+)\s*s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 750, MAX_BACKOFF_MS);
  // Exponential fallback: 5s, 10s, 20s, 40s…
  return Math.min(5000 * 2 ** attempt, MAX_BACKOFF_MS);
}

class AiCallTimeoutError extends Error {
  constructor(ms: number) {
    super(`AI call timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'AiCallTimeoutError';
  }
}

// A hung HTTP request (socket open, provider never responds) would otherwise
// freeze `chain` forever and deadlock every AI consumer in the process - the
// worker then sits at 0% CPU with no logs until manually restarted. The
// underlying request may linger after the race, but the chain stays live.
function withTimeout<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiCallTimeoutError(CALL_TIMEOUT_MS)), CALL_TIMEOUT_MS);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Run an AI call through the global limiter: serialized, spaced to stay under the
 * per-minute cap, retried on quota/429 errors, and hard-capped in duration so a
 * hung request can never deadlock the chain. Non-rate-limit errors bubble up
 * immediately. Resolves/rejects exactly like `fn`.
 */
export function withAiRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = MIN_INTERVAL_MS - (Date.now() - lastStart);
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      try {
        return await withTimeout(fn);
      } catch (err) {
        const timedOut = err instanceof AiCallTimeoutError;
        if ((!timedOut && !isRateLimitError(err)) || attempt >= MAX_RETRIES) throw err;
        const delay = timedOut ? 1000 : backoffMs(err, attempt);
        console.warn(
          timedOut
            ? `[AI limiter] call hung >${Math.round(CALL_TIMEOUT_MS / 1000)}s; retrying (attempt ${attempt + 1}/${MAX_RETRIES}).`
            : `[AI limiter] rate limited; retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES}).`,
        );
        await sleep(delay);
      }
    }
  };
  // Serialize: each call waits for the previous one to finish before starting.
  const result = chain.then(run, run);
  chain = result.then(() => undefined, () => undefined);
  return result;
}
