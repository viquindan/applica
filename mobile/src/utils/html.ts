// Vacancy descriptions come from ATS postings as raw HTML (some adapters
// don't strip it before storing) - rendered verbatim it shows literal
// `<p>`/`<div>`/`<strong>` tags and escaped entities instead of plain text.
// Same fix pattern as src/core/platforms/atsSearchHelpers.ts's stripHtml,
// ported here since mobile can't import server-side code. Shared by every
// screen that renders a vacancy description.
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
