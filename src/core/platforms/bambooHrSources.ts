// BambooHR company subdomains ({token}.bamboohr.com/careers/list). Verified
// live 2026-07-24 (flyio had 10 real open jobs, posthog had 1 at verification
// time). Small honest seed - the real growth comes from
// discover_companies_directory (Wikipedia name probing, see
// companyDirectoryDiscovery.ts), now extended to probe this platform too.
export const seedBambooHrBoards = [
  { token: 'flyio', companyName: 'Fly.io', source: 'seed' },
  { token: 'posthog', companyName: 'PostHog', source: 'seed' },
];
