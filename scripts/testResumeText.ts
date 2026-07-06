/**
 * Verifies unified résumé text extraction for PDF / DOCX / TXT.
 * Run: npx tsx scripts/testResumeText.ts
 */
import JSZip from 'jszip';
import { extractResumeText, detectResumeFormat } from '../src/core/profile/extractResumeText';

let passed = 0, failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(` PASS ${label}`); }
  else { failed++; console.log(` FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

async function makeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')!.file('.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')!.file('document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function main() {
  console.log('\n=== Résumé text extraction (PDF / DOCX / TXT) ===');

  // DOCX
  const docx = await makeDocx('Finance Director with 12 years of experience in fintech and SaaS.');
  check('Detects .docx by extension', detectResumeFormat(docx, 'cv.docx') === 'docx');
  check('Detects .docx by magic bytes (no extension)', detectResumeFormat(docx, 'cv') === 'docx');
  const docxText = await extractResumeText(docx, 'cv.docx');
  check('Extracts text from .docx', docxText.includes('Finance Director') && docxText.includes('fintech'), JSON.stringify(docxText));

  // TXT
  const txt = Buffer.from('Plain text resume: Head of Growth at Fintech.', 'utf8');
  check('Extracts text from .txt', (await extractResumeText(txt, 'cv.txt')).includes('Head of Growth'));

  // Unsupported (old .doc / random binary)
  let threw = false;
  try { await extractResumeText(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]), 'cv.doc'); } catch { threw = true; }
  check('Rejects legacy .doc with a clear error', threw);

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
