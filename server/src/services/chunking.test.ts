import { describe, expect, it } from 'vitest';
import { chunkPages } from './chunking.js';

const longText = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau';

describe('chunkPages', () => {
  it('keeps page metadata and does not combine page boundaries', () => {
    const result = chunkPages([
      { pageNumber: 1, text: 'First page text.' },
      { pageNumber: 2, text: 'Second page text.' },
    ]);

    expect(result).toEqual([
      { chunkIndex: 0, pageNumber: 1, text: 'First page text.' },
      { chunkIndex: 1, pageNumber: 2, text: 'Second page text.' },
    ]);
  });

  it('splits long pages into bounded overlapping chunks', () => {
    const result = chunkPages([{ pageNumber: 7, text: longText }], 32, 8);

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((chunk) => chunk.pageNumber === 7)).toBe(true);
    expect(result.every((chunk) => chunk.text.length <= 32)).toBe(true);
    expect(result[0]?.chunkIndex).toBe(0);
    expect(result[1]?.chunkIndex).toBe(1);
    expect(result[0]?.text.split(' ').slice(-1)[0]).toBe(result[1]?.text.split(' ')[0]);
  });

  it('ignores blank pages and rejects invalid sizes', () => {
    expect(chunkPages([{ pageNumber: 1, text: '   ' }])).toEqual([]);
    expect(() => chunkPages([], 0)).toThrow(RangeError);
  });
});
