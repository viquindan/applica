import { growRegistryFromCompanies } from './atsRegistry';

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
 * Categories intentionally span far beyond tech/fintech (health, retail,
 * manufacturing, education, hospitality, financial services, many world
 * cities) so the registry doesn't skew toward any one industry.
 */

export const COMPANY_DIRECTORY_CATEGORIES: string[] = [
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
];

// Rotate through a slice each run instead of hitting every category every time
// (Wikipedia is a shared public resource - be a reasonable citizen). A full
// rotation at this size takes ~2 weeks at the job's daily cadence.
const CATEGORIES_PER_RUN = 6;

function currentBatchIndex(): number {
  const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const batchCount = Math.ceil(COMPANY_DIRECTORY_CATEGORIES.length / CATEGORIES_PER_RUN);
  return dayNumber % batchCount;
}

async function fetchCategoryMembers(category: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json&cmtype=page`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'ApplicaBot/1.0 (job search engine; company discovery)' } });
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
 * Fetches this run's rotating batch of Wikipedia categories, collects company
 * names, and probes them all against every ATS platform. growRegistryFromCompanies
 * only processes up to 25 fresh tokens per call, so this loops until the batch
 * is exhausted.
 */
export async function discoverCompaniesFromDirectories(): Promise<{ categoriesUsed: string[]; namesCollected: number; probed: number; added: number }> {
  const batchIndex = currentBatchIndex();
  const start = batchIndex * CATEGORIES_PER_RUN;
  const categoriesUsed = COMPANY_DIRECTORY_CATEGORIES.slice(start, start + CATEGORIES_PER_RUN);
  if (categoriesUsed.length === 0) return { categoriesUsed: [], namesCollected: 0, probed: 0, added: 0 };

  const names = new Set<string>();
  for (const category of categoriesUsed) {
    const members = await fetchCategoryMembers(category);
    for (const name of members) names.add(name);
    // Be polite to Wikipedia's shared API between requests.
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

  return { categoriesUsed, namesCollected: nameList.length, probed: totalProbed, added: totalAdded };
}
