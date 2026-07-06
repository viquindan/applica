# Applica Product Roadmap

## Product thesis

Applica should feel like an agent that works for the user, not a toolbox the user must learn.

The user defines:

- who they are,
- what roles they want,
- where they want to work,
- what compensation they expect,
- how recent vacancies must be,
- how often Applica should search,
- whether Applica may submit automatically or should wait for review.

Then Applica does the repetitive work:

`discover -> qualify -> tailor -> submit or prepare for review -> record outcome`

## Product shape

### Home

The primary surface of the product. It should be first in navigation and understandable without onboarding.

- CV upload and version history
- Target roles
- Salary range
- Countries / regions
- Work modality: remote, hybrid, onsite
- Maximum vacancy age
- Search cadence
- Application mode:
  - `Automatic`
  - `Review before applying`

### Applications

The user's daily history of what Applica found and did.

- Found vacancies
- Submitted applications
- Applications ready for review
- Rejected / skipped / failed cases
- Fit rationale
- Prepared materials
- Evidence and logs when useful

### Review

Only for work that genuinely needs the user:

- applications in manual mode,
- ambiguous or incomplete applications,
- exceptions that require a human decision.

### Advanced settings

Should be secondary, not part of the core user journey.

- internal platform/integration controls
- debugging / operational controls
- possibly billing / usage in the SaaS version

No user-supplied third-party AI API keys in the normal product.

## Commercial model

Applica should run with the platform's own AI providers and credentials.

- The SaaS subscription includes a usage allowance.
- Higher usage can be sold as additional credits / tokens.
- Users should not need to understand or configure model providers.
- AI model choice becomes an internal product decision, not a user burden.

## Current reality

### Already working

- Authentication
- Dashboard, applications list, review queue, application detail views
- Candidate profile data model
- Vacancy persistence
- Deterministic fit scoring
- AI tailoring and cover-letter generation
- Submission decision engine
- pg-boss workers
- Real Greenhouse discovery by board token
- Greenhouse vacancy extraction
- Greenhouse Playwright form filling and resume upload
- Real Greenhouse submission completed successfully in controlled production-like testing
- CV upload from the product UI

### Still incomplete

- The product structure still exposes too much infrastructure:
  - platform controls,
  - board tokens,
  - AI provider settings.
- Home has not yet absorbed the core setup flow.
- Review approval is only partially wired into the real submission path.
- Greenhouse is still in controlled dry-run mode by default.
- Lever and Ashby remain stubs.
- Real usage accounting / included token logic does not exist yet.

## Phase 1 - Reshape the product around Home

Goal: make Applica understandable without tutorials or onboarding.

### 1.1 Consolidate core setup into Home

- Move profile setup into Home.
- Keep CV upload and CV version history there.
- Add:
  - target roles,
  - salary range,
  - geography,
  - modality,
  - max vacancy age,
  - search cadence,
  - application mode.

### 1.2 Simplify the navigation

- `Home`
- `Applications`
- `Review` only when there is pending work
- `Advanced settings`

### 1.3 Remove onboarding dependency

- No mandatory onboarding gate.
- New users should land in a usable empty state on Home.
- The interface should explain itself through structure, labels, and defaults.

### 1.4 Hide infrastructure from normal users

- Remove third-party AI provider/key configuration.
- Remove platform-token concepts from the main UX.
- Keep only internal/admin surfaces where truly needed.

## Phase 2 - Close the Greenhouse vertical slice

Goal: one real vacancy can move from discovery to confirmed outcome.

- Search or ingest a real vacancy
- Persist it
- Score it
- Generate materials
- Route according to Auto vs Review mode
- Submit through Greenhouse or present for review
- Persist evidence, logs, and outcome

## Phase 3 - Make the system honest and operable

- Clear states: found, preparing, ready for review, submitted, failed, skipped
- Daily/weekly limits based on real submission records
- Better last-run / failure visibility
- Idempotency and retry safety
- Real scheduling by user-selected cadence
- Usage accounting for SaaS tokens / credits

## Phase 4 - Deepen the Greenhouse product

- Keep Applica Greenhouse-only while the core product matures.
- Improve vacancy discovery quality, matching quality, review UX, learning loops, observability, and safety around one platform before expanding breadth.
- Maintain the persistent Greenhouse board registry and discovery pipeline as the current supply layer.

## Phase 5 - SaaS hardening

- Billing and token packages
- Internal AI provider orchestration
- Secret management
- Deployment, monitoring, backups
- Better observability and support tooling

## Final expansion phase - Broaden platform coverage

Only after the Greenhouse product is strong and repeatable:

- Implement Lever.
- Implement Ashby.
- Reassess LinkedIn and other channels separately.
- Add adapter-level tests and operational diagnostics for each new platform.

## Immediate execution order

1. Make the Greenhouse vertical slice robust enough for repeated real use:
   - stronger application-form preview,
   - better blocker handling,
   - truthful UI states,
   - duplicate prevention,
   - real-search progress and supply visibility.
2. Improve ranking quality before expanding breadth:
   - role taxonomy,
   - better country / remote matching,
   - stronger false-positive rejection,
   - learned outcome feedback.
3. Operationalize Greenhouse supply:
   - scheduled discovery,
   - registry refresh,
   - coverage metrics,
   - batched searching.
4. Finish the product layer around the user:
   - daily workflow,
   - clearer history,
   - better review loop,
   - usage visibility,
   - confidence and trust cues.
5. Harden the SaaS layer:
   - billing,
   - limits,
   - observability,
   - deployment,
   - security.
6. Only then broaden platform coverage:
   - Lever,
   - Ashby,
   - later others.

See:

- `NEXT_EXECUTION_PLAN.md` for the completed memory batches.
- `REMAINING_EXECUTION_PLAN.md` for the remaining work required to finish Applica as a product.
