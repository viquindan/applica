/**
 * Pure ATS board-token patterns and helpers. Kept free of any database import
 * so discovery / token extraction can be exercised and tested standalone.
 */
export type AtsPlatform = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'recruitee' | 'workable' | 'bamboohr';
export type ExtractedBoard = { platform: AtsPlatform; token: string };

const BOARD_PATTERNS: Array<{ platform: AtsPlatform; pattern: RegExp }> = [
  { platform: 'greenhouse', pattern: /boards\.greenhouse\.io\/([a-z0-9_-]+)/gi },
  { platform: 'greenhouse', pattern: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi },
  { platform: 'greenhouse', pattern: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/gi },
  { platform: 'greenhouse', pattern: /job_app\?for=([a-z0-9_-]+)/gi },
  { platform: 'lever', pattern: /jobs\.lever\.co\/([a-z0-9_-]+)/gi },
  { platform: 'lever', pattern: /api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/gi },
  { platform: 'ashby', pattern: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi },
  { platform: 'ashby', pattern: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/gi },
  { platform: 'smartrecruiters', pattern: /jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/gi },
  { platform: 'smartrecruiters', pattern: /api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/gi },
  { platform: 'recruitee', pattern: /([a-z0-9_-]+)\.recruitee\.com/gi },
  { platform: 'workable', pattern: /apply\.workable\.com\/([a-z0-9_-]+)\/j(?:obs)?\//gi },
  { platform: 'bamboohr', pattern: /([a-z0-9_-]+)\.bamboohr\.com\/careers/gi },
];

// Subdomains/path segments that are never real company board tokens.
const RESERVED_TOKENS = new Set([
  'embed', 'robots', 'jobs', 'www', 'api', 'careers', 'help', 'support',
  'blog', 'about', 'status', 'app', 'admin', 'static', 'assets', 'cdn',
]);

export function normalizeBoardToken(token: string): string {
  return token.trim().toLowerCase();
}

export function isPlausibleBoardToken(token: string): boolean {
  if (!token) return false;
  if (RESERVED_TOKENS.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  return /^[a-z0-9][a-z0-9_-]{1,254}$/.test(token);
}

export function extractAtsBoardTokens(text: string): ExtractedBoard[] {
  const seen = new Set<string>();
  const results: ExtractedBoard[] = [];

  for (const { platform, pattern } of BOARD_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const token = normalizeBoardToken(match[1] ?? '');
      if (!isPlausibleBoardToken(token)) continue;
      const key = `${platform}:${token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ platform, token });
    }
  }

  return results;
}
