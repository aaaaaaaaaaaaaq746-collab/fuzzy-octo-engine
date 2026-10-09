import { describe, expect, it } from 'vitest';
import { buildChunkSearchFilter, rankChunks, validateAnswerCitations } from './rag.js';
import { localHashEmbedding } from './vectors.js';

describe('vector retrieval', () => {
  it('scopes the vector lookup to the authenticated owner, chosen PDFs, and matching model profile', () => {
    expect(buildChunkSearchFilter('owner-1', ['doc-1', 'doc-2'], 'local-hash-v1')).toEqual({
      ownerId: 'owner-1',
      documentId: { $in: ['doc-1', 'doc-2'] },
      embeddingProfile: 'local-hash-v1',
    });
  });

  it('ranks relevant vectors above unrelated content', () => {
    const query = localHashEmbedding('photosynthesis converts light energy into chemical energy');
    const results = rankChunks(query, [
      {
        id: 'a', documentId: 'doc-a', filename: 'biology.pdf', pageNumber: 4,
        text: 'Photosynthesis converts light energy into chemical energy.',
        embedding: localHashEmbedding('Photosynthesis converts light energy into chemical energy.'),
      },
      {
        id: 'b', documentId: 'doc-b', filename: 'history.pdf', pageNumber: 8,
        text: 'The treaty was signed after the winter campaign.',
        embedding: localHashEmbedding('The treaty was signed after the winter campaign.'),
      },
    ], 2, 0.08);

    expect(results[0]?.id).toBe('a');
    expect(results[0]?.score).toBeGreaterThan(0.8);
    expect(rankChunks(query, results, 3, 1.01)).toEqual([]);
  });

  it('drops invalid citations and returns only source metadata that was retrieved', () => {
    const result = validateAnswerCitations('The answer is supported [1], not this [99].', [
      { sourceNumber: 1, documentId: 'doc-1', filename: 'notes.pdf', pageNumber: 3, quote: 'A real excerpt.' },
    ]);

    expect(result.answer).toBe('The answer is supported [1], not this.');
    expect(result.citations).toEqual([
      { documentId: 'doc-1', filename: 'notes.pdf', pageNumber: 3, quote: 'A real excerpt.' },
    ]);
  });

  it('adds a real citation when a provider omits citation markers', () => {
    const result = validateAnswerCitations('An answer grounded in a passage.', [
      { sourceNumber: 2, documentId: 'doc-2', filename: 'book.pdf', pageNumber: 12, quote: 'Some source text.' },
    ]);

    expect(result.answer).toBe('An answer grounded in a passage. [2]');
    expect(result.citations[0]?.pageNumber).toBe(12);
  });
});
