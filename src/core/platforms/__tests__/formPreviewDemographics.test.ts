import { describe, it, expect } from 'vitest';
import { GreenhouseAdapter } from '../greenhouse';
import { LeverAdapter } from '../lever';
import { AshbyAdapter } from '../ashby';
import type { InspectApplicationContext } from '../PlatformAdapter';

/**
 * Regression for a real bug (2026-07-17): voluntary EEOC self-identification
 * fields (Gender/Veteran/Disability status) were marked as unresolved
 * "blockers" by the form-preview stage, even though applyPlaywright always
 * auto-declines them at real submit time. Since these fields are required in
 * the DOM on nearly every US-based posting, this made `approve` 409 on almost
 * any real swipe on Greenhouse/Lever/Ashby - silently, because the frontend
 * didn't check the response either (see useApplicationActions.ts fix in the
 * same pass). Accessing the private toFormFieldPreview directly since it has
 * no side effects and spinning up a real browser per adapter would be far
 * slower for what's a pure classification check.
 */

const context: InspectApplicationContext = {
  profileData: { firstName: 'Jorge', lastName: 'Ramirez', email: 'jorge@example.com', phone: '+51987654321' },
  formAnswers: {},
  hasResume: true,
};

const demographicFields = [
  { id: 'gender', name: 'gender', type: 'radio', label: 'Gender*', required: true },
  { id: 'veteran_status', name: 'veteran_status', type: 'radio', label: 'Veteran Status*', required: true },
  { id: 'disability_status', name: 'disability_status', type: 'radio', label: 'Disability Status*', required: true },
];

describe.each([
  ['GreenhouseAdapter', new GreenhouseAdapter()],
  ['LeverAdapter', new LeverAdapter()],
  ['AshbyAdapter', new AshbyAdapter()],
])('%s toFormFieldPreview - EEOC demographic fields', (_name, adapter: any) => {
  it.each(demographicFields)('marks "$label" as ready (auto-decline), never a blocker', (field) => {
    const preview = adapter.toFormFieldPreview(field, context);
    expect(preview.status).toBe('ready');
    expect(preview.source).toBe('auto_decline');
  });
});
