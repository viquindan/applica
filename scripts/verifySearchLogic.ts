/**
 * Standalone verification for the job-matching logic. Runs WITHOUT a database:
 * it exercises the pure scoring + role-taxonomy functions to confirm the
 * relevance fixes behave as intended.
 *
 * Run: npx tsx scripts/verifySearchLogic.ts
 */
import { scoreVacancy, type NormalizedVacancy } from '../src/core/scoring/fitScorer';
import { getRoleFamily, roleMatches, seniorityMatches } from '../src/core/scoring/roleTaxonomy';
import { canonicalizeText } from '../src/core/scoring/synonyms';
import { matchesCountry } from '../src/core/scoring/geography';
import { answerForLabel, autoAnswerFields } from '../src/core/automation/standardAnswers';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(` PASS ${label}`);
  } else {
    failed += 1;
    console.log(` FAIL ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

function makeVacancy(overrides: Partial<NormalizedVacancy>): NormalizedVacancy {
  return {
    id: 'v1',
    platform: 'greenhouse',
    title: 'Head of Finance',
    company: 'acme',
    location: 'Remote - LatAm',
    modality: 'remote',
    description: 'We are hiring a finance leader with experience in SaaS and fintech.',
    url: 'https://example.com/job',
    ...overrides,
  };
}

// A minimal profile; cast to any so we don't need every DB column at runtime.
function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    targetRoles: ['Head of Finance'],
    targetIndustries: ['fintech'],
    targetCountries: ['Mexico'],
    targetSeniority: ['director'],
    targetCompanies: [],
    excludedCompanies: [],
    excludedIndustries: [],
    excludedRoles: [],
    priorityKeywords: [],
    alertKeywords: [],
    skills: [],
    salaryMin: null,
    salaryMax: null,
    workModality: 'remote',
    workModalityPrefs: null,
    ...overrides,
  } as any;
}

console.log('\n=== Role taxonomy ===');
check('CTO maps to engineering_leadership', getRoleFamily('CTO') === 'engineering_leadership', getRoleFamily('CTO'));
check('VP Marketing maps to marketing_leadership', getRoleFamily('VP Marketing') === 'marketing_leadership', getRoleFamily('VP Marketing'));
check('Head of Data maps to data_leadership', getRoleFamily('Head of Data') === 'data_leadership', getRoleFamily('Head of Data'));
check('Head of People maps to people_leadership', getRoleFamily('Head of People') === 'people_leadership', getRoleFamily('Head of People'));
check('CFO still maps to finance_leadership', getRoleFamily('CFO') === 'finance_leadership', getRoleFamily('CFO'));
check('VP Engineering matches "Head of Engineering" by family', roleMatches('VP Engineering', 'Head of Engineering'));

console.log('\n=== Skill match boost ===');
{
  const base = scoreVacancy(
    makeVacancy({ description: 'Looking for a leader. Tools: kubernetes, terraform, python.' }),
    makeProfile({ skills: [] }),
  );
  const withSkills = scoreVacancy(
    makeVacancy({ description: 'Looking for a leader. Tools: kubernetes, terraform, python.' }),
    makeProfile({ skills: [{ skill: 'kubernetes', level: 'expert' }, { skill: 'terraform', level: 'advanced' }] }),
  );
  check('Matching skills raise the score', withSkills.score > base.score, `base=${base.score} withSkills=${withSkills.score}`);
  check('skillMatch breakdown is populated', withSkills.breakdown.skillMatch > 0, `skillMatch=${withSkills.breakdown.skillMatch}`);
}

console.log('\n=== Target company boost ===');
{
  const neutral = scoreVacancy(makeVacancy({ company: 'acme' }), makeProfile());
  const targeted = scoreVacancy(makeVacancy({ company: 'acme' }), makeProfile({ targetCompanies: ['Acme'] }));
  check('Target company adds a boost', targeted.score > neutral.score, `neutral=${neutral.score} targeted=${targeted.score}`);
  check('companyAdjustment is +8', targeted.breakdown.companyAdjustment === 8, `companyAdjustment=${targeted.breakdown.companyAdjustment}`);
}

console.log('\n=== Hard excludes (score must be 0) ===');
{
  const excludedCompany = scoreVacancy(makeVacancy({ company: 'evilcorp' }), makeProfile({ excludedCompanies: ['EvilCorp'] }));
  check('Excluded company -> score 0', excludedCompany.score === 0, `score=${excludedCompany.score}`);
  check('Excluded company -> red flag', excludedCompany.redFlags.some((f) => f.includes('exclusión')));

  const excludedRole = scoreVacancy(makeVacancy({ title: 'Junior Finance Analyst' }), makeProfile({ excludedRoles: ['analyst'] }));
  check('Excluded role -> score 0', excludedRole.score === 0, `score=${excludedRole.score}`);

  const excludedIndustry = scoreVacancy(
    makeVacancy({ description: 'A gambling and casino company seeks a finance leader.' }),
    makeProfile({ excludedIndustries: ['gambling'] }),
  );
  check('Excluded industry -> score 0', excludedIndustry.score === 0, `score=${excludedIndustry.score}`);
}

console.log('\n=== Region / continent location targets (Spanish) ===');
{
  check('US city matches "Norteamérica"', matchesCountry('San Francisco, CA, United States', 'Norteamérica'));
  check('Mexico matches "LATAM"', matchesCountry('Mexico City, Mexico', 'LATAM'));
  check('Colombia matches "LATAM"', matchesCountry('Bogotá, Colombia', 'LATAM'));
  check('Germany matches "Europa"', matchesCountry('Berlin, Germany', 'Europa'));
  check('Global remote matches "LATAM"', matchesCountry('Remote - Worldwide', 'LATAM'));
  check('Global remote matches "Remoto Global"', matchesCountry('Remote, Global', 'Remoto Global'));
  check('US job does NOT match "Europa"', !matchesCountry('Austin, TX, United States', 'Europa'));
  check('EMEA-only remote does NOT match "LATAM"', !matchesCountry('Remote - EMEA', 'LATAM'));
  check('Country-restricted "Remote" does NOT satisfy "Remoto Global"', !matchesCountry('Remote (US)', 'Remoto Global'));
}

console.log('\n=== Role-agnostic: professions outside the curated families ===');
{
  // A nuclear physicist is in NO curated role family, yet must still match.
  check('Nuclear Physicist has no curated family (expected)', getRoleFamily('Nuclear Physicist') === undefined);
  check('Exact-title match works without a family', roleMatches('Nuclear Physicist', 'Nuclear Physicist'));
  check('Arbitrary profession (Sommelier) matches by phrase', roleMatches('Head Sommelier', 'Sommelier'));
  check('IC seniority "senior" is recognized', seniorityMatches('Senior Nuclear Physicist', ['senior']));
  check('IC seniority "staff" maps to principal band', seniorityMatches('Staff Research Scientist', ['principal']));

  const physicistProfile = makeProfile({
    targetRoles: ['Nuclear Physicist'],
    targetIndustries: ['energy'],
    targetSeniority: ['senior'],
    skills: [
      { skill: 'reactor physics', level: 'expert' },
      { skill: 'monte carlo simulation', level: 'advanced' },
      { skill: 'neutron transport', level: 'expert' },
    ],
    experience: [{
      company: 'national lab', role: 'Nuclear Physicist', startDate: '2014', endDate: undefined,
      current: true, description: 'Reactor physics modeling, monte carlo simulation and neutron transport research in the energy sector.',
      achievements: ['Published neutron transport models'],
    }],
  });
  const physicistJob = makeVacancy({
    title: 'Senior Nuclear Physicist',
    company: 'fusionco',
    location: 'Remote - LatAm',
    description: 'Energy research lab seeks a Senior Nuclear Physicist for reactor physics, monte carlo simulation and neutron transport work.',
  });
  const result = scoreVacancy(physicistJob, physicistProfile);
  check('Nuclear physicist job clears the materials threshold (>=60)', result.score >= 60, `score=${result.score} breakdown=${JSON.stringify(result.breakdown)}`);
  check('No false red flags for an out-of-family role', result.redFlags.length === 0, JSON.stringify(result.redFlags));
}

console.log('\n=== Synonym / equivalence canonicalization ===');
{
  check('k8s -> kubernetes', canonicalizeText('we run k8s in prod').includes('kubernetes'));
  check('ml -> machinelearning', canonicalizeText('strong ml background').includes('machinelearning'));
  check('fp&a -> canonical', canonicalizeText('owns fp&a process') === canonicalizeText('owns financial planning and analysis process'));
  check('líder financiero ~ finance leader', canonicalizeText('lider financiero') === canonicalizeText('finance leader'));
  check('does not mangle unrelated words', canonicalizeText('senior product manager').includes('product'));

  // End-to-end: a profile skill should match its alias in the job text.
  const base = scoreVacancy(
    makeVacancy({ description: 'We need someone strong in k8s and terraform.' }),
    makeProfile({ skills: [{ skill: 'azure', level: 'advanced' }] }),
  );
  const aliasMatch = scoreVacancy(
    makeVacancy({ description: 'We need someone strong in k8s and terraform.' }),
    makeProfile({ skills: [{ skill: 'kubernetes', level: 'expert' }] }),
  );
  check('skill "kubernetes" matches job saying "k8s"', aliasMatch.score > base.score, `base=${base.score} alias=${aliasMatch.score}`);
}

console.log('\n=== Expertise match (real background) ===');
{
  const experiencedProfile = makeProfile({
    skills: [{ skill: 'treasury', level: 'expert' }, { skill: 'forecasting', level: 'advanced' }],
    experience: [
      {
        company: 'fintechco', role: 'Finance Director', startDate: '2016', endDate: undefined,
        current: true, description: 'Led treasury, forecasting and fundraising for a fintech scale-up.',
        achievements: ['Built the FP&A function from scratch'],
      },
    ],
    certifications: [{ name: 'CFA', issuer: 'CFA Institute' }],
  });

  const relevantJob = makeVacancy({
    description: 'We need a finance leader to own treasury, forecasting and fundraising at our fintech.',
  });
  const unrelatedJob = makeVacancy({
    description: 'We need a finance leader to manage retail store operations and inventory logistics.',
  });

  const relevant = scoreVacancy(relevantJob, experiencedProfile);
  const unrelated = scoreVacancy(unrelatedJob, experiencedProfile);

  check('Job matching real background scores expertiseMatch > 0', relevant.breakdown.expertiseMatch > 0, `expertiseMatch=${relevant.breakdown.expertiseMatch}`);
  check('Background-relevant job outscores unrelated one', relevant.score > unrelated.score, `relevant=${relevant.score} unrelated=${unrelated.score}`);
  check('Thin profile (no experience) yields expertiseMatch 0', scoreVacancy(relevantJob, makeProfile()).breakdown.expertiseMatch === 0);
}

console.log('\n=== Standard answer classifier (reduce manual pauses) ===');
{
  const user = {
    name: 'Test User',
    relocationAvailable: true,
    noticePeriod: '30 days',
    linkedin: 'https://linkedin.com/in/test',
    portfolio: 'https://test.dev',
    location: 'Mexico City',
    country: 'Mexico',
    salaryMin: null,
    salaryCurrency: 'USD',
    workModality: 'remote' as const,
    workModalityPrefs: null,
  };
  const prof = {
    experience: [{
      company: 'FintechCo', role: 'Finance Director', startDate: '2015', endDate: undefined,
      current: true, description: '', achievements: [],
    }],
  } as any;

  // Factual, safe to answer:
  check('Relocation answered from profile', answerForLabel('Are you willing to relocate?', user, prof) === 'Yes');
  check('Notice period answered', answerForLabel('What is your notice period?', user, prof) === '30 days');
  check('Years of experience computed', Number(answerForLabel('How many years of experience do you have?', user, prof)) >= 10);
  check('LinkedIn answered', answerForLabel('LinkedIn profile URL', user, prof) === user.linkedin);
  check('Current company answered', answerForLabel('Current employer', user, prof) === 'FintechCo');

  // Sensitive: must stay null so the existing pause rules handle them:
  check('Visa/sponsorship NOT auto-answered', answerForLabel('Will you require visa sponsorship?', user, prof) === null);
  check('Salary NOT auto-answered', answerForLabel('What are your salary expectations?', user, prof) === null);
  check('Demographics NOT auto-answered', answerForLabel('What is your gender?', user, prof) === null);

  const { answers, unanswered } = autoAnswerFields(
    ['Are you willing to relocate?', 'Will you require visa sponsorship?', 'What is your notice period?'],
    user, prof,
  );
  check('autoAnswerFields fills the safe ones', Object.keys(answers).length === 2);
  check('autoAnswerFields leaves sensitive unanswered (keeps pausing)', unanswered.length === 1);
}

console.log('\n=== Sanity: a well-matched role scores high ===');
{
  const good = scoreVacancy(
    makeVacancy({
      title: 'Head of Finance',
      company: 'acme',
      description: 'Fintech scale-up hiring a Head of Finance. Skills: fpa, modeling, sql.',
    }),
    makeProfile({
      targetRoles: ['Head of Finance'],
      targetIndustries: ['fintech'],
      skills: [{ skill: 'sql', level: 'advanced' }, { skill: 'modeling', level: 'expert' }],
      priorityKeywords: ['fintech'],
    }),
  );
  check('Strong match scores >= 70', good.score >= 70, `score=${good.score} breakdown=${JSON.stringify(good.breakdown)}`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed === 0 ? 0 : 1);
