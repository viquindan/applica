import { db } from '@/db/client';
import { atsDiscoveryCategories } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { growRegistryFromCompanies, getKnownTokenRatio } from './atsRegistry';

/**
 * Recurring, high-yield company discovery: pull real company names from public
 * Wikipedia category listings (by city, industry, and founding year) and probe
 * each one against every ATS platform via growRegistryFromCompanies.
 *
 * This exists because the pre-existing discover_ats_boards job (SERP scraping
 * of DuckDuckGo/Bing for ATS domain URLs) yields very few new boards per run.
 * A one-off manual backfill against these same category lists took the active
 * registry from 71 to 1,012 boards in a single session (2026-07-17) - this job
 * automates that technique so growth continues without manual intervention.
 *
 * Self-expanding pool (2026-07-23): the category list used to be a hardcoded
 * array. growRegistryFromCompanies permanently skips any company name it has
 * already probed (success or miss, by design - never re-probe a dead token),
 * so reusing the SAME fixed list forever eventually saturates it - confirmed
 * live that a sampled category was 74% already-known, matching the real
 * probed=0 added=0 pattern seen in production logs. Categories now live in
 * `ats_discovery_categories` (seeded once from SEED_CATEGORIES below) and a
 * weekly job (discoverNewWikipediaCategories) crawls Wikipedia's own category
 * tree - by industry, by country, by city, by founding year - to keep adding
 * genuinely new categories on its own, no manual re-curation required.
 */

const SEED_CATEGORIES: string[] = [
  // Industry
  'Category:Health_care_companies_of_the_United_States',
  'Category:Retail_companies_of_the_United_States',
  'Category:Financial_services_companies_of_the_United_States',
  'Category:Biotechnology_companies_of_the_United_States',
  'Category:Consulting_firms',
  'Category:Software_companies_of_the_United_States',
  'Category:Hospitality_companies',
  'Category:Logistics_companies_of_the_United_States',
  'Category:Insurance_companies_of_the_United_States',
  'Category:Educational_technology_companies',
  'Category:Real_estate_companies_of_the_United_States',
  'Category:Video_game_companies_of_the_United_States',
  'Category:Mass_media_companies_of_the_United_States',
  'Category:Non-profit_organizations_based_in_the_United_States',
  'Category:Law_firms_of_the_United_States',
  'Category:Manufacturing_companies_of_the_United_States',
  'Category:Telecommunications_companies_of_the_United_States',
  'Category:Energy_companies_of_the_United_States',
  'Category:Agriculture_companies_of_the_United_States',
  'Category:Transport_companies_of_the_United_States',
  'Category:Pharmaceutical_companies_of_the_United_States',
  'Category:Human_resource_management_companies',
  'Category:Marketing_companies_of_the_United_States',
  'Category:Cloud_computing_providers',
  'Category:Artificial_intelligence_companies_of_the_United_States',
  'Category:Cybersecurity_companies',
  'Category:E-commerce_companies_of_the_United_States',
  'Category:Online_companies_of_the_United_States',
  'Category:Software_companies_of_Canada',
  'Category:Software_companies_of_the_United_Kingdom',
  'Category:Financial_technology_companies_of_the_United_Kingdom',
  'Category:Health_care_companies_of_Canada',
  'Category:E-commerce_companies',
  'Category:Big_data_companies',
  'Category:Robotics_companies',
  // Founding year (fresh companies keep entering these every year)
  'Category:Companies_established_in_2015',
  'Category:Companies_established_in_2016',
  'Category:Companies_established_in_2017',
  'Category:Companies_established_in_2018',
  'Category:Companies_established_in_2019',
  'Category:Companies_established_in_2020',
  'Category:Companies_established_in_2021',
  'Category:Companies_established_in_2022',
  'Category:Companies_established_in_2023',
  'Category:Companies_established_in_2024',
  'Category:Companies_established_in_2025',
  'Category:Companies_established_in_2026',
  // Cities - startup-dense hubs and major markets worldwide
  'Category:Companies_based_in_San_Francisco',
  'Category:Companies_based_in_New_York_City',
  'Category:Companies_based_in_Austin,_Texas',
  'Category:Companies_based_in_Seattle',
  'Category:Companies_based_in_Boston',
  'Category:Companies_based_in_Los_Angeles',
  'Category:Companies_based_in_Chicago',
  'Category:Companies_based_in_Denver',
  'Category:Companies_based_in_Atlanta',
  'Category:Companies_based_in_Miami',
  'Category:Companies_based_in_Dallas',
  'Category:Companies_based_in_Portland,_Oregon',
  'Category:Companies_based_in_San_Diego',
  'Category:Companies_based_in_Houston',
  'Category:Companies_based_in_Salt_Lake_City',
  'Category:Companies_based_in_Nashville,_Tennessee',
  'Category:Companies_based_in_Raleigh,_North_Carolina',
  'Category:Companies_based_in_Minneapolis',
  'Category:Companies_based_in_Detroit',
  'Category:Companies_based_in_Philadelphia',
  'Category:Companies_based_in_Pittsburgh',
  'Category:Companies_based_in_Toronto',
  'Category:Companies_based_in_Vancouver',
  'Category:Companies_based_in_Montreal',
  'Category:Companies_based_in_Waterloo,_Ontario',
  'Category:Companies_based_in_London',
  'Category:Companies_based_in_Berlin',
  'Category:Companies_based_in_Paris',
  'Category:Companies_based_in_Amsterdam',
  'Category:Companies_based_in_Dublin_(city)',
  'Category:Companies_based_in_Barcelona',
  'Category:Companies_based_in_Madrid',
  'Category:Companies_based_in_Tel_Aviv',
  'Category:Companies_based_in_Bangalore',
  'Category:Companies_based_in_Mumbai',
  'Category:Companies_based_in_Sao_Paulo',
  'Category:Companies_based_in_Mexico_City',
  'Category:Companies_based_in_Bogota',
  'Category:Companies_based_in_Buenos_Aires',
  'Category:Companies_based_in_Santiago,_Chile',
  'Category:Companies_based_in_Sydney',
  'Category:Companies_based_in_Melbourne',
  'Category:Companies_based_in_Singapore',
  'Category:Companies_based_in_Hong_Kong',
  'Category:Companies_based_in_Cape_Town',
  'Category:Companies_based_in_Lagos',
  'Category:Companies_based_in_Nairobi',
  'Category:Companies_based_in_Dubai',
  'Category:Companies_based_in_Phoenix,_Arizona',
  'Category:Companies_based_in_Charlotte,_North_Carolina',
  'Category:Companies_based_in_Columbus,_Ohio',
  'Category:Companies_based_in_Indianapolis',
  'Category:Companies_based_in_Kansas_City,_Missouri',
  'Category:Companies_based_in_Milwaukee',
  'Category:Companies_based_in_Tampa,_Florida',
  'Category:Companies_based_in_Orlando,_Florida',
  'Category:Companies_based_in_Vienna',
  'Category:Companies_based_in_Zurich',
  'Category:Companies_based_in_Stockholm',
  'Category:Companies_based_in_Copenhagen',
  'Category:Companies_based_in_Warsaw',
  'Category:Companies_based_in_Prague',
  'Category:Companies_based_in_Tokyo',
  'Category:Companies_based_in_Seoul',
  'Category:Companies_based_in_Taipei',
  'Category:Companies_based_in_Jakarta',
  'Category:Companies_based_in_Manila',
  'Category:Companies_based_in_Riyadh',
  'Category:Companies_based_in_Doha',
  'Category:Companies_based_in_Johannesburg',
  'Category:Aerospace_companies_of_the_United_States',
  'Category:Automotive_companies_of_the_United_States',
  'Category:Semiconductor_companies_of_the_United_States',
  'Category:Video_game_publishers',
  'Category:Clothing_companies_of_the_United_States',
  'Category:Restaurant_companies_of_the_United_States',
  'Category:Construction_and_civil_engineering_companies_of_the_United_States',
  'Category:Renewable_energy_companies_of_the_United_States',
  'Category:Waste_management_companies_of_the_United_States',
  'Category:Sporting_goods_companies_of_the_United_States',
];

// Broad, real Wikipedia category-tree nodes (verified live 2026-07-23 to
// exist and contain real subcategories) crawled one level deep to find NEW
// leaf categories automatically - this is what replaces manually noticing
// "the list is exhausted" and hand-adding more each session.
const CATEGORY_TREE_SEEDS = [
  'Category:Companies_by_industry',
  'Category:Companies_by_country',
  'Category:Companies_by_city',
  'Category:Companies_by_year_of_establishment',
];

const WIKI_UA = 'ApplicaBot/1.0 (job search engine; company discovery)';

// Rotate through a slice each run instead of hitting every category every time
// (Wikipedia is a shared public resource - be a reasonable citizen).
const CATEGORIES_PER_RUN = 6;

// A category counts as "mined dry" once this much of a batch is already known
// (previously probed, success or miss) - no point re-fetching the same ~500
// names forever once the pool has converged.
const EXHAUSTION_KNOWN_RATIO = 0.9;

async function ensureSeeded(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(atsDiscoveryCategories);
  if (Number(count) > 0) return;
  await db.insert(atsDiscoveryCategories)
    .values(SEED_CATEGORIES.map((category) => ({ category })))
    .onConflictDoNothing();
}

function isPlausibleLeafCategory(title: string): boolean {
  if (!/^Category:/.test(title)) return false;
  const t = title.replace(/^Category:/, '').replace(/_/g, ' ');
  // Cross-product / meta categories ("Companies by industry and city") are
  // navigation aids, not real leaf listings of company pages - skip them.
  if (/ and /i.test(t)) return false;
  if (/defunct|disestablish|missing|redirect|stub|logo|histor|list of|lists of|wikipedia categor|by ownership|privately held|publicly traded|multinational|holding compan|conglomerate|government-owned|privatiz/i.test(t)) return false;
  if (!/compan(y|ies)/i.test(t)) return false;
  return true;
}

async function fetchSubcategories(seedCategory: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  // Bounded pagination (up to 2000 subcats per seed) - by_city/by_country can
  // legitimately have hundreds of entries, but this is a weekly job, not a
  // hot path, so a generous cap is fine.
  for (let page = 0; page < 4; page += 1) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'categorymembers');
    url.searchParams.set('cmtitle', seedCategory);
    url.searchParams.set('cmlimit', '500');
    url.searchParams.set('cmtype', 'subcat');
    url.searchParams.set('format', 'json');
    if (cmcontinue) url.searchParams.set('cmcontinue', cmcontinue);
    try {
      const res = await fetch(url.toString(), { headers: { 'User-Agent': WIKI_UA } });
      if (!res.ok) break;
      const data: any = await res.json();
      const members = data?.query?.categorymembers ?? [];
      for (const m of members) {
        const title = String(m?.title ?? '').trim();
        if (title) titles.push(title);
      }
      cmcontinue = data?.continue?.cmcontinue;
      if (!cmcontinue) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (error) {
      console.warn(`[CompanyDirectoryDiscovery] Failed to fetch subcategories of ${seedCategory}:`, (error as Error)?.message ?? error);
      break;
    }
  }
  return titles;
}

/**
 * Crawls the umbrella Wikipedia category tree one level deep and inserts any
 * genuinely new, plausible leaf category into ats_discovery_categories. Meant
 * to run on a slow cadence (weekly) - this is what makes the discovery pool
 * grow on its own instead of relying on a human noticing it stalled again.
 */
export async function discoverNewWikipediaCategories(): Promise<{ scanned: number; added: number }> {
  await ensureSeeded();
  const existing = await db.select({ category: atsDiscoveryCategories.category }).from(atsDiscoveryCategories);
  const existingSet = new Set(existing.map((r) => r.category));

  const found = new Set<string>();
  for (const seed of CATEGORY_TREE_SEEDS) {
    const subcats = await fetchSubcategories(seed);
    for (const title of subcats) {
      if (isPlausibleLeafCategory(title)) found.add(title.replace(/ /g, '_'));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const brandNew = [...found].filter((c) => !existingSet.has(c));
  if (brandNew.length > 0) {
    await db.insert(atsDiscoveryCategories)
      .values(brandNew.map((category) => ({ category })))
      .onConflictDoNothing();
  }

  return { scanned: found.size, added: brandNew.length };
}

async function fetchCategoryMembers(category: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json&cmtype=page`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA } });
    if (!res.ok) return [];
    const data = await res.json();
    const members = (data as any)?.query?.categorymembers ?? [];
    return members
      .map((m: any) => String(m.title ?? '').trim())
      .filter((title: string) => title && !/^list of/i.test(title) && !/disambiguation/i.test(title));
  } catch (error) {
    console.warn(`[CompanyDirectoryDiscovery] Failed to fetch ${category}:`, (error as Error)?.message ?? error);
    return [];
  }
}

/**
 * Fetches this run's rotating batch of Wikipedia categories (DB-backed, self-
 * expanding pool - see discoverNewWikipediaCategories), collects company
 * names, and probes them all against every ATS platform. growRegistryFromCompanies
 * only processes up to 25 fresh tokens per call, so this loops until the batch
 * is exhausted. Each category's known-ratio is checked afterward and, once it
 * crosses EXHAUSTION_KNOWN_RATIO, marked exhausted so future rotations stop
 * wasting a slot on it.
 */
export async function discoverCompaniesFromDirectories(): Promise<{ categoriesUsed: string[]; namesCollected: number; probed: number; added: number }> {
  await ensureSeeded();

  const active = await db.select({ category: atsDiscoveryCategories.category })
    .from(atsDiscoveryCategories)
    .where(eq(atsDiscoveryCategories.exhausted, false))
    .orderBy(atsDiscoveryCategories.id);
  // If every category has been mined dry (shouldn't happen with the tree
  // crawl running weekly, but don't let the whole mechanism go silent if it
  // does) fall back to rotating the exhausted pool anyway - Wikipedia
  // category membership does grow over time even for "known" categories.
  const pool = active.length > 0
    ? active.map((r) => r.category)
    : (await db.select({ category: atsDiscoveryCategories.category }).from(atsDiscoveryCategories).orderBy(atsDiscoveryCategories.id)).map((r) => r.category);

  if (pool.length === 0) return { categoriesUsed: [], namesCollected: 0, probed: 0, added: 0 };

  const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const batchCount = Math.ceil(pool.length / CATEGORIES_PER_RUN);
  const batchIndex = dayNumber % batchCount;
  const start = batchIndex * CATEGORIES_PER_RUN;
  const categoriesUsed = pool.slice(start, start + CATEGORIES_PER_RUN);

  const names = new Set<string>();
  const namesByCategory = new Map<string, string[]>();
  for (const category of categoriesUsed) {
    const members = await fetchCategoryMembers(category);
    namesByCategory.set(category, members);
    for (const name of members) names.add(name);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const nameList = [...names];
  let totalProbed = 0;
  let totalAdded = 0;
  const maxIterations = Math.ceil(nameList.length / 25) + 2;
  for (let i = 0; i < maxIterations; i += 1) {
    const { probed, added } = await growRegistryFromCompanies(nameList);
    totalProbed += probed;
    totalAdded += added;
    if (probed === 0) break;
  }

  // Update each category's known-ratio and retire it from rotation once it's
  // converged, so the next run doesn't keep spending a slot on it.
  for (const category of categoriesUsed) {
    const members = namesByCategory.get(category) ?? [];
    if (members.length === 0) continue;
    const { total, known } = await getKnownTokenRatio(members);
    const ratio = total > 0 ? known / total : 0;
    await db.update(atsDiscoveryCategories)
      .set({
        lastProbedAt: new Date(),
        lastKnownRatio: Math.round(ratio * 100),
        exhausted: ratio >= EXHAUSTION_KNOWN_RATIO,
      })
      .where(eq(atsDiscoveryCategories.category, category));
  }

  return { categoriesUsed, namesCollected: nameList.length, probed: totalProbed, added: totalAdded };
}
