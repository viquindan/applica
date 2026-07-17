// SmartRecruiters company identifiers (case-insensitive). Verified live to
// return postings; the registry + discovery expand this set over time.
export const seedSmartRecruitersBoards = [
  { token: 'visa', companyName: 'Visa', source: 'seed' },
  { token: 'boschgroup', companyName: 'Bosch Group', source: 'seed' },
  { token: 'lvmh', companyName: 'LVMH', source: 'seed' },
  { token: 'wabtec', companyName: 'Wabtec', source: 'seed' },
  { token: 'experian', companyName: 'Experian', source: 'seed' },
  // Verified additions - non-tech industries (fitness/retail, facilities/food
  // services, real estate/consulting, BPO/operations), so the engine isn't
  // biased toward tech/fintech.
  { token: 'Equinox', companyName: 'Equinox', source: 'seed' },
  { token: 'Sodexo', companyName: 'Sodexo', source: 'seed' },
  { token: 'Colliers', companyName: 'Colliers', source: 'seed' },
  { token: 'Alorica', companyName: 'Alorica', source: 'seed' },
  { token: 'TTEC', companyName: 'TTEC', source: 'seed' },
];
