import { cosineSimilarity } from './vectors.js';

export interface CandidateChunk {
  id: string;
  documentId: string;
  filename: string;
  pageNumber: number;
  text: string;
  embedding: number[];
}

export interface RankedChunk extends CandidateChunk {
  score: number;
}

export interface Citation {
  documentId: string;
  filename: string;
  pageNumber: number;
  quote: string;
}

/** Keep every vector lookup scoped to one owner, selected documents, and one embedding profile. */
export function buildChunkSearchFilter(ownerId: string, documentIds: string[], embeddingProfile: string) {
  return { ownerId, documentId: { $in: documentIds }, embeddingProfile };
}

export function rankChunks(
  queryVector: number[],
  chunks: CandidateChunk[],
  topK: number,
  minScore: number,
): RankedChunk[] {
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .filter((chunk) => chunk.score >= minScore)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, topK);
}

/** Remove any model citation that does not refer to evidence retrieved for this turn. */
export function validateAnswerCitations(
  answer: string,
  sources: Array<Citation & { sourceNumber: number }>,
): { answer: string; citations: Citation[] } {
  const validNumbers = new Set(sources.map((source) => source.sourceNumber));
  const citedNumbers = new Set<number>();
  let cleanAnswer = answer.replace(/\[(\d+)\]/g, (marker, rawNumber: string) => {
    const number = Number(rawNumber);
    if (!validNumbers.has(number)) return '';
    citedNumbers.add(number);
    return marker;
  });
  cleanAnswer = cleanAnswer.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim().slice(0, 7_900);

  // If the provider forgot a citation, attach the strongest real source rather
  // than returning a plausible-sounding answer with no evidence trail.
  if (citedNumbers.size === 0 && sources[0]) {
    citedNumbers.add(sources[0].sourceNumber);
    cleanAnswer = `${cleanAnswer}${cleanAnswer ? ' ' : ''}[${sources[0].sourceNumber}]`;
  }

  const citations = sources
    .filter((source) => citedNumbers.has(source.sourceNumber))
    .map(({ documentId, filename, pageNumber, quote }) => ({ documentId, filename, pageNumber, quote }));
  return { answer: cleanAnswer, citations };
}
