# Applica Product Strategy

## 1. Vision

Applica is not an auto-apply tool.

Applica is a career agent that:

1. understands the candidate,
2. discovers relevant opportunities continuously,
3. judges which ones are worth pursuing,
4. prepares truthful, tailored applications,
5. submits autonomously when safe,
6. asks for human judgment only when it matters,
7. learns from outcomes to improve the search over time.

The long-term promise is simple:

> Tell Applica the career move you want. Applica keeps the search alive every day until applications start turning into employer contact.

The deeper promise is more defensible:

> Over time, Applica should become better at helping *you* than a generic assistant could be on day one, because Applica remembers your history, learns your preferences, observes what converts, and builds career context that compounds.

## 2. Why this product should exist

Job search is structurally broken:

- candidates waste hours searching, filtering, rewriting, and re-entering the same information;
- employers are flooded with low-quality applications;
- generic AI tools increase volume but not necessarily signal;
- most job-search products still leave the user doing the coordination work.

The opportunity is not to help people send more applications.

The opportunity is to help qualified people maintain a high-quality, persistent search with far less cognitive load.

## 3. Product thesis

The winning product is not:

- a resume builder,
- a tracker,
- an autofill extension,
- or a spammy auto-applier.

The winning product is an agent with memory, judgment, and workflow ownership.

The strategic asset is not just automation. It is accumulated context.

General-purpose AI assistants compete on model quality, but users often remain loyal to the assistant that already knows them: their preferences, history, tone, constraints, and unfinished threads. Applica should build the same kind of switching cost in the job-search domain. A new competitor may sound polished on the first interaction; Applica should become materially more useful by month three because it has learned the candidate's real search behavior.

Applica should own the loop:

```text
candidate intent
   -> opportunity discovery
   -> qualification
   -> application strategy
   -> tailored execution
   -> outcome capture
   -> learning
   -> better next search
```

## 4. Ideal customer profile

### Initial ICP

Professionals whose time is expensive and whose searches benefit from quality over raw volume:

- senior individual contributors,
- managers,
- directors,
- executives,
- specialists in finance, product, operations, data, software, and commercial roles,
- internationally mobile professionals with explicit constraints.

### Why this ICP first

- They feel the cost of manual search acutely.
- They can articulate target roles and constraints clearly.
- One additional strong interview is economically meaningful.
- They are more willing to pay for leverage, not novelty.
- Their searches are easier to judge with quality signals than entry-level spray-and-pray markets.

## 5. Positioning

### Category

AI career agent

### One-line positioning

Applica is the AI career agent that finds, prepares, and manages the applications worth making - so your job search keeps moving while you focus on your life.

### What we are not

- Not a resume template marketplace.
- Not a generic job tracker.
- Not a one-click spam bot.
- Not a tool that requires users to understand ATS internals, platform tokens, or AI providers.

### Emotional promise

Relief.

The product should feel like the search is finally being carried by someone competent.

## 6. Core product experience

### Home

The command center.

The user configures:

- CV and CV versions
- target roles
- salary range
- preferred countries / regions
- remote / hybrid / onsite
- maximum vacancy age
- search cadence
- application mode:
  - `Automatic`
  - `Review before applying`

The user sees:

- what Applica did today,
- what it found,
- what it sent,
- what needs review,
- whether the search is healthy.

### Applications

The canonical history of the search.

Every opportunity should show:

- why it matched,
- why Applica acted or did not act,
- what materials were prepared,
- what was submitted,
- the current outcome.

### Review

The exception queue.

Review should contain only:

- applications requiring user approval,
- ambiguous answers,
- salary / immigration / custom questions,
- edge cases where Applica is uncertain.

### Later-stage surfaces

- Interview pipeline
- Recruiter/contact history
- Search performance analytics
- Offer comparison
- Negotiation support

## 7. Product principles

### 7.1 Work, do not expose work

Hide:

- platform details,
- provider choices,
- tokens,
- internal scoring knobs,
- adapter complexity.

Expose:

- goals,
- confidence,
- decisions,
- exceptions,
- outcomes.

### 7.2 Quality beats volume

The primary success metric is not “applications sent.”

The primary success metrics are:

- qualified opportunities found,
- employer-contact rate,
- reply rate,
- user hours saved,
- search continuity over time.

### 7.3 Human judgment is scarce; spend it carefully

Ask the user only when:

- truthfulness is at stake,
- ambiguity is material,
- the answer depends on personal preference,
- or the action is irreversible and confidence is insufficient.

### 7.4 Earn autonomy

Autonomy should expand with evidence:

- first explain,
- then assist,
- then automate where reliability is proven.

### 7.5 No fake confidence

Every important action should have:

- a reason,
- a trace,
- and a recoverable failure path.

### 7.6 Context compounds

Every user interaction should improve the next decision:

- roles they accept or reject,
- companies they repeatedly favor or avoid,
- salary flexibility,
- geographies they bend on,
- edits they make to generated materials,
- applications they approve or skip,
- interviews they receive,
- offers they decline,
- and the stories that consistently represent them best.

Applica should not merely store this history. It should use it to search, rank, tailor, and abstain better over time.

The product should feel less like setting filters and more like being understood.

### 7.7 Memory should be agent-native

If Applica is an agent, its memory must be easy for an agent to use.

The system should preserve a structured, versioned, human-readable memory layer for each user - not only normalized database fields. That memory should include markdown-like artifacts and reusable skill documents that capture:

- candidate biography,
- search intent,
- hard constraints,
- soft preferences,
- voice and style,
- reusable answers,
- recurring edits,
- approved narratives,
- lessons from past applications,
- interview feedback,
- role-specific playbooks.

The database stores facts. The memory layer stores meaning.

This architecture is fundamental because the quality of future AI decisions depends on how cheaply and reliably the system can recover relevant context at the moment of action.

## 8. Business model

### Core model

Subscription SaaS with included usage.

Each plan includes:

- a search cadence allowance,
- a monthly opportunity-processing allowance,
- a monthly application-preparation / submission allowance,
- a bundle of AI usage.

Users can buy additional credits when they need more throughput.

### Why this model fits

- It aligns recurring value with recurring work.
- It supports platform-owned AI keys and orchestration.
- It avoids asking users to bring infrastructure.
- It creates room for tiers based on autonomy, cadence, and volume.

### Possible future tiers

#### Essential
- daily search
- manual review mode
- limited applications

#### Pro
- multiple daily scans
- automatic mode
- higher application volume
- richer tailoring

#### Executive
- priority processing
- deeper personalization
- recruiter outreach support
- interview / offer analytics

## 9. Moat and defensibility

### Weak moats

- scraping
- autofill
- prompt templates
- UI polish alone

### Stronger moats

- outcome data over time
- learned candidate preference models
- application-success feedback loops
- adapter reliability and operational knowledge
- user trust built through transparent judgment
- search history becoming a proprietary career graph
- accumulated user-specific context that makes leaving feel like starting over
- agent-native memory artifacts and reusable user-specific skills

The product becomes more defensible when it knows:

- which roles a candidate actually converts on,
- which employers respond,
- which tailoring strategies improve outcomes,
- which constraints are hard versus soft,
- and when to abstain.

This is the Applica version of the "ChatGPT already knows me" effect:

- the longer a user stays,
- the more Applica learns,
- the more relevant its search becomes,
- the less attractive a stateless competitor feels.

That compounding familiarity is not cosmetic UX. It is core product value.

The best version of Applica should accumulate an internal corpus for each user that behaves like a private operating manual for their career. The more complete and better-organized that corpus becomes, the more precise Applica can be without repeatedly asking the same questions.

## 10. Commercial risks

### 10.1 Market crowding

There are already many products around:

- resume generation,
- tracking,
- autofill,
- auto-apply.

Mitigation:

- avoid competing on feature count,
- compete on agentic continuity and outcome quality.

### 10.2 Spam category risk

If Applica looks like a high-volume blast tool, it will inherit the reputation of low-signal automation.

Mitigation:

- optimize for fit and interview rate,
- keep clear rationale,
- make abstention a first-class behavior.

### 10.3 Supply risk

If opportunity discovery is weak, the entire product promise collapses.

Mitigation:

- prioritize reliable, broad vacancy intake early,
- measure freshness and recall,
- avoid hiding weak supply behind pretty UI.

### 10.4 Platform dependency

ATS and job-board surfaces can change.

Mitigation:

- build adapters as operational systems,
- keep evidence,
- maintain fallbacks,
- prefer official APIs where available,
- avoid overconcentration in one source.

### 10.5 Unit economics

High-activity users may consume substantial AI and automation resources.

Mitigation:

- instrument cost per workflow stage,
- bundle usage intentionally,
- make additional credits natural,
- learn which steps truly require expensive models.

### 10.6 Trust and liability

A wrong autonomous application can be costly to the user.

Mitigation:

- conservative autonomy,
- explicit exception handling,
- truthfulness safeguards,
- full audit trail,
- user-visible submitted content.

## 11. Key strategic metrics

### North star

Qualified employer contacts generated per active user per month

### Supporting metrics

- time from signup to first useful vacancy
- time from signup to first submitted application
- percentage of found vacancies judged relevant by the user
- application-to-contact rate
- user hours saved
- percentage of applications requiring manual intervention
- abstention accuracy
- cost per qualified application
- retention through the active search period

### Anti-metrics

- raw applications sent
- total vacancies scraped
- total CVs generated

These are useful operationally, but dangerous as product north stars.

## 12. MVP definition

The MVP is not “all job boards.”

The MVP is:

1. a clear Home,
2. one reliable source of vacancies,
3. one reliable application path,
4. high-quality rationale,
5. manual and automatic modes,
6. a visible application history,
7. enough instrumentation to know whether users get contacted.

The MVP should also establish the first version of the memory architecture:

- a durable user profile artifact,
- a search-intent artifact,
- a reusable answers artifact,
- and a versioned application-learning log.

Even if early implementations are simple, the product should begin accumulating memory from day one rather than trying to retrofit it later.

## 13. Validation plan

### Stage 1 - Founder-led cohort

- 10-20 real users
- 2-4 weeks
- narrow role families
- frequent qualitative interviews

Learn:

- whether users trust recommendations,
- whether manual review gets completed,
- whether automatic mode is desired after observing quality,
- whether applications generate replies.

### Stage 2 - Narrow paid pilot

- charge early,
- keep scope constrained,
- test willingness to pay for continuity rather than feature breadth.

### Stage 3 - Scale only after signal

- broaden sources,
- broaden roles,
- add billing sophistication,
- deepen outcome learning.

## 14. Near-term product roadmap

### Phase A - Reframe the product

- Build Home
- Move CV, targets, cadence, and mode into Home
- Remove onboarding as a required concept
- Hide AI providers and platform tokens from normal users
- Establish the first per-user memory artifacts and retrieval path

### Phase B - Prove the agent loop

- Reliable discovery
- Reliable qualification
- Reliable application prep
- Review / auto-submit routing
- Outcome history

### Phase C - Learn

- Capture user edits
- Capture approvals / rejections
- Capture interviews and outcomes
- Feed those signals back into ranking and tailoring
- Promote repeated patterns into reusable user-specific skills

### Phase D - Monetize

- Plan tiers
- included usage
- credit top-ups
- analytics for cost and conversion

## 15. Agent-oriented architecture

### Memory layers

Applica should use both structured data and agent-native documents.

#### Structured data

Best for:

- filters,
- joins,
- analytics,
- permissions,
- operational state.

#### Agent-native memory

Best for:

- biographies,
- nuanced preferences,
- writing style,
- decisions and rationales,
- lessons learned,
- reusable playbooks.

### Suggested per-user memory set

```text
/users/{userId}/memory/
  profile.md
  search_intent.md
  voice_and_style.md
  reusable_answers.md
  role_playbooks/
    head-of-finance.md
    cfo.md
  applications/
    learning_log.md
    interviews.md
    rejected_patterns.md
```

### Suggested user-specific skill set

```text
/users/{userId}/skills/
  application_strategy.md
  tailoring_preferences.md
  employer_filters.md
  answer_generation.md
```

### Design rule

If Applica repeatedly needs the same judgment, that judgment should graduate from transient context into durable memory or a reusable skill.

This is what allows the agent to improve economically:

- less repeated reasoning,
- better retrieval,
- lower prompt entropy,
- more consistent decisions,
- stronger personalization.

## 16. Final strategic stance

Applica should be ambitious.

The world does not need another dashboard that helps anxious people manage rejection more neatly.

It needs a competent agent that carries the repetitive burden of the search, preserves human dignity, and gets better at finding the doors that are actually worth knocking on.

The endgame is not merely that Applica works for the user.

It is that Applica comes to know the user's career well enough that replacing it would feel like explaining yourself from scratch to a stranger.
