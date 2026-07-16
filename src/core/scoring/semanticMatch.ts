import { getInternalAiConfig } from '../ai/config';

/**
 * Phase 2b of relevance: an OPTIONAL embeddings-based semantic re-ranker.
 *
 * Keyword/synonym matching still misses paraphrases the synonym table doesn't
 * cover. For *borderline* candidates only (cost control), we compare the user's
 * background against the job text via embedding cosine similarity and nudge the
 * score up or down.
 *
 * Safety:
 * - Disabled unless ENABLE_SEMANTIC_RERANK === 'true'.
 * - Returns a no-op ({ adjustment: 0 }) on any failure or missing API key, so
 * it can never break or block the search pipeline.
 * - Sends profile + job text to the configured embeddings provider (Google),
 * so it only runs when the operator has explicitly opted in.
 */

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

// How far from the materials threshold a score must be to be worth an API call.
const BORDERLINE_BAND = 12;
const MIN_JOB_TEXT_LENGTH = 120;

// Cosine thresholds -> bounded score adjustment. Conservative; calibrate against
// real outcomes before widening.
const SIM_STRONG = 0.8;
const SIM_GOOD = 0.72;
const SIM_WEAK = 0.55;
const BOOST_STRONG = 8;
const BOOST_GOOD = 4;
const PENALTY_WEAK = 6;

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const profileEmbeddingCache = new Map<string, { text: string; vector: number[]; at: number }>();

export function isSemanticRerankEnabled(): boolean {
  return process.env.ENABLE_SEMANTIC_RERANK === 'true' && getInternalAiConfig() !== null;
}

async function embedText(text: string): Promise<number[] | null> {
  const ai = getInternalAiConfig();
  if (!ai) return null;
  try {
    const { embed } = await import('ai');
    const { google } = await import('@ai-sdk/google');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;
    const { embedding } = await embed({
      model: google.textEmbeddingModel(EMBEDDING_MODEL),
      value: text.slice(0, 8000),
      // A hung embedding request would freeze this pMap slot forever (a hang
      // is not an error, so the catch below never fires). Abort for real.
      abortSignal: AbortSignal.timeout(30_000),
    });
    return embedding ?? null;
  } catch (error) {
    console.warn('[SemanticMatch] Embedding failed, skipping semantic step:', (error as Error)?.message ?? error);
    return null;
  }
}

async function getProfileEmbedding(userId: string, profileText: string): Promise<number[] | null> {
  const cached = profileEmbeddingCache.get(userId);
  if (cached && cached.text === profileText && Date.now() - cached.at < PROFILE_CACHE_TTL_MS) {
    return cached.vector;
  }
  const vector = await embedText(profileText);
  if (vector) profileEmbeddingCache.set(userId, { text: profileText, vector, at: Date.now() });
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function similarityToAdjustment(similarity: number): number {
  if (similarity >= SIM_STRONG) return BOOST_STRONG;
  if (similarity >= SIM_GOOD) return BOOST_GOOD;
  if (similarity <= SIM_WEAK) return -PENALTY_WEAK;
  return 0;
}

/**
 * Returns a bounded score adjustment for borderline candidates. No-op (0) when
 * disabled, on failure, for excluded/clearly-out-of-band scores, or for thin
 * job text.
 */
export async function maybeSemanticAdjust(input: {
  userId: string;
  profileText: string;
  jobText: string;
  baseScore: number;
  threshold: number;
}): Promise<{ adjustment: number; similarity: number | null }> {
  const noop = { adjustment: 0, similarity: null as number | null };
  if (!isSemanticRerankEnabled()) return noop;
  if (input.baseScore <= 0) return noop; // never rescue hard-excluded vacancies
  if (Math.abs(input.baseScore - input.threshold) > BORDERLINE_BAND) return noop;
  if ((input.jobText?.trim().length ?? 0) < MIN_JOB_TEXT_LENGTH) return noop;
  if (!input.profileText?.trim()) return noop;

  const [profileVec, jobVec] = await Promise.all([
    getProfileEmbedding(input.userId, input.profileText),
    embedText(input.jobText),
  ]);
  if (!profileVec || !jobVec) return noop;

  const similarity = cosineSimilarity(profileVec, jobVec);
  return { adjustment: similarityToAdjustment(similarity), similarity };
}
