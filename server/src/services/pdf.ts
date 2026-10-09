import type { PageText } from './chunking.js';

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/** Extract text page-by-page; page numbers are preserved for later citations. */
export async function extractPdfPages(buffer: Buffer, maxPages: number): Promise<PageText[]> {
  let destroyLoadingTask: (() => Promise<void>) | undefined;

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      stopAtErrors: true,
    });
    destroyLoadingTask = () => loadingTask.destroy();
    const document = await loadingTask.promise;
    if (document.numPages > maxPages) {
      throw new PdfExtractionError(`This PDF has ${document.numPages} pages; the current limit is ${maxPages}.`);
    }

    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (content.items as PdfTextItem[])
        .filter((item) => typeof item.str === 'string')
        .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join('')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
        .trim();
      pages.push({ pageNumber, text });
    }

    if (!pages.some((page) => page.text.length > 0)) {
      throw new PdfExtractionError('No selectable text was found. This may be a scanned PDF; OCR is not configured.');
    }
    return pages;
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    throw new PdfExtractionError('The PDF could not be read. Check that it is a valid, unencrypted PDF and try again.');
  } finally {
    await destroyLoadingTask?.().catch(() => undefined);
  }
}
