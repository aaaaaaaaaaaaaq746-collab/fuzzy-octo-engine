export interface PageText {
  pageNumber: number;
  text: string;
}

export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  text: string;
}

/** Split each page independently so every stored citation points to a real page. */
export function chunkPages(
  pages: PageText[],
  maxCharacters = 1_000,
  overlapCharacters = 160,
): TextChunk[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
    throw new RangeError('maxCharacters must be a positive integer');
  }
  if (!Number.isInteger(overlapCharacters) || overlapCharacters < 0) {
    throw new RangeError('overlapCharacters must be a non-negative integer');
  }

  const chunks: TextChunk[] = [];
  const overlap = Math.min(overlapCharacters, Math.floor(maxCharacters / 2));

  for (const page of pages) {
    const normalized = page.text.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    let start = 0;
    while (start < normalized.length) {
      const hardEnd = Math.min(start + maxCharacters, normalized.length);
      let end = hardEnd;

      if (hardEnd < normalized.length) {
        const softBoundary = start + Math.floor(maxCharacters * 0.65);
        const whitespace = normalized.lastIndexOf(' ', hardEnd);
        const sentence = Math.max(
          normalized.lastIndexOf('. ', hardEnd),
          normalized.lastIndexOf('? ', hardEnd),
          normalized.lastIndexOf('! ', hardEnd),
        );
        const preferred = sentence >= softBoundary ? sentence + 1 : whitespace;
        if (preferred >= softBoundary) end = preferred;
      }

      const text = normalized.slice(start, end).trim();
      if (text) {
        chunks.push({
          chunkIndex: chunks.length,
          pageNumber: page.pageNumber,
          text,
        });
      }
      if (end >= normalized.length) break;

      let nextStart = Math.max(start + 1, end - overlap);
      const nextWordBoundary = normalized.indexOf(' ', nextStart);
      if (nextWordBoundary !== -1 && nextWordBoundary < nextStart + 40) {
        nextStart = nextWordBoundary + 1;
      }
      start = nextStart;
    }
  }

  return chunks;
}
