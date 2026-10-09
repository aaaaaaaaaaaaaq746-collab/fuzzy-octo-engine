import { describe, expect, it } from 'vitest';
import { extractPdfPages } from './pdf.js';

function makeOnePagePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

describe('PDF text extraction', () => {
  it('extracts selectable text and retains its page number', async () => {
    const pages = await extractPdfPages(makeOnePagePdf('Pagewise keeps page citations'), 10);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[0]?.text).toContain('Pagewise keeps page citations');
  });

  it('enforces the configured page limit', async () => {
    await expect(extractPdfPages(makeOnePagePdf('One page'), 0)).rejects.toThrow(/current limit is 0/);
  });

  it('reports when a PDF has no selectable text', async () => {
    await expect(extractPdfPages(makeOnePagePdf(''), 10)).rejects.toThrow(/scanned PDF/);
  });
});
