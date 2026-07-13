import { describe, it, expect } from '@jest/globals';
import { chunks } from '../ink/chunks.js';

describe('chunks', () => {
  it('should be an array', () => {
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('should have the correct number of chunks', () => {
    expect(chunks).toHaveLength(4);
  });
});
