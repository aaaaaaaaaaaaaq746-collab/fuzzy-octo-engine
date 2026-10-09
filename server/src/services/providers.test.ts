import { describe, expect, it } from 'vitest';
import { ExtractiveChatProvider, LocalHashEmbeddingProvider } from './providers.js';

describe('local development providers', () => {
  it('creates local vectors with stable document/query dimensions', async () => {
    const provider = new LocalHashEmbeddingProvider();
    const vectors = await provider.embed(['mitochondria produce ATP', 'cellular respiration']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(384);
    expect(provider.profile).toBe('local-hash-v1');
  });

  it('returns evidence excerpts with valid source markers instead of claiming generated AI', async () => {
    const provider = new ExtractiveChatProvider();
    const answer = await provider.answer({
      question: 'What produces ATP during cellular respiration?',
      history: [],
      evidence: [{
        sourceNumber: 1,
        filename: 'biology.pdf',
        pageNumber: 4,
        text: 'Mitochondria produce ATP during cellular respiration.',
      }],
    });
    expect(provider.mode).toBe('extractive');
    expect(answer).toContain('Mitochondria produce ATP');
    expect(answer).toContain('[1]');
  });
});
