import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
import JSZip from 'jszip';

const CV_PARAGRAPHS = [
  'Daniel Pérez',
  'Mexico City, Mexico | daniel@example.com | linkedin.com/in/danielperez',
  'WORK EXPERIENCE',
  'Finance Director - FintechCo (2018 - Present)',
  'Led treasury, FP&A and a Series B fundraising round for a LATAM fintech scale-up. Managed a team of 12 across Mexico and Colombia.',
  'Head of Growth - SaaSStartup (2015 - 2018)',
  'Drove B2B growth through partnerships and international deals across the Americas.',
  'EDUCATION',
  'MSc Finance - IE Business School (2014)',
  'SKILLS',
  'Treasury, FP&A, Financial Modeling, SQL, Fundraising, Partnerships',
];

async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.folder('word')!.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function main() {
  const { extractResumeText } = await import('../src/core/profile/extractResumeText');
  const { extractProfileFromCv } = await import('../src/core/profile/extractProfileFromCv');

  const docx = await makeDocx(CV_PARAGRAPHS);
  const text = await extractResumeText(docx, 'cv.docx');
  console.log('--- Extracted text from .docx ---');
  console.log(text);
  console.log(`(${text.length} chars)\n`);

  console.log('--- extractProfileFromCv result ---');
  const profile = await extractProfileFromCv(text);
  console.log('name:', profile.name);
  console.log('experience entries:', profile.experience?.length ?? 0);
  console.log('first role:', profile.experience?.[0]?.role, '@', profile.experience?.[0]?.company);
  console.log('skills:', (profile.skills ?? []).map((s: any) => s.skill ?? s).join(', '));
  console.log('education:', profile.education?.length ?? 0);
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
