import { describe, it, expect } from '@jest/globals'
import { should_skip, split_data, is_done } from '../ink/agent.js'
import type { Data } from '../ink/models.js'

describe('should_skip', () => {
  it('should return true for objects with x-opencode-type property', () => {
    const obj = { 'x-opencode-type': 'some-type' } as unknown as Data
    expect(should_skip(obj)).toBe(true)
  })

  it('should return false for objects without x-opencode-type', () => {
    const obj = { role: 'user', content: 'hello' } as unknown as Data
    expect(should_skip(obj)).toBe(false)
  })
})

describe('is_done', () => {
  it('should return true for [DONE] chunk', () => {
    expect(is_done('data: [DONE]\n\n')).toBe(true)
  })

  it('should return false for non-data chunk', () => {
    expect(is_done('some random text')).toBe(false)
  })

  it('should return false for data chunk without [DONE]', () => {
    expect(is_done('data: {"choices":[]}')).toBe(false)
  })
})

describe('split_data', () => {
  it('should return empty array for undefined raw', () => {
    expect(split_data(undefined)).toEqual([])
  })

  it('should return empty array for null raw', () => {
    expect(split_data(undefined)).toEqual([])
  })

  it('should parse SSE data chunks and skip skipped objects', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"x-opencode-type":"skip","choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"World"}}]}\n\n',
      'data: [DONE]\n\n'
    ].join('')
    const result = split_data(raw)
    expect(result.length).toBe(2)
    expect(result[0].choices?.[0]?.delta?.content).toBe('Hello')
    expect(result[1].choices?.[0]?.delta?.content).toBe('World')
  })

  it('should stop at [DONE]', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"First"}}]}\n\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"Second"}}]}\n\n'
    ].join('')
    const result = split_data(raw)
    expect(result.length).toBe(1)
    expect(result[0].choices?.[0]?.delta?.content).toBe('First')
  })
})
