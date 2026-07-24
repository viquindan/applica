// Workable account slugs (apply.workable.com/{token}/j/...). Verified live
// 2026-07-24 (pavago had 3 real open jobs at verification time; walter had 0
// but is a confirmed valid, active account). Small honest seed - the real
// growth comes from discover_companies_directory (Wikipedia name probing,
// see companyDirectoryDiscovery.ts), now extended to probe this platform too.
export const seedWorkableBoards = [
  { token: 'pavago', companyName: 'Pavago', source: 'seed' },
  { token: 'walter', companyName: 'Walter', source: 'seed' },
];
