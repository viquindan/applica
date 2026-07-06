import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const automationModeEnum = pgEnum('automation_mode', ['off', 'semi', 'full']);
export const tailoringLevelEnum = pgEnum('tailoring_level', ['light', 'medium', 'deep']);
export const workModalityEnum = pgEnum('work_modality', ['remote', 'hybrid', 'onsite', 'any']);
export const applicationStatusEnum = pgEnum('application_status', [
  'draft', 'pending_review', 'approved', 'submitted', 'failed', 'skipped', 'archived',
]);
export const applicationModeEnum = pgEnum('application_mode', ['auto', 'semi', 'manual']);
export const vacancyStatusEnum = pgEnum('vacancy_status', [
  'new', 'scoring', 'scored', 'filtered', 'generating', 'pending_review',
  'applying', 'applied', 'skipped', 'archived',
]);
export const platformStatusEnum = pgEnum('platform_status', ['active', 'paused', 'error', 'disabled']);
export const memoryDocumentTypeEnum = pgEnum('memory_document_type', ['memory', 'skill']);
export const applicationEditKindEnum = pgEnum('application_edit_kind', ['cv', 'letter']);
export const applicationResponseEnum = pgEnum('application_response', ['unknown', 'contacted', 'rejected']);

export const usageEventTypeEnum = pgEnum('usage_event_type', ['search', 'ai_generation', 'application_prepared', 'application_sent']);
export const planTypeEnum = pgEnum('plan_type', ['free', 'pro', 'unlimited']);
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  role: userRoleEnum('role').default('user').notNull(),
  phone: varchar('phone', { length: 50 }),
  linkedin: text('linkedin'),
  portfolio: text('portfolio'),
  location: varchar('location', { length: 255 }),
  country: varchar('country', { length: 100 }),
  languages: jsonb('languages').$type<Array<{ language: string; proficiency: string }>>().default([]),
  workAuthorization: jsonb('work_authorization').$type<Array<{ country: string; status: string }>>().default([]),
  relocationAvailable: boolean('relocation_available').default(false),
  workModality: workModalityEnum('work_modality').default('any'),
  workModalityPrefs: jsonb('work_modality_prefs').$type<{
    acceptsRemote: boolean;
    remoteScope: 'worldwide' | 'regions';
    remoteRegions: string[];
    acceptsHybrid: boolean;
    hybridLocations: string[];
    acceptsOnsite: boolean;
    onsiteLocations: string[];
  }>(),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: varchar('salary_currency', { length: 10 }).default('USD'),
  noticePeriod: varchar('notice_period', { length: 100 }),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  onboardingStep: integer('onboarding_step').default(1),
  preferredLanguage: varchar('preferred_language', { length: 5 }).default('es'),
  subscriptionTier: planTypeEnum('subscription_tier').default('free').notNull(),
  lemonSqueezyCustomerId: varchar('lemon_squeezy_customer_id', { length: 255 }),
  lemonSqueezySubscriptionId: varchar('lemon_squeezy_subscription_id', { length: 255 }),
  // LinkedIn automation session (the cookie that lets the worker apply on the
  // user's behalf). Stored ENCRYPTED at rest. Separate from any OAuth login.
  linkedinSession: text('linkedin_session'),
  linkedinSessionStatus: varchar('linkedin_session_status', { length: 20 }).default('none'),
  linkedinConnectedAt: timestamp('linkedin_connected_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Professional Profile ─────────────────────────────────────────────────────

export const professionalProfiles = pgTable('professional_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  baseResumeId: uuid('base_resume_id'),
  experience: jsonb('experience').$type<Array<{
    company: string; role: string; startDate: string; endDate?: string;
    current: boolean; description: string; achievements: string[];
  }>>().default([]),
  education: jsonb('education').$type<Array<{
    institution: string; degree: string; field: string; year?: number; gpa?: string;
  }>>().default([]),
  certifications: jsonb('certifications').$type<Array<{
    name: string; issuer: string; year?: number; url?: string;
  }>>().default([]),
  skills: jsonb('skills').$type<Array<{ skill: string; level: string }>>().default([]),
  achievements: text('achievements'),
  targetIndustries: text('target_industries').array().default([]),
  targetRoles: text('target_roles').array().default([]),
  targetSeniority: text('target_seniority').array().default([]),
  targetCountries: text('target_countries').array().default([]),
  targetCompanies: text('target_companies').array().default([]),
  excludedCompanies: text('excluded_companies').array().default([]),
  excludedIndustries: text('excluded_industries').array().default([]),
  excludedRoles: text('excluded_roles').array().default([]),
  priorityKeywords: text('priority_keywords').array().default([]),
  alertKeywords: text('alert_keywords').array().default([]),
  cvTone: varchar('cv_tone', { length: 50 }).default('professional'),
  coverLetterTone: varchar('cover_letter_tone', { length: 50 }).default('professional'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── User Settings ────────────────────────────────────────────────────────────

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  globalAutomationMode: automationModeEnum('global_automation_mode').default('off'),
  requireReviewBeforeSubmit: boolean('require_review_before_submit').default(true),
  minScoreToGenerateMaterials: integer('min_score_to_generate_materials').default(60),
  minScoreToApply: integer('min_score_to_apply').default(70),
  maxApplicationsPerDay: integer('max_applications_per_day').default(10),
  maxApplicationsPerWeek: integer('max_applications_per_week').default(40),
  maxVacancyAgeDays: integer('max_vacancy_age_days').default(14),
  searchCadenceHours: integer('search_cadence_hours').default(24),
  lastSearchAt: timestamp('last_search_at'),
  nextSearchAt: timestamp('next_search_at'),
  lastSearchStatus: varchar('last_search_status', { length: 50 }),
  lastSearchResultCount: integer('last_search_result_count'),
  lastSearchSourceCount: integer('last_search_source_count'),
  lastSearchScannedSourceCount: integer('last_search_scanned_source_count'),
  lastSearchPreparedCount: integer('last_search_prepared_count'),
  lastSearchFilteredCount: integer('last_search_filtered_count'),
  lastSearchError: text('last_search_error'),
  searchInProgress: boolean('search_in_progress').default(false),
  defaultTailoringLevel: tailoringLevelEnum('default_tailoring_level').default('medium'),
  pauseOnSalaryQuestions: boolean('pause_on_salary_questions').default(true),
  pauseOnImmigrationQuestions: boolean('pause_on_immigration_questions').default(true),
  pauseOnCustomQuestions: boolean('pause_on_custom_questions').default(true),
  pauseOnCaptcha: boolean('pause_on_captcha').default(true),
  pauseOnLogin: boolean('pause_on_login').default(true),
  pauseOnMissingInformation: boolean('pause_on_missing_information').default(true),
  aiProvider: varchar('ai_provider', { length: 50 }).default('google'),
  aiApiKeyEncrypted: text('ai_api_key_encrypted'),
  aiModel: varchar('ai_model', { length: 100 }).default('gemini-2.5-flash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Subscriptions & Usage ──────────────────────────────────────────────────

export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey(),
  searchCursorOffset: integer('search_cursor_offset').default(0).notNull(),
  lastPlatform: varchar('last_platform', { length: 50 }).default('greenhouse').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  planType: planTypeEnum('plan_type').default('free').notNull(),
  billingCycleStart: timestamp('billing_cycle_start').defaultNow().notNull(),
  externalCustomerId: varchar('external_customer_id', { length: 255 }), // for Lemon Squeezy/Paddle
  externalSubscriptionId: varchar('external_subscription_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventType: usageEventTypeEnum('event_type').notNull(),
  amount: integer('amount').notNull().default(1),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Platform Settings ────────────────────────────────────────────────────────

export const platformSettings = pgTable('platform_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platformName: varchar('platform_name', { length: 100 }).notNull(),
  searchEnabled: boolean('search_enabled').default(true),
  autoApplyEnabled: boolean('auto_apply_enabled').default(false),
  semiAutoApplyEnabled: boolean('semi_auto_apply_enabled').default(true),
  requiresManualReview: boolean('requires_manual_review').default(true),
  minimumScoreToApply: integer('minimum_score_to_apply').default(70),
  maxApplicationsPerDay: integer('max_applications_per_day').default(5),
  maxApplicationsPerWeek: integer('max_applications_per_week').default(20),
  allowedLocations: text('allowed_locations').array().default([]),
  allowedRoles: text('allowed_roles').array().default([]),
  allowedIndustries: text('allowed_industries').array().default([]),
  excludedKeywords: text('excluded_keywords').array().default([]),
  notes: text('notes'),
  lastRunAt: timestamp('last_run_at'),
  lastError: text('last_error'),
  status: platformStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Resumes ──────────────────────────────────────────────────────────────────

export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 255 }).notNull(),
  filePath: text('file_path'),
  textContent: text('text_content'),
  version: integer('version').default(1),
  isBase: boolean('is_base').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Cover Letters ────────────────────────────────────────────────────────────

export const coverLetters = pgTable('cover_letters', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Vacancies ────────────────────────────────────────────────────────────────

export const vacancies = pgTable('vacancies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 100 }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  title: varchar('title', { length: 500 }).notNull(),
  company: varchar('company', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),
  modality: workModalityEnum('modality'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: varchar('salary_currency', { length: 10 }),
  description: text('description'),
  requirements: text('requirements'),
  url: text('url').notNull(),
  postedAt: timestamp('posted_at'),
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
  normalizedData: jsonb('normalized_data'),
  score: integer('score'),
  scoreBreakdown: jsonb('score_breakdown'),
  redFlags: text('red_flags').array().default([]),
  warnings: text('warnings').array().default([]),
  status: vacancyStatusEnum('status').default('new'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Applications ─────────────────────────────────────────────────────────────

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vacancyId: uuid('vacancy_id').notNull().references(() => vacancies.id, { onDelete: 'cascade' }),
  status: applicationStatusEnum('status').default('draft'),
  mode: applicationModeEnum('mode').default('semi'),
  adaptedResumeId: uuid('adapted_resume_id').references(() => resumes.id),
  coverLetterId: uuid('cover_letter_id').references(() => coverLetters.id),
  formAnswers: jsonb('form_answers').$type<Record<string, string>>().default({}),
  resumeChanges: jsonb('resume_changes'),
  submissionDecision: jsonb('submission_decision'),
  responseStatus: applicationResponseEnum('response_status').default('unknown').notNull(),
  contactedAt: timestamp('contacted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Application Submissions ──────────────────────────────────────────────────

export const applicationSubmissions = pgTable('application_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 100 }).notNull().default('manual'),
  status: varchar('status', { length: 50 }).default('pending'),
  mode: applicationModeEnum('mode').notNull().default('semi'),
  platformName: varchar('platform_name', { length: 100 }).notNull().default('manual'),
  submittedAutomatically: boolean('submitted_automatically').default(false),
  approvedByUser: boolean('approved_by_user').default(false),
  approvalTimestamp: timestamp('approval_timestamp'),
  submissionTimestamp: timestamp('submission_timestamp'),
  submittedResumeId: uuid('submitted_resume_id'),
  submittedCoverLetterId: uuid('submitted_cover_letter_id'),
  submittedAnswers: jsonb('submitted_answers'),
  submissionStatus: varchar('submission_status', { length: 50 }),
  failureReason: text('failure_reason'),
  screenshotPath: text('screenshot_path'),
  evidencePath: text('evidence_path'),
  logs: jsonb('logs').$type<Array<{ timestamp: string; level: string; message: string }>>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Agent-native memory documents ────────────────────────────────────────────

export const memoryDocuments = pgTable('memory_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentType: memoryDocumentTypeEnum('document_type').notNull(),
  path: text('path').notNull(),
  content: text('content').notNull(),
  version: integer('version').default(1).notNull(),
  source: varchar('source', { length: 100 }).default('system').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const applicationEdits = pgTable('application_edits', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: applicationEditKindEnum('kind').notNull(),
  originalContent: text('original_content').notNull(),
  editedContent: text('edited_content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memoryPromotions = pgTable('memory_promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourcePaths: text('source_paths').array().notNull().default([]),
  targetPaths: text('target_paths').array().notNull().default([]),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ATS board registry
export const atsBoards = pgTable('ats_boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: varchar('platform', { length: 50 }).notNull().default('greenhouse'),
  token: varchar('token', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  source: varchar('source', { length: 100 }).notNull().default('seed'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  lastValidatedAt: timestamp('last_validated_at'),
  lastSeenJobCount: integer('last_seen_job_count'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    platformTokenIdx: uniqueIndex('platform_token_idx').on(table.platform, table.token),
  };
});

export const atsBoardDiscoveries = pgTable('ats_board_discoveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: varchar('platform', { length: 50 }).notNull().default('greenhouse'),
  token: varchar('token', { length: 255 }).notNull(),
  sourceUrl: text('source_url'),
  sourceType: varchar('source_type', { length: 100 }).notNull().default('unknown'),
  rawEvidence: text('raw_evidence'),
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
  validatedAt: timestamp('validated_at'),
  validationStatus: varchar('validation_status', { length: 50 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  professionalProfile: one(professionalProfiles, {
    fields: [users.id], references: [professionalProfiles.userId],
  }),
  settings: one(userSettings, {
    fields: [users.id], references: [userSettings.userId],
  }),
  platformSettings: many(platformSettings),
  resumes: many(resumes),
  vacancies: many(vacancies),
  applications: many(applications),
  memoryDocuments: many(memoryDocuments),
  subscription: one(userSubscriptions, {
    fields: [users.id], references: [userSubscriptions.userId],
  }),
  usageEvents: many(usageEvents),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  vacancy: one(vacancies, { fields: [applications.vacancyId], references: [vacancies.id] }),
  adaptedResume: one(resumes, { fields: [applications.adaptedResumeId], references: [resumes.id] }),
  coverLetter: one(coverLetters, { fields: [applications.coverLetterId], references: [coverLetters.id] }),
  submission: one(applicationSubmissions, { fields: [applications.id], references: [applicationSubmissions.applicationId] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ProfessionalProfile = typeof professionalProfiles.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type CoverLetter = typeof coverLetters.$inferSelect;
export type Vacancy = typeof vacancies.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type ApplicationSubmission = typeof applicationSubmissions.$inferSelect;
export type MemoryDocument = typeof memoryDocuments.$inferSelect;
export type ApplicationEdit = typeof applicationEdits.$inferSelect;
export const MemoryPromotion = typeof memoryPromotions.$inferSelect;
export type AtsBoard = typeof atsBoards.$inferSelect;
export type AtsBoardDiscovery = typeof atsBoardDiscoveries.$inferSelect;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
