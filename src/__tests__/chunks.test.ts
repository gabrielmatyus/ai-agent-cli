import { describe, it, expect } from '@jest/globals'
import { chunks } from '../ink/mocks/chunks.js'

describe('chunks', () => {
  it('should be an array', () => {
    expect(Array.isArray(chunks)).toBe(true)
  })
})
