import { getRoleFamily, normalizeRole } from '../scoring/roleTaxonomy';

export function roleLearningKey(title: string | null | undefined) {
  if (!title) return 'unknown';
  return getRoleFamily(title) ?? normalizeRole(title);
}

export function roleLearningLabel(key: string) {
  const labels: Record<string, string> = {
    finance_leadership: 'liderazgo financiero',
    fp_and_a_leadership: 'liderazgo de FP&A',
    operations_leadership: 'liderazgo operativo',
    country_leadership: 'country management',
    sales_leadership: 'liderazgo comercial',
    growth_leadership: 'liderazgo de growth',
    product_leadership: 'liderazgo de producto',
  };
  return labels[key] ?? key;
}
