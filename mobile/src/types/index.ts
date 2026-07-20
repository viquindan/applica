// Hand-mirrored from src/db/schema.ts / src/app/(dashboard)/applications/data.ts
// on the web side (see docs/CONVENTIONS.md + the mobile plan) - RN cannot
// import Next/Drizzle/Node code directly, so these shapes are kept in sync by
// hand whenever the web schema changes.

// The backend query coalesces applications.status with vacancies.status
// (src/app/(dashboard)/applications/data.ts) so a vacancy that never got an
// application row (filtered below the score threshold) still shows up in
// history with ITS OWN status - 'new'/'scoring'/'scored'/'filtered'/'applying'/
// 'applied' are vacancy-only states that can leak through here.
export type AppStatus =
  | 'draft' | 'generating' | 'pending_review' | 'approved' | 'submitted'
  | 'skipped' | 'archived' | 'failed'
  | 'new' | 'scoring' | 'scored' | 'filtered' | 'applying' | 'applied';

export type AppRow = {
  id: string;
  userId: string;
  vacancyId: string;
  status: AppStatus;
  mode: 'auto' | 'semi' | 'none';
  adaptedResumeId: string | null;
  coverLetterId: string | null;
  formAnswers: Record<string, string> | null;
  resumeChanges: unknown;
  submissionDecision: { formPreview?: { blockers?: unknown[] } } | null;
  responseStatus: string;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  vacancy: {
    title: string;
    company: string;
    platform: string;
    url: string;
    score: number | null;
    location: string | null;
    warnings: string[] | null;
    description: string | null;
  } | null;
};

export type ApplicationsData = {
  apps: AppRow[];
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  settings: { maxApplicationsPerDay?: number; maxApplicationsPerWeek?: number } | null;
  stats: { total: number; today: number; pendingReview: number; submitted: number; appliedToday: number };
  outcomes: { contacted: number; rejected: number; resolved: number; contactRate: number; rolePerformance: unknown[] };
  supply: { activeBoards: number; jobsSeen: number };
  billing: { tier?: string; limits: unknown; currentCount: number };
  linkedinStatus: 'none' | 'connected' | 'expired';
};

export type Language = { language: string; proficiency?: string };

export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  avatarPath: string | null;
  phone: string | null;
  linkedin: string | null;
  // Real shape is a proper array (schema.ts portfolioLinks, text[]), not a
  // single comma-separated string - a real user had "sortcash.org,
  // applica.com, casaocash.com" jammed into one field with no way to tell
  // them apart or open one directly. GET routes already migrate the legacy
  // `portfolio` string into this array for display.
  portfolioLinks: string[];
  location: string | null;
  country: string | null;
  // Real shape is {language, proficiency}[] (CV parser output), not string[]
  // as this type previously claimed - confirmed against a live API response.
  languages: Language[];
  // Real shape is {country, status}[] (schema.ts jsonb), not string[] as this
  // type previously claimed - eligibility.ts's hasWorkAuthFor() reads both keys.
  workAuthorization: Array<{ country: string; status: string }>;
  relocationAvailable: boolean;
  // Mirrors src/core/scoring/fitScorer.ts's ScoringProfile.workModalityPrefs
  // EXACTLY - the scorer keys off remoteScope/remoteRegions/hybridLocations/
  // onsiteLocations too, not just the 3 booleans. A save that omits them
  // silently wipes that targeting (PUT /api/profile has no partial merge) -
  // confirmed happening for real, see profile.tsx.
  workModalityPrefs: {
    acceptsRemote?: boolean;
    remoteScope?: 'worldwide' | 'regions';
    remoteRegions?: string[];
    acceptsHybrid?: boolean;
    hybridLocations?: string[];
    acceptsOnsite?: boolean;
    onsiteLocations?: string[];
  } | null;
  noticePeriod: string | null;
  salaryMin: number | null;
  salaryCurrency: string | null;
};

export type ProfessionalProfile = {
  id: string;
  userId: string;
  experience: Array<{ company?: string; role?: string; startDate?: string; endDate?: string; current?: boolean; description?: string; achievements?: string[] }>;
  education: Array<{ institution?: string; degree?: string; field?: string; year?: string | number }>;
  certifications: string[];
  // Real shape is {skill, level}[] (CV parser output), not string[] as this
  // type previously claimed - confirmed against a live API response.
  skills: Array<{ skill: string; level?: string }>;
  // Free text the CV parser fills and expertise.ts feeds into keyword +
  // semantic matching - not just cover-letter decoration.
  achievements: string | null;
  targetRoles: string[];
  targetCountries: string[];
  // All four are direct fitScorer inputs (seniority/industry components,
  // priority boost, alert penalty) - the API always returned them, the mobile
  // type just never declared them so no screen could render an editor.
  targetSeniority: string[];
  targetIndustries: string[];
  priorityKeywords: string[];
  alertKeywords: string[];
};

export type Resume = {
  id: string;
  label: string;
  filePath: string;
  version: number;
  isBase: boolean;
  createdAt: string;
};

export type ProfileData = {
  user: ProfileUser | null;
  profile: ProfessionalProfile | null;
  resumes: Resume[];
};
