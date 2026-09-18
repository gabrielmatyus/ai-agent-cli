import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { autoDecision, describeAction, isDestructiveTool } from '../ink/confirmation.js'

describe('confirmation', () => {
  beforeEach(() => {
    delete process.env.AI_AGENT_CONFIRM
  })

  afterEach(() => {
    delete process.env.AI_AGENT_CONFIRM
  })

  it('recognizes the destructive tool set', () => {
    for (const name of ['write_file', 'delete_file', 'rename_file', 'execute_bash']) {
      expect(isDestructiveTool(name)).toBe(true)
    }
    for (const name of [
      'read_file',
      'read_multiple_files',
      'edit_file',
      'list_directory',
      'glob_files',
      'grep_search',
      'create_directory',
      'unknown_tool'
    ]) {
      expect(isDestructiveTool(name)).toBe(false)
    }
  })

  it('describes the target of the action', () => {
    expect(describeAction('execute_bash', { command: 'rm -rf /tmp/x' })).toContain('rm -rf /tmp/x')
    expect(describeAction('write_file', { path: 'src/a.txt' })).toBe('write_file: src/a.txt')
    expect(describeAction('rename_file', { oldPath: 'a' })).toBe('rename_file: a')
    expect(describeAction('delete_file', {})).toBe('delete_file')
  })

  it('auto-allows when AI_AGENT_CONFIRM=always', () => {
    for (const mode of ['always', 'allow', 'all', 'yes', 'y']) {
      process.env.AI_AGENT_CONFIRM = mode
      expect(autoDecision()).toBe(true)
    }
  })

  it('auto-denies when AI_AGENT_CONFIRM=never', () => {
    for (const mode of ['never', 'deny', 'no', 'n']) {
      process.env.AI_AGENT_CONFIRM = mode
      expect(autoDecision()).toBe(false)
    }
  })

  it('returns undefined (interactive decision required) when AI_AGENT_CONFIRM is unset', () => {
    expect(autoDecision()).toBeUndefined()
  })
})
