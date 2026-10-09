import { createHash } from 'node:crypto';

export const LOCAL_VECTOR_DIMENSIONS = 384;
export const LOCAL_VECTOR_PROFILE = 'local-hash-v1';

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
  'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'was', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'with', 'you', 'your',
]);

/**
 * Offline development vectorizer: feature-hashes terms and adjacent word pairs.
 * It is lexical rather than a neural/semantic embedding; cosine retrieval is a
 * real vector operation, but remote embedding providers generally rank meaning
 * better. The profile is versioned so stored vectors cannot be mixed by mistake.
 */
export function localHashEmbedding(text: string, dimensions = LOCAL_VECTOR_DIMENSIONS): number[] {
  if (!Number.isInteger(dimensions) || dimensions < 8) {
    throw new RangeError('dimensions must be an integer of at least 8');
  }

  const words = (text.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [])
    .filter((word) => !stopWords.has(word));
  const vector = new Array<number>(dimensions).fill(0);
  const features: Array<[string, number]> = words.map((word) => [`u:${word}`, 1]);

  for (let index = 0; index < words.length - 1; index += 1) {
    features.push([`b:${words[index]}_${words[index + 1]}`, 0.55]);
  }

  for (const [feature, weight] of features) {
    const digest = createHash('sha256').update(feature).digest();
    const bucket = digest.readUInt32BE(0) % dimensions;
    const sign = (digest[4]! & 1) === 0 ? 1 : -1;
    vector[bucket] = vector[bucket]! + sign * weight;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
