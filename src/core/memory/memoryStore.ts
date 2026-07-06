import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { memoryDocuments, memoryPromotions, professionalProfiles, users } from '@/db/schema';
import { getInternalAiConfig } from '../ai/config';

type SeedDocument = {
  documentType: 'memory' | 'skill';
  path: string;
  content: string;
};

function list(values: string[] | null | undefined) {
  return values?.length ? values.map((value) => `- ${value}`).join('\n') : '- No definido aún';
}

function formatModalityPrefs(prefs: any, fallback?: string | null): string {
  if (!prefs) return `- ${fallback ?? 'any'}`;
  const lines: string[] = [];
  if (prefs.acceptsRemote) {
    if (prefs.remoteScope === 'worldwide') lines.push('- Remote: worldwide');
    else if (prefs.remoteRegions?.length) lines.push(`- Remote: ${prefs.remoteRegions.join(', ')}`);
    else lines.push('- Remote: yes');
  }
  if (prefs.acceptsHybrid) {
    lines.push(`- Hybrid: ${prefs.hybridLocations?.length ? prefs.hybridLocations.join(', ') : 'yes'}`);
  }
  if (prefs.acceptsOnsite) {
    lines.push(`- Onsite: ${prefs.onsiteLocations?.length ? prefs.onsiteLocations.join(', ') : 'yes'}`);
  }
  return lines.length ? lines.join('\n') : '- any';
}

export async function ensureUserMemory(userId: string) {
  const [[user], [profile], existing] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    db.select().from(memoryDocuments).where(eq(memoryDocuments.userId, userId)),
  ]);

  if (!user || !profile) return [];
  const existingPaths = new Set(existing.map((doc) => doc.path));

  const docs: SeedDocument[] = [
    {
      documentType: 'memory',
      path: 'memory/profile.md',
      content: `# Candidate profile

## Identity
- Name: ${user.name}
- Location: ${user.location ?? 'No definido aún'}
- Country: ${user.country ?? 'No definido aún'}

## Current professional signal
${profile.achievements ? profile.achievements : 'Aún no hay logros resumidos en memoria.'}
`,
    },
    {
      documentType: 'memory',
      path: 'memory/search_intent.md',
      content: `# Search intent

## Target roles
${list(profile.targetRoles)}

## Target regions
${list(profile.targetCountries)}

## Target industries
${list(profile.targetIndustries)}

## Salary
- Minimum: ${user.salaryMin ?? 'No definido aún'} ${user.salaryCurrency ?? ''}
- Maximum: ${user.salaryMax ?? 'No definido aún'} ${user.salaryCurrency ?? ''}

## Work modality
${formatModalityPrefs(user.workModalityPrefs, user.workModality)}
`,
    },
    {
      documentType: 'memory',
      path: 'memory/reusable_answers.md',
      content: `# Reusable answers

This document stores stable answers Applica can reuse safely in future applications.

## Current entries
- No reusable answers captured yet.
`,
    },
    {
      documentType: 'memory',
      path: 'memory/applications/learning_log.md',
      content: `# Application learning log

Chronological lessons from approvals, skips, edits, interviews, and outcomes.
`,
    },
    {
      documentType: 'memory',
      path: 'memory/applications/rejected_patterns.md',
      content: `# Rejected patterns

Durable patterns inferred from roles or employers the user rejects.
`,
    },
    {
      documentType: 'memory',
      path: 'memory/applications/interviews.md',
      content: `# Market responses

Confirmed employer contact events. This is the primary success signal for Applica.
`,
    },
    {
      documentType: 'skill',
      path: 'skills/application_strategy.md',
      content: `# Application strategy

## Operating rule
Prioritize fit, truthfulness, and expected interview value over application volume.

## Default behavior
- Prefer roles aligned with the candidate's target intent.
- Abstain when the role is materially misaligned.
- Escalate only when human judgment changes the outcome.
`,
    },
    {
      documentType: 'skill',
      path: 'skills/tailoring_preferences.md',
      content: `# Tailoring preferences

## Guardrails
- Never invent experience.
- Preserve factual claims, dates, titles, and metrics.
- Reframe only with evidence already present in the candidate profile.
`,
    },
    {
      documentType: 'skill',
      path: 'skills/employer_filters.md',
      content: `# Employer filters

## Current rules
- No durable employer filters learned yet.
`,
    },
    {
      documentType: 'skill',
      path: 'skills/answer_generation.md',
      content: `# Answer generation

## Current rules
- Reuse only answers that the user has explicitly provided or approved.
`,
    },
  ];

  const missing = docs.filter((doc) => !existingPaths.has(doc.path));
  if (missing.length) {
    // onConflictDoNothing + the memory_documents_user_path_uq unique index: two
    // concurrent ensureUserMemory calls used to BOTH pass the check above and
    // insert duplicate rows; reads then picked the fresh (near-empty) duplicate,
    // shadowing the user's whole learned answer bank (looked like data loss).
    await db.insert(memoryDocuments).values(missing.map((doc) => ({
      userId,
      documentType: doc.documentType,
      path: doc.path,
      content: doc.content,
      source: 'system',
    }))).onConflictDoNothing();
  }

  return db.select().from(memoryDocuments).where(eq(memoryDocuments.userId, userId));
}

export async function refreshCoreMemory(userId: string) {
  const [[user], [profile]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
  ]);
  if (!user || !profile) return;

  const updates = [
    {
      path: 'memory/profile.md',
      content: `# Candidate profile

## Identity
- Name: ${user.name}
- Location: ${user.location ?? 'No definido aún'}
- Country: ${user.country ?? 'No definido aún'}

## Current professional signal
${profile.achievements ? profile.achievements : 'Aún no hay logros resumidos en memoria.'}
`,
    },
    {
      path: 'memory/search_intent.md',
      content: `# Search intent

## Target roles
${list(profile.targetRoles)}

## Target regions
${list(profile.targetCountries)}

## Target industries
${list(profile.targetIndustries)}

## Salary
- Minimum: ${user.salaryMin ?? 'No definido aún'} ${user.salaryCurrency ?? ''}
- Maximum: ${user.salaryMax ?? 'No definido aún'} ${user.salaryCurrency ?? ''}

## Work modality
${formatModalityPrefs(user.workModalityPrefs, user.workModality)}
`,
    },
  ];

  for (const update of updates) {
    const [existing] = await db.select().from(memoryDocuments)
      .where(and(eq(memoryDocuments.userId, userId), eq(memoryDocuments.path, update.path)))
      .limit(1);
    if (!existing) continue;
    await db.update(memoryDocuments).set({
      content: update.content,
      version: existing.version + 1,
      source: 'system_refresh',
      updatedAt: new Date(),
    }).where(eq(memoryDocuments.id, existing.id));
  }
}

export async function appendLearningEvent(userId: string, entry: string) {
  await ensureUserMemory(userId);
  const [log] = await db.select().from(memoryDocuments)
    .where(and(eq(memoryDocuments.userId, userId), eq(memoryDocuments.path, 'memory/applications/learning_log.md')))
    .limit(1);
  if (!log) return;

  await db.update(memoryDocuments).set({
    content: `${log.content.trim()}\n\n- ${new Date().toISOString()}: ${entry}\n`,
    version: log.version + 1,
    source: 'interaction',
    updatedAt: new Date(),
  }).where(eq(memoryDocuments.id, log.id));
}

export async function getUserMemoryContext(userId: string) {
  const docs = await ensureUserMemory(userId);
  return docs
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((doc) => `## ${doc.path}\n${doc.content}`)
    .join('\n\n');
}

export async function getRelevantMemoryContext(userId: string, vacancy: { title: string; company: string }) {
  const docs = await ensureUserMemory(userId);
  const alwaysRelevant = new Set([
    'memory/profile.md',
    'memory/search_intent.md',
    'skills/application_strategy.md',
    'skills/tailoring_preferences.md',
    'skills/employer_filters.md',
  ]);
  const candidateDocs = docs.filter((doc) =>
    alwaysRelevant.has(doc.path) ||
    doc.content.toLowerCase().includes(vacancy.title.toLowerCase()) ||
    doc.content.toLowerCase().includes(vacancy.company.toLowerCase()),
  );

  return candidateDocs
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((doc) => `## ${doc.path}\n${doc.content}`)
    .join('\n\n');
}

export async function getReusableAnswersMap(userId: string) {
  const docs = await ensureUserMemory(userId);
  const reusable = docs.find((doc) => doc.path === 'memory/reusable_answers.md');
  if (!reusable) return {};

  const answers: Record<string, string> = {};
  const lines = reusable.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const question = lines[i].match(/^- Q:\s*(.+)$/)?.[1]?.trim();
    const answer = lines[i + 1]?.match(/^\s*A:\s*(.+)$/)?.[1]?.trim();
    if (question && answer) answers[question] = answer;
  }
  return answers;
}

export async function captureMaterialEditLearning(
  userId: string,
  kind: 'cv' | 'letter',
  before: string,
  after: string,
  role?: string,
  company?: string,
) {
  await ensureUserMemory(userId);
  const ai = getInternalAiConfig();
  let lesson = `${kind === 'cv' ? 'CV' : 'Cover letter'} edited by user for ${role ?? 'unknown role'} at ${company ?? 'unknown company'}.`;

  if (ai) {
    const { generateText } = await import('ai');
    const { google } = await import('@ai-sdk/google');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;
    const { text } = await generateText({
      model: google(ai.model),
      maxOutputTokens: 220,
      prompt: `Summarize the durable user preference revealed by this edit in one sentence.
Return only the sentence. Do not mention that this was an edit.

Material type: ${kind}
Role: ${role ?? 'Unknown'}
Company: ${company ?? 'Unknown'}

BEFORE:
${before.slice(0, 2500)}

AFTER:
${after.slice(0, 2500)}
`,
    });
    lesson = text.trim() || lesson;
  }

  await appendLearningEvent(userId, lesson);

  if (kind === 'cv') {
    await appendToSkill(userId, 'skills/tailoring_preferences.md', `- ${lesson}`);
  }
}

export async function captureApplicationDecisionLearning(
  userId: string,
  action: 'approve' | 'skip' | 'archive',
  vacancy: { title?: string | null; company?: string | null; location?: string | null; platform?: string | null },
) {
  await ensureUserMemory(userId);
  const summary = `${action} - ${vacancy.title ?? 'Unknown role'} at ${vacancy.company ?? 'Unknown company'} (${vacancy.location ?? 'location unknown'}, ${vacancy.platform ?? 'platform unknown'}).`;
  await appendLearningEvent(userId, summary);

  if (action === 'skip' || action === 'archive') {
    await appendToDocument(userId, 'memory/applications/rejected_patterns.md', `- ${summary}`);
    await appendToSkill(userId, 'skills/employer_filters.md', `- Treat similar cases cautiously: ${summary}`);
  }
}

export async function captureReusableAnswer(userId: string, question: string, answer: string) {
  await ensureUserMemory(userId);
  const cleanQuestion = question.trim();
  const cleanAnswer = answer.trim();
  if (!cleanQuestion || !cleanAnswer) return;

  await appendToDocument(
    userId,
    'memory/reusable_answers.md',
    `- Q: ${cleanQuestion}\n A: ${cleanAnswer}`,
  );
  await appendToSkill(
    userId,
    'skills/answer_generation.md',
    `- Reusable answer approved by user: "${cleanQuestion}" -> "${cleanAnswer}"`,
  );
}

export async function captureMarketResponseLearning(
  userId: string,
  response: 'contacted' | 'rejected',
  vacancy: { title?: string | null; company?: string | null; location?: string | null; platform?: string | null },
) {
  await ensureUserMemory(userId);
  const summary = `${response} - ${vacancy.title ?? 'Unknown role'} at ${vacancy.company ?? 'Unknown company'} (${vacancy.location ?? 'location unknown'}, ${vacancy.platform ?? 'platform unknown'}).`;
  await appendLearningEvent(userId, summary);
  await appendToDocument(userId, 'memory/applications/interviews.md', `- ${summary}`);
}

export async function refreshOutcomeSummaryMemory(
  userId: string,
  metrics: {
    contacted: number;
    rejected: number;
    resolved: number;
    contactRate: number;
    rolePerformance: Array<{ role: string; label?: string; contacted: number; rejected: number; total: number; contactRate: number }>;
  },
) {
  await ensureUserMemory(userId);
  const [doc] = await db.select().from(memoryDocuments)
    .where(and(eq(memoryDocuments.userId, userId), eq(memoryDocuments.path, 'memory/applications/interviews.md')))
    .limit(1);
  if (!doc) return;

  const content = `# Market responses

Confirmed employer contact events. This is the primary success signal for Applica.

## Summary
- Resolved outcomes: ${metrics.resolved}
- Contacted: ${metrics.contacted}
- Rejected: ${metrics.rejected}
- Contact rate: ${metrics.contactRate}%

## Role performance
${metrics.rolePerformance.length
    ? metrics.rolePerformance.map((item) => `- ${item.label ?? item.role}: ${item.contacted}/${item.total} contacted (${item.contactRate}%)`).join('\n')
    : '- No resolved outcomes yet.'}
`;

  await db.update(memoryDocuments).set({
    content,
    version: doc.version + 1,
    source: 'outcome_refresh',
    updatedAt: new Date(),
  }).where(eq(memoryDocuments.id, doc.id));
}

export async function promoteMemoryToSkills(userId: string) {
  const docs = await ensureUserMemory(userId);
  const relevant = docs.filter((doc) => [
    'memory/applications/learning_log.md',
    'memory/applications/rejected_patterns.md',
    'memory/reusable_answers.md',
  ].includes(doc.path));

  const ai = getInternalAiConfig();
  if (!ai || relevant.length === 0) return { promoted: false, reason: 'No AI or no memory' };

  const { generateText } = await import('ai');
  const { google } = await import('@ai-sdk/google');
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;

  const { text } = await generateText({
    model: google(ai.model),
    maxOutputTokens: 900,
    prompt: `You are maintaining durable user-specific operating rules for a career agent.

Read the memory below and return strict JSON with this exact shape:
{
  "summary": "brief explanation of what was promoted",
  "applicationStrategy": ["rule 1", "rule 2"],
  "tailoringPreferences": ["rule 1", "rule 2"],
  "employerFilters": ["rule 1", "rule 2"],
  "answerGeneration": ["rule 1", "rule 2"]
}

Rules:
- Promote only repeated, durable, or clearly high-signal patterns.
- Do not invent preferences.
- If there is insufficient evidence for a section, return an empty array.
- Prefer concise imperative rules.

MEMORY:
${relevant.map((doc) => `## ${doc.path}\n${doc.content}`).join('\n\n')}
`,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { promoted: false, reason: 'No JSON' };

  const parsed = JSON.parse(jsonMatch[0]) as {
    summary?: string;
    applicationStrategy?: string[];
    tailoringPreferences?: string[];
    employerFilters?: string[];
    answerGeneration?: string[];
  };

  const writes: Array<{ path: string; heading: string; rules?: string[] }> = [
    { path: 'skills/application_strategy.md', heading: '## Learned rules', rules: parsed.applicationStrategy },
    { path: 'skills/tailoring_preferences.md', heading: '## Learned rules', rules: parsed.tailoringPreferences },
    { path: 'skills/employer_filters.md', heading: '## Learned rules', rules: parsed.employerFilters },
    { path: 'skills/answer_generation.md', heading: '## Learned rules', rules: parsed.answerGeneration },
  ];

  const touched: string[] = [];
  for (const write of writes) {
    if (!write.rules?.length) continue;
    await replaceLearnedRules(userId, write.path, write.heading, write.rules);
    touched.push(write.path);
  }

  await db.insert(memoryPromotions).values({
    userId,
    sourcePaths: relevant.map((doc) => doc.path),
    targetPaths: touched,
    summary: parsed.summary || 'Promoted memory into reusable skills.',
  });

  return {
    promoted: touched.length > 0,
    touched,
    summary: parsed.summary || 'Promoted memory into reusable skills.',
  };
}

async function appendToSkill(userId: string, path: string, entry: string) {
  return appendToDocument(userId, path, entry);
}

async function appendToDocument(userId: string, path: string, entry: string) {
  const [doc] = await db.select().from(memoryDocuments)
    .where(and(eq(memoryDocuments.userId, userId), eq(memoryDocuments.path, path)))
    .limit(1);
  if (!doc) return;

  await db.update(memoryDocuments).set({
    content: `${doc.content.trim()}\n${entry}\n`,
    version: doc.version + 1,
    source: 'interaction',
    updatedAt: new Date(),
  }).where(eq(memoryDocuments.id, doc.id));
}

async function replaceLearnedRules(userId: string, path: string, heading: string, rules: string[]) {
  const [doc] = await db.select().from(memoryDocuments)
    .where(and(eq(memoryDocuments.userId, userId), eq(memoryDocuments.path, path)))
    .limit(1);
  if (!doc) return;

  const block = `${heading}\n${rules.map((rule) => `- ${rule}`).join('\n')}`;
  const nextContent = doc.content.includes(heading)
    ? doc.content.replace(new RegExp(`${escapeRegExp(heading)}[\\s\\S]*$`), block)
    : `${doc.content.trim()}\n\n${block}\n`;

  await db.update(memoryDocuments).set({
    content: nextContent,
    version: doc.version + 1,
    source: 'promotion',
    updatedAt: new Date(),
  }).where(eq(memoryDocuments.id, doc.id));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
