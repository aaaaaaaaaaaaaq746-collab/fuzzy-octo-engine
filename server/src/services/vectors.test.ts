import { describe, expect, it } from 'vitest';
import { cosineSimilarity, localHashEmbedding } from './vectors.js';

describe('local vectorizer', () => {
  it('is deterministic and gives the same text a cosine score of one', () => {
    const vector = localHashEmbedding('cellular respiration produces ATP');
    expect(localHashEmbedding('cellular respiration produces ATP')).toEqual(vector);
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1);
  });

  it('returns zero for incompatible or empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });
});
