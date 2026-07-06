export type SalaryRange = {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'year' | 'month';
};

export function extractSalaryRange(text?: string | null): SalaryRange {
  const value = (text ?? '').replace(/,/g, ' ');

  // Currency detection - support USD, EUR, GBP
  const currency = /\bEUR\b|€/i.test(value)
    ? 'EUR'
    : /\bGBP\b|£/i.test(value)
      ? 'GBP'
      : /\bUSD\b|\$/i.test(value)
        ? 'USD'
        : undefined;

  const annual = /per year|annually|annual salary|\byear\b|\bp\.a\.\b|\bpa\b/i.test(value);
  const monthly = /per month|monthly|\bmonth\b/i.test(value);

  // Match amounts with optional currency symbols, supporting:
  // - "$120,000" / "120.000€" / "£80,000"
  // - "120k" / "80K"
  // - "80,000 - 120,000" / "80k-120k"
  const matches = [...value.matchAll(/(?:[\$€£]|USD\s*|EUR\s*|GBP\s*)?\s*(\d{2,3}(?:[\s.,]?\d{3})+|\d{2,3})\s*(?:k)?\b/gi)]
    .map((match) => normalizeAmount(match[1], /k/i.test(match[0])));

  // Keep only realistic salary figures. Long digit runs in a description (IDs,
  // phone numbers, concatenated numbers) can otherwise produce absurd values
  // that overflow the integer column.
  const plausible = matches.filter((amount) => Number.isFinite(amount) && amount >= 1000 && amount <= 10_000_000);
  if (plausible.length === 0) return {};

  const [first, second] = plausible;
  return {
    min: first,
    max: second ?? first,
    currency,
    period: monthly ? 'month' : annual ? 'year' : undefined,
  };
}

export function toMonthlyAmount(amount?: number, period?: 'year' | 'month') {
  if (!amount) return undefined;
  return period === 'year' ? Math.round(amount / 12) : amount;
}

function normalizeAmount(raw: string, isK: boolean) {
  const compact = raw.replace(/[\s.,]/g, '');
  const numeric = Number(compact);
  return isK ? numeric * 1000 : numeric;
}
