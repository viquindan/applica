# Applica

Applica is an automated job-application workspace for candidates who want help managing the repetitive parts of a job search. The intended flow is:

`candidate profile -> vacancy discovery -> fit scoring -> tailored materials -> review or submission`

The product already has a substantial foundation, but it is still an MVP in progress rather than a production-ready autonomous system.

## Tech stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Database:** Neon / PostgreSQL
- **ORM:** Drizzle ORM
- **Authentication:** NextAuth.js
- **Background jobs:** pg-boss
- **Browser automation:** Playwright
- **AI providers:** managed by Applica internally through the Vercel AI SDK

## Current state

### Implemented

1. **Authentication and onboarding**
   - Registration and login flows.
   - Multi-step onboarding for personal data, professional profile, preferences, and platform settings.
   - PDF resume upload and text extraction.

2. **Candidate and application data model**
   - Users, professional profiles, resumes, vacancies, applications, submissions, and platform settings are modeled in PostgreSQL with Drizzle.

3. **Scoring, tailoring, and decision logic**
   - A deterministic fit scorer evaluates vacancies using role, industry, location, seniority, salary, and keyword signals.
   - AI-assisted CV tailoring and cover-letter generation are implemented.
   - A 13-rule submission decision engine decides whether to skip, pause, queue for review, or auto-submit.

4. **Dashboard and review workflow**
   - Dashboard metrics, recent activity, application views, settings, and a review queue are present.
   - Users can approve, skip, archive, or request regeneration of application materials.

5. **Background jobs and automation scaffolding**
   - pg-boss is configured for vacancy-search and application-processing jobs.
   - A Playwright-based automation engine exists with CAPTCHA detection and evidence screenshot capture.
   - Greenhouse has the most developed adapter so far, including form filling and resume upload logic.
   - Applica now has a persistent Greenhouse board registry. The MVP starts from a seeded public corpus and the worker reads from that registry instead of relying only on a hard-coded list.

6. **Exports**
   - Application data can currently be exported as CSV.

### Still incomplete

- The end-to-end vacancy pipeline is not finished yet:
  - platform searches are still stubbed,
  - discovered vacancies are not yet persisted and processed through the full scoring/material-generation pipeline by the worker.
- Lever and Ashby adapters are still stubs; Greenhouse is only partially implemented.
- The final browser click that submits an application is intentionally disabled during testing.
- Review actions update application state, but the real automated submission path is not yet fully connected.
- Real-time processing updates are not implemented.
- Production deployment hardening is still pending.

## Recommended next milestone

Before broadening platform coverage or deploying to production, complete one honest vertical slice:

1. Search or ingest a real vacancy.
2. Persist it.
3. Score it.
4. Generate tailored materials.
5. Send it into the review queue.
6. Complete one real submission path on a single platform, preferably Greenhouse.

Once that path works reliably, expanding to more adapters and deployment becomes much safer.

## Local setup

### Local port convention

- **Applica must run on port `3005`.**
- Do **not** start Applica on port `3001`; that port is reserved for another local service in this workspace.

### Prerequisites

- Node.js
- A PostgreSQL / Neon database
- A Gemini API key managed by the Applica service

### Environment variables

Create `.env.local` with values similar to:

```env
DATABASE_URL=your_neon_db_url
AUTH_SECRET=your_auth_secret
NEXTAUTH_URL=http://localhost:3005

GOOGLE_GENERATIVE_AI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
NEXT_PUBLIC_APP_URL=http://localhost:3005
NEXT_PUBLIC_APP_NAME=Applica
```

### Install and run

```bash
npm install
npm run db:push
npm run dev
```

In a separate terminal, start the worker:

```bash
npx tsx src/core/jobs/worker.ts
```

To seed and validate the first Greenhouse board corpus:

```bash
npx tsx scripts/seed-greenhouse-boards.ts
```

To keep that corpus healthy over time:

```bash
npx tsx scripts/sync-greenhouse-from-common-crawl.ts 4 300 0
npx tsx scripts/refresh-greenhouse-registry.ts 500
npx tsx scripts/inspect-greenhouse-metrics.ts
```

Then open `http://localhost:3005`.

## Development notes

- **Never use the em dash character (`—`) anywhere in app or web content** (copy, labels, error messages, generated text). Rewrite as two sentences or use a comma instead.
- A development seed endpoint exists at `/api/dev/seed` for creating a test user.
- The product direction is now to hide provider/API-key complexity from end users. User-facing AI configuration should not be reintroduced unless the product strategy changes.
- This repository uses a newer Next.js version with behavior that may differ from older conventions. Check the local Next.js docs before changing framework-level code.
