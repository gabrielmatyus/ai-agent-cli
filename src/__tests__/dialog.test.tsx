import { describe, it, expect } from '@jest/globals'
import stripAnsi from 'strip-ansi'
import { ConfirmDialog } from '../ink/Dialog.js'
import { render, waitForFrame } from './helpers/ink-render.js'

describe('ConfirmDialog', () => {
  it('renders the title', async () => {
    const { lastFrame, unmount } = render(
      <ConfirmDialog title="Allow write_file?" description="write_file: src/a.txt" choice={false} />
    )
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Allow write_file?'))
    expect(stripAnsi(frame)).toContain('Allow write_file?')
    unmount()
  })

  it('renders the action description', async () => {
    const { lastFrame, unmount } = render(
      <ConfirmDialog title="Allow?" description="execute_bash: rm -rf /tmp/x" choice={false} />
    )
    const frame = await waitForFrame(lastFrame, (f) => f.includes('rm -rf /tmp/x'))
    expect(stripAnsi(frame)).toContain('execute_bash: rm -rf /tmp/x')
    unmount()
  })

  it('shows Allow and Deny buttons', async () => {
    const { lastFrame, unmount } = render(
      <ConfirmDialog title="Allow?" description="write_file: a" choice={false} />
    )
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Allow'))
    const plain = stripAnsi(frame)
    expect(plain).toContain('Allow')
    expect(plain).toContain('Deny')
    unmount()
  })

  it('highlights the focused choice', async () => {
    const allowRender = render(
      <ConfirmDialog title="Allow?" description="write_file: a" choice={true} />
    )
    const allowFocused = await waitForFrame(allowRender.lastFrame, (f) => f.includes('[Allow]'))
    const denyRender = render(
      <ConfirmDialog title="Allow?" description="write_file: a" choice={false} />
    )
    const denyFocused = await waitForFrame(denyRender.lastFrame, (f) => f.includes('[Deny]'))
    expect(stripAnsi(allowFocused)).toContain('[Allow]')
    expect(stripAnsi(allowFocused)).toContain(' Deny ')
    expect(stripAnsi(denyFocused)).toContain('[Deny]')
    expect(stripAnsi(denyFocused)).toContain(' Allow ')
    allowRender.unmount()
    denyRender.unmount()
  })

  it('renders a bordered frame', async () => {
    const { lastFrame, unmount } = render(
      <ConfirmDialog title="T" description="body" choice={false} />
    )
    const frame = await waitForFrame(lastFrame, (f) => f.length > 0)
    expect(stripAnsi(frame)).toMatch(/[╭╮╰╯┌┐└┘]/)
    unmount()
  })
})
