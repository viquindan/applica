const FAMILY_NEGATIVE_PATTERNS: Record<string, RegExp[]> = {
  finance_leadership: [
    /finance systems/i,
    /finance operations/i,
    /accounts payable/i,
    /accounts receivable/i,
    /billing/i,
    /payroll/i,
    /investment banking/i,
    /financial analyst/i,
    /finance associate/i,
    /bookkeeper/i,
  ],
  fp_and_a_leadership: [
    /financial analyst/i,
    /fp&a analyst/i,
    /junior fp&a/i,
    /fp&a associate/i,
  ],
  sales_leadership: [
    /sales development/i,
    /account executive/i,
    /customer success/i,
    /sales representative/i,
    /sdr\b/i,
    /bdr\b/i,
  ],
  operations_leadership: [
    /sales operations/i,
    /people operations/i,
    /marketing operations/i,
    /revenue operations/i,
    /operations analyst/i,
    /operations associate/i,
  ],
  country_leadership: [
    /office manager/i,
    /administrative manager/i,
    /facilities manager/i,
  ],
  growth_leadership: [
    /growth marketing intern/i,
    /growth analyst/i,
    /growth associate/i,
    /paid ads/i,
    /performance marketing/i,
  ],
  product_leadership: [
    /product designer/i,
    /product analyst/i,
    /product marketing/i,
    /product support/i,
    /product operations/i,
    /associate product manager/i,
  ],
};

export function getSemanticRoleWarnings(title: string, family?: string) {
  if (!family) return [];
  const patterns = FAMILY_NEGATIVE_PATTERNS[family] ?? [];
  return patterns
    .filter((pattern) => pattern.test(title))
    .map(() => 'El título parece cercano, pero describe otra función distinta a tu rol objetivo.');
}

export function isLikelyFalsePositiveRole(title: string, family?: string) {
  if (!family) return false;
  return (FAMILY_NEGATIVE_PATTERNS[family] ?? []).some((pattern) => pattern.test(title));
}
