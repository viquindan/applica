import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';

export type FormFieldPreview = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  source: 'profile' | 'resume' | 'saved_answer' | 'auto_decline' | 'unknown';
  plannedValue?: string;
  status: 'ready' | 'missing' | 'needs_review';
};

export type ApplicationFormPreview = {
  inspectedAt: string;
  fields: FormFieldPreview[];
  blockers: string[];
  warnings: string[];
  captchaDetected: boolean;
};

export type InspectApplicationContext = {
  profileData: any;
  formAnswers: Record<string, string>;
  hasResume: boolean;
};

export interface SearchFilters {
  locations?: string[];
  /** The candidate's home country/countries - used to rank local roles first. */
  homeCountries?: string[];
  roles?: string[];
  industries?: string[];
  maxAgeDays?: number;
  limit?: number;
  boardTokens?: string[];
  onProgress?: (progress: { scannedSources: number; totalSources: number }) => Promise<void> | void;
}

export interface PlatformAdapter {
  /**
   * The canonical name of the platform (e.g. 'greenhouse', 'lever')
   */
  name: string;

  /**
   * Search the platform for vacancies matching the filters
   */
  search(filters: SearchFilters): Promise<NormalizedVacancy[]>;

  /**
   * Extract vacancy details from a specific URL
   */
  extractVacancy(url: string): Promise<NormalizedVacancy | null>;

  /**
   * Submit an application to a vacancy using provided materials
   */
  apply(
    url: string,
    profileData: any,
    resumeText: string,
    coverLetter?: string,
    formAnswers?: Record<string, string>
  ): Promise<Partial<ApplicationSubmission>>;

  /**
   * Playwright implementation for submitting an application
   */
  applyPlaywright?(
    url: string,
    context: import('../automation/applyEngine').ApplyContext
  ): Promise<Partial<ApplicationSubmission>>;

  /**
   * Playwright implementation for inspecting the form before a user approves it.
   */
  inspectApplicationFormPlaywright?(
    url: string,
    context: InspectApplicationContext
  ): Promise<ApplicationFormPreview>;
}

