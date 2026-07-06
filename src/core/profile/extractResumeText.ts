/**
 * Unified résumé text extraction. Accepts PDF, Word (.docx) and plain text,
 * detecting the format by extension and falling back to magic-byte sniffing so
 * a mislabeled file still works. Returns the plain text for downstream parsing.
 */
export type ResumeFormat = 'pdf' | 'docx' | 'text' | 'unknown';

export function detectResumeFormat(buffer: Buffer, filename?: string): ResumeFormat {
  const ext = (filename?.split('.').pop() ?? '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md' || ext === 'text') return 'text';

  // Magic bytes: %PDF for PDF, PK\x03\x04 (zip) for .docx.
  const head = buffer.subarray(0, 4).toString('latin1');
  if (head.startsWith('%PDF')) return 'pdf';
  if (head.startsWith('PK')) return 'docx';

  // Old binary .doc starts with D0 CF 11 E0 (OLE compound file) - not supported.
  if (ext === 'doc' || (buffer[0] === 0xd0 && buffer[1] === 0xcf)) return 'unknown';

  return 'unknown';
}

export async function extractResumeText(buffer: Buffer, filename?: string): Promise<string> {
  const format = detectResumeFormat(buffer, filename);

  switch (format) {
    case 'pdf': {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      return (await parser.getText()).text;
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case 'text':
      return buffer.toString('utf8');
    default:
      throw new Error(
        'Formato no soportado. Sube tu CV en PDF o Word (.docx). El formato antiguo .doc no es compatible - guárdalo como .docx o PDF.',
      );
  }
}
