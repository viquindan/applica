// Vacancy descriptions come from ATS postings as raw HTML (some adapters
// don't strip it before storing) - rendered verbatim it shows literal
// `<p>`/`<div>`/`<strong>` tags and escaped entities instead of plain text.
// Same fix pattern as src/core/platforms/atsSearchHelpers.ts's stripHtml,
// ported here since mobile can't import server-side code. Shared by every
// screen that renders a vacancy description.
export function stripHtml(input: string): string {
  const decodeEntities = (value: string) => value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
  const decoded = decodeEntities(decodeEntities(input));

  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
