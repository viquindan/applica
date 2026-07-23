const ROLE_FAMILIES: Record<string, string[]> = {
  finance_leadership: [
    'cfo', 'chief financial officer', 'vp finance', 'vice president finance',
    'svp finance', 'head of finance', 'finance director', 'director of finance',
    'finance lead', 'group finance director', 'controller', 'financial controller',
  ],
  fp_and_a_leadership: [
    'head of fp&a', 'director of fp&a', 'fp&a director', 'vp fp&a',
    'head of financial planning', 'director financial planning',
  ],
  operations_leadership: [
    'coo', 'chief operating officer', 'vp operations', 'head of operations',
    'operations director', 'director of operations', 'general operations manager',
  ],
  country_leadership: [
    'country manager', 'general manager', 'regional general manager', 'managing director',
  ],
  sales_leadership: [
    'sales manager', 'head of sales', 'sales director', 'director of sales',
    'vp sales', 'vice president sales', 'revenue director', 'head of revenue',
  ],
  growth_leadership: [
    'growth director', 'head of growth', 'vp growth', 'chief growth officer',
  ],
  product_leadership: [
    'head of product', 'product director', 'director of product', 'vp product', 'chief product officer',
  ],
  engineering_leadership: [
    'cto', 'chief technology officer', 'vp engineering', 'vice president engineering',
    'svp engineering', 'head of engineering', 'engineering director', 'director of engineering',
    'engineering manager', 'head of technology', 'vp of technology',
  ],
  data_leadership: [
    'chief data officer', 'cdo', 'vp data', 'head of data', 'data director',
    'director of data', 'head of analytics', 'head of data science', 'director of analytics',
  ],
  marketing_leadership: [
    'cmo', 'chief marketing officer', 'vp marketing', 'vice president marketing',
    'head of marketing', 'marketing director', 'director of marketing', 'head of brand',
  ],
  people_leadership: [
    'chro', 'chief people officer', 'vp people', 'vp human resources', 'head of people',
    'head of hr', 'people director', 'director of people', 'head of talent', 'head of recruiting',
  ],
  design_leadership: [
    'head of design', 'design director', 'director of design', 'vp design',
    'chief design officer', 'head of ux', 'head of product design',
  ],
  strategy_leadership: [
    'chief strategy officer', 'head of strategy', 'vp strategy', 'strategy director',
    'director of strategy', 'head of corporate development', 'head of bizdev',
    'head of business development', 'vp business development',
    'head of partnerships', 'vp partnerships', 'director of partnerships',
  ],
  // ── Individual-contributor and non-tech families (added 2026-07-23) ────────
  // Real finding from the double engine audit: every family above is
  // *_leadership, so getRoleFamily() returned undefined for ANY IC or
  // non-tech title ("Software Engineer", "Accountant", "Registered Nurse",
  // "Desarrollador de Software" - all verified undefined). Consequence was
  // double: the role component of the score (30 pts, the heaviest) degraded
  // to exact-phrase matching for the majority of the market, AND - worse -
  // roleMatches() also pre-filters the candidate POOL (atsSearchHelpers.ts),
  // so "Backend Engineer" never even entered the funnel for a user targeting
  // "Software Engineer" (recall lost at the source, not just a weaker score).
  // Leadership families stay FIRST: Object.entries order decides ties, and a
  // "Director of Product" must keep resolving to product_leadership, not to
  // an IC family. Aliases are pre-normalized (lowercase, no accents - the ñ
  // in "diseñador" normalizes to n) and matched on significant-word presence,
  // so avoid single generic words ("engineer", "analyst", "tester") that
  // would over-match across families.
  software_engineering: [
    'software engineer', 'software developer', 'backend engineer', 'backend developer',
    'frontend engineer', 'frontend developer', 'full stack engineer', 'full stack developer',
    'fullstack engineer', 'fullstack developer', 'web developer', 'mobile developer',
    'mobile engineer', 'ios engineer', 'ios developer', 'android engineer', 'android developer',
    'api developer', 'application developer', 'embedded engineer', 'games developer', 'game developer',
    'desarrollador de software', 'ingeniero de software', 'desarrollador backend',
    'desarrollador frontend', 'desarrollador web', 'desarrollador movil', 'programador',
  ],
  devops_sre: [
    'devops engineer', 'devops', 'site reliability engineer', 'sre',
    'infrastructure engineer', 'cloud engineer', 'platform engineer',
    'systems engineer', 'system administrator', 'sysadmin', 'network engineer',
    'network administrator', 'administrador de sistemas', 'ingeniero de infraestructura',
  ],
  data_ic: [
    'data engineer', 'data scientist', 'data analyst', 'machine learning engineer',
    'ml engineer', 'analytics engineer', 'business intelligence analyst', 'bi analyst',
    'business analyst', 'analista de datos', 'cientifico de datos', 'ingeniero de datos',
  ],
  security_ic: [
    'security engineer', 'security analyst', 'cybersecurity analyst', 'cybersecurity engineer',
    'penetration tester', 'information security analyst', 'analista de seguridad',
  ],
  qa_ic: [
    'qa engineer', 'quality assurance engineer', 'test engineer', 'qa analyst',
    'quality engineer', 'automation engineer', 'qa tester', 'analista de calidad',
  ],
  design_ic: [
    'ux designer', 'ui designer', 'product designer', 'ux researcher',
    'graphic designer', 'visual designer', 'interaction designer', 'web designer',
    'disenador ux', 'disenador grafico', 'disenador de producto',
  ],
  product_management: [
    'product manager', 'product owner', 'technical product manager',
    'gerente de producto', 'product analyst',
  ],
  project_management: [
    'project manager', 'program manager', 'scrum master', 'delivery manager',
    'project coordinator', 'gerente de proyectos', 'jefe de proyecto', 'lider de proyecto',
  ],
  finance_ic: [
    'accountant', 'financial analyst', 'accounts payable', 'accounts receivable',
    'bookkeeper', 'auditor', 'tax analyst', 'payroll specialist', 'treasury analyst',
    'credit analyst', 'contador', 'analista financiero', 'analista contable', 'tesorero',
  ],
  sales_ic: [
    'account executive', 'sales representative', 'sales rep', 'sales executive',
    'business development representative', 'sales development representative', 'sdr', 'bdr',
    'account manager', 'inside sales', 'field sales', 'ejecutivo de ventas',
    'representante de ventas', 'ejecutivo comercial', 'asesor comercial', 'vendedor',
  ],
  marketing_ic: [
    'marketing analyst', 'marketing specialist', 'content marketing', 'digital marketing',
    'seo specialist', 'social media manager', 'marketing coordinator', 'growth marketer',
    'performance marketing', 'copywriter', 'community manager',
    'analista de marketing', 'especialista en marketing',
  ],
  customer_ic: [
    'customer success manager', 'customer success', 'customer support', 'technical support',
    'support engineer', 'customer service representative', 'help desk', 'it support',
    'atencion al cliente', 'soporte tecnico', 'servicio al cliente',
  ],
  people_ic: [
    'recruiter', 'talent acquisition', 'hr generalist', 'hr analyst', 'people operations',
    'human resources generalist', 'human resources analyst',
    'reclutador', 'analista de recursos humanos', 'generalista de recursos humanos',
  ],
  operations_ic: [
    'operations analyst', 'operations coordinator', 'operations specialist',
    'supply chain analyst', 'logistics coordinator', 'logistics analyst',
    'procurement specialist', 'analista de operaciones', 'coordinador de operaciones',
    'analista de logistica',
  ],
  healthcare: [
    'registered nurse', 'nurse practitioner', 'medical assistant', 'physician',
    'pharmacist', 'physical therapist', 'clinical nurse', 'enfermera', 'enfermero',
    'medico general', 'farmaceutico',
  ],
  legal: [
    'lawyer', 'attorney', 'paralegal', 'legal counsel', 'legal assistant',
    'corporate counsel', 'abogado', 'asesor legal', 'asistente legal',
  ],
  education: [
    'teacher', 'professor', 'instructor', 'academic tutor',
    'profesor', 'docente', 'maestro',
  ],
};

// Order matters: getSeniorityBand returns the FIRST band whose alias matches, so
// the most senior bands are listed first ("Associate Director" -> director, not
// junior). Individual-contributor bands are included so non-executive roles
// (e.g. a "Senior Nuclear Physicist") are not penalized.
const SENIORITY_GROUPS: Record<string, string[]> = {
  executive: ['chief', 'cfo', 'coo', 'ceo', 'cto', 'cmo', 'cdo', 'chro', 'president', 'managing director'],
  vp: ['vp', 'vice president', 'svp', 'evp'],
  director: ['director', 'head'],
  manager: ['manager'],
  principal: ['principal', 'staff', 'distinguished', 'fellow'],
  lead: ['lead', 'leader'],
  senior: ['senior', 'sr', 'snr'],
  mid: ['mid', 'mid level', 'intermediate'],
  junior: ['junior', 'jr', 'entry', 'entry level', 'intern', 'trainee', 'graduate', 'associate'],
};

export function normalizeRole(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const roleFamilyCache = new Map<string, string | undefined>();

export function getRoleFamily(value: string) {
  const normalized = normalizeRole(value);
  if (roleFamilyCache.has(normalized)) return roleFamilyCache.get(normalized);
  const family = Object.entries(ROLE_FAMILIES).find(([, aliases]) =>
    aliases.some((alias) => matchesRoleWords(normalized, alias)),
  )?.[0];
  roleFamilyCache.set(normalized, family);
  return family;
}

export function roleMatches(jobTitle: string, requestedRole: string) {
  const normalizedTitle = normalizeRole(jobTitle);
  const normalizedRequested = normalizeRole(requestedRole);
  if (!normalizedRequested) return true;
  if (isAcronymReference(normalizedTitle, normalizedRequested)) return false;
  if (matchesRolePhrase(normalizedTitle, normalizedRequested)) return true;

  const requestedFamily = getRoleFamily(normalizedRequested);
  const titleFamily = getRoleFamily(normalizedTitle);
  return Boolean(requestedFamily && titleFamily && requestedFamily === titleFamily);
}

export function getSeniorityBand(value: string) {
  const normalized = normalizeRole(value);
  return Object.entries(SENIORITY_GROUPS).find(([, aliases]) =>
    aliases.some((alias) => matchesRolePhrase(normalized, alias)),
  )?.[0];
}

export function seniorityMatches(jobTitle: string, requestedSeniorities: string[] = []) {
  if (requestedSeniorities.length === 0) return true;
  const titleBand = getSeniorityBand(jobTitle);
  if (!titleBand) return false;
  return requestedSeniorities.some((seniority) => getSeniorityBand(seniority) === titleBand || normalizeRole(seniority) === titleBand);
}

const phraseRegexCache = new Map<string, RegExp>();

function matchesRolePhrase(haystack: string, needle: string) {
  let regex = phraseRegexCache.get(needle);
  if (!regex) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
    phraseRegexCache.set(needle, regex);
  }
  return regex.test(haystack);
}

// Real bug found in production (2026-07-20): a title like "VP of Credit
// Operations" was never recognized as operations_leadership because
// matchesRolePhrase needs the alias ("vp operations") as one contiguous
// substring - any qualifier word inserted between the seniority prefix and
// the function noun ("of Credit") breaks it, and executive titles almost
// always have one ("Head of Payments Strategy", "Regional Head of Business
// Development"). Family aliases now match on significant-word presence
// (order-independent, ignores stopwords) instead of a rigid phrase - the
// exact-phrase check in roleMatches() above is untouched and stays strict.
// Spanish stopwords included since the IC families carry Spanish aliases
// ("desarrollador de software" must match "Desarrollador Senior de Software"
// without requiring the exact connective in place).
const STOPWORDS = new Set(['of', 'the', 'a', 'an', 'and', 'for', 'to', 'in', 'at', 'de', 'del', 'la', 'el', 'y', 'en']);
const wordSetCache = new Map<string, string[]>();

function significantWords(phrase: string): string[] {
  let words = wordSetCache.get(phrase);
  if (!words) {
    words = phrase.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
    wordSetCache.set(phrase, words);
  }
  return words;
}

function matchesRoleWords(haystack: string, aliasPhrase: string): boolean {
  const words = significantWords(aliasPhrase);
  if (!words.length) return false;
  return words.every((w) => matchesRolePhrase(haystack, w));
}

function isAcronymReference(title: string, role: string) {
  return ['cfo', 'coo'].includes(role) && new RegExp(`\\b(of|to|for)\\s+the\\s+${role}\\b`, 'i').test(title);
}
