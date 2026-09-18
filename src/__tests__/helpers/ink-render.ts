import { EventEmitter } from 'node:events'
import { render as inkRender, type Instance } from 'ink'
import type { ReactNode } from 'react'

class FakeStdout extends EventEmitter {
  isTTY = true
  rows: number
  columns: number
  frames: string[] = []
  private _lastFrame = ''

  constructor(rows = 24, columns = 100) {
    super()
    this.rows = rows
    this.columns = columns
  }

  write = (frame?: unknown) => {
    const text = frame == null ? '' : String(frame)
    this.frames.push(text)
    // Effect code writes (e.g. ansi mouse modes) and the unmount newline are not
    // rendered frames. Only track writes that look like Ink's layout output.
    if (text.includes('\n') && text.trim().length > 0) this._lastFrame = text
    return true
  }

  lastFrame = () => this._lastFrame
  cursorTo = () => true
  moveCursor = () => true
  clearScreenDown = () => true
  getWindowSize = () => ({ rows: this.rows, columns: this.columns })
}

class FakeStderr extends EventEmitter {
  isTTY = true
  frames: string[] = []
  private _lastFrame = ''

  write = (frame?: unknown) => {
    const text = frame == null ? '' : String(frame)
    this.frames.push(text)
    this._lastFrame = text
    return true
  }

  lastFrame = () => this._lastFrame
  cursorTo = () => true
  moveCursor = () => true
  clearScreenDown = () => true
}

class FakeStdin extends EventEmitter {
  isTTY = true
  private data: string | null = null

  write = (data: string) => {
    this.data = data
    this.emit('readable')
    this.emit('data', data)
  }

  read = () => {
    const { data } = this
    this.data = null
    return data
  }

  setEncoding = () => {}
  setRawMode = () => {}
  resume = () => {}
  pause = () => {}
  ref = () => {}
  unref = () => {}
  unshift = () => {}
}

export type InkRenderResult = {
  instance: Instance
  stdout: FakeStdout
  stderr: FakeStderr
  stdin: FakeStdin
  lastFrame: () => string
  frames: () => string[]
  unmount: Instance['unmount']
  waitUntilExit: Instance['waitUntilExit']
  waitUntilRenderFlush: Instance['waitUntilRenderFlush']
}

export function render(
  tree: ReactNode,
  options: { rows?: number; columns?: number } = {}
): InkRenderResult {
  const stdout = new FakeStdout(options.rows ?? 24, options.columns ?? 100)
  const stderr = new FakeStderr()
  const stdin = new FakeStdin()
  const instance = inkRender(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
    interactive: false
  })
  return {
    instance,
    stdout,
    stderr,
    stdin,
    lastFrame: stdout.lastFrame,
    frames: () => stdout.frames,
    unmount: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
    waitUntilRenderFlush: instance.waitUntilRenderFlush
  }
}

export async function waitForFrame(
  getFrame: () => string,
  predicate: (frame: string) => boolean,
  timeout = 5000
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const frame = getFrame()
    if (predicate(frame)) return frame
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for frame matching predicate. Last frame:\n${getFrame()}`)
}
