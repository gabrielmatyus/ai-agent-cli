import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import stripAnsi from 'strip-ansi'
import App from '../ink/App.js'
import { render, waitForFrame } from './helpers/ink-render.js'

const originalFetch = global.fetch

const sseChunks = [
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":10,"prompt_tokens":5,"completion_tokens":5,"prompt_cache_hit_tokens":3,"prompt_cache_miss_tokens":2,"completion_tokens_details":{"reasoning_tokens":1}}}\n\n',
  'data: [DONE]\n\n'
]

function sseResponse() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of sseChunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return Promise.resolve({
    ok: true,
    status: 200,
    body: stream,
    text: async () => '',
    json: async () => ({})
  })
}

const TEST_TIMEOUT = 30000

function timedSseStream(totalChunks: number, delayMs: number) {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  for (let i = 1; i <= totalChunks; i++) {
    chunks.push(`data: {"choices":[{"delta":{"content":"tok${i} "}}]}\n\n`)
  }
  chunks.push(
    `data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":${totalChunks},"prompt_tokens":1,"completion_tokens":${totalChunks},"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens_details":{"reasoning_tokens":0}}}\n\n`
  )
  chunks.push('data: [DONE]\n\n')
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk, index) => {
        setTimeout(() => controller.enqueue(encoder.encode(chunk)), (index + 1) * delayMs)
      })
      setTimeout(() => controller.close(), (chunks.length + 1) * delayMs)
    }
  })
  return Promise.resolve({
    ok: true,
    status: 200,
    body: stream,
    text: async () => '',
    json: async () => ({})
  })
}

function toolChunks(id: string, name: string, args: string): string[] {
  return [
    `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"${id}","type":"function","function":{"name":"${name}","arguments":"${args}"}}]}}]}`,
    `{"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":5,"prompt_tokens":2,"completion_tokens":3,"prompt_cache_hit_tokens":1,"prompt_cache_miss_tokens":1,"completion_tokens_details":{"reasoning_tokens":0}}}`
  ]
}

function textChunks(text: string): string[] {
  return [
    `{"choices":[{"delta":{"content":"${text}"}}]}`,
    `{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2,"prompt_tokens":1,"completion_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens_details":{"reasoning_tokens":0}}}`
  ]
}

function callSequenceResponse(sequences: string[][]) {
  const encoder = new TextEncoder()
  let callCount = 0
  return () => {
    const seq = sequences[Math.min(callCount, sequences.length - 1)]
    callCount++
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of seq) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    })
    return Promise.resolve({
      ok: true,
      status: 200,
      body: stream,
      text: async () => '',
      json: async () => ({})
    })
  }
}

function toolCallSseResponse(completionText = 'Done') {
  const encoder = new TextEncoder()
  let callCount = 0
  return () => {
    callCount++
    let stream: ReadableStream
    if (callCount === 1) {
      stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"execute_bash","arguments":"{\\"command\\":\\"echo ALLOWED\\"}"}}]}}]}\n\n'
            )
          )
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":5,"prompt_tokens":2,"completion_tokens":3,"prompt_cache_hit_tokens":1,"prompt_cache_miss_tokens":1,"completion_tokens_details":{"reasoning_tokens":0}}}\n\n'
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })
    } else {
      stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: {"choices":[{"delta":{"content":"${completionText}"}}]}\n\n`)
          )
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2,"prompt_tokens":1,"completion_tokens":1,"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":1,"completion_tokens_details":{"reasoning_tokens":0}}}\n\n'
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      body: stream,
      text: async () => '',
      json: async () => ({})
    })
  }
}

beforeEach(() => {
  global.fetch = jest.fn(() => sseResponse()) as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('App', () => {
  it(
    'renders the input prompt and bottom panel',
    async () => {
      const app = render(<App />)
      try {
        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        expect(stripAnsi(frame)).toContain('Bottom panel')
        expect(stripAnsi(frame)).toContain('Type here...')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'shows user prompt, streams assistant response and usage panel',
    async () => {
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('say hi')
        await waitForFrame(app.lastFrame, (f) => f.includes('say hi'))
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('Hello World'))
        expect(stripAnsi(app.lastFrame())).toContain('say hi')
        expect(await waitForFrame(app.lastFrame, (f) => f.includes('Context:'))).toBeTruthy()
        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0)
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'displays an error when the request fails',
    async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as unknown as typeof fetch
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('explode')
        await waitForFrame(app.lastFrame, (f) => f.includes('explode'))
        app.stdin.write('\r')

        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Network error'))
        expect(stripAnsi(frame)).toContain('Network error')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'exits the app on Ctrl+C',
    async () => {
      const app = render(<App />)
      await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
      app.stdin.write('\x03')
      await expect(app.waitUntilExit()).resolves.toBe(undefined)
    },
    TEST_TIMEOUT
  )

  it(
    'handles scroll navigation keys without crashing',
    async () => {
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('\u001b[5~') // PageUp
        app.stdin.write('\u001b[6~') // PageDown
        app.stdin.write('\u001b[H') // Home
        app.stdin.write('\u001b[F') // End
        app.stdin.write('\u001b[A') // Up arrow
        app.stdin.write('\u001b[B') // Down arrow
        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        expect(stripAnsi(frame)).toContain('Bottom panel')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    're-renders the layout when the terminal is resized',
    async () => {
      const app = render(<App />, { rows: 20, columns: 90 })
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdout.emit('resize')
        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        const plain = stripAnsi(frame)
        expect(plain).toContain('Bottom panel')
        expect(plain).not.toContain('Columns=')
        expect(plain).not.toContain('terminalOffset=')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'handles mouse button selection without crashing',
    async () => {
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('\u001b[<0;5;20M') // left-button press (SGR mouse)
        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        expect(stripAnsi(frame)).toContain('Bottom panel')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'toggles mouse tracking with F5 so the terminal can select text again',
    async () => {
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        const writes = () => app.frames().join('')
        expect(writes()).toContain('\x1b[?1002h') // mouse tracking enabled on mount
        app.stdin.write('\u001b[15~') // F5 → selection mode (mouse off)
        await waitForFrame(app.lastFrame, (f) => f.includes('Selection mode'))
        expect(writes()).toContain('\x1b[?1002l')
        expect(stripAnsi(app.lastFrame())).toContain('Selection mode (mouse off) · F5 on')
        app.stdin.write('\u001b[15~') // F5 → interactive mouse back on
        await waitForFrame(app.lastFrame, (f) => f.includes('Mouse on'))
        expect(writes()).toContain('\x1b[?1002h')
        expect(stripAnsi(app.lastFrame())).toContain('Mouse on · F5 off')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'pops a confirmation dialog for destructive tools and denies with default Enter',
    async () => {
      global.fetch = jest.fn(toolCallSseResponse()) as unknown as typeof fetch
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('run something')
        await waitForFrame(app.lastFrame, (f) => f.includes('run something'))
        app.stdin.write('\r')
        const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Allow execute_bash?'))
        const plain = stripAnsi(frame)
        expect(plain).toContain('Allow execute_bash?')
        expect(plain).toContain('execute_bash: echo ALLOWED')
        expect(plain).toContain('Allow')
        expect(plain).toContain('Deny')
        app.stdin.write('\r') // Enter on the default (Deny) choice
        await waitForFrame(app.lastFrame, (f) => f.includes('User denied: execute_bash'))
        expect(stripAnsi(app.lastFrame())).not.toContain('Allow execute_bash?')
        await waitForFrame(app.lastFrame, (f) => f.includes('Done'))
        // Pressing Enter to resolve the dialog must NOT re-submit the prompt and
        // start a second agent run: exactly two requests (tool turn + completion).
        expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'allows a destructive tool when the user selects Allow',
    async () => {
      global.fetch = jest.fn(toolCallSseResponse()) as unknown as typeof fetch
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('run something')
        await waitForFrame(app.lastFrame, (f) => f.includes('run something'))
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('Allow execute_bash?'))
        app.stdin.write('\u001b[C') // right arrow → Allow
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('ALLOWED'))
        await waitForFrame(app.lastFrame, (f) => f.includes('Done'))
        expect(stripAnsi(app.lastFrame())).not.toContain('User denied')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'trusts the rest of a task after one approval but asks again on the next task',
    async () => {
      global.fetch = jest.fn(
        callSequenceResponse([
          toolChunks('call_a', 'execute_bash', '{\\"command\\":\\"echo RUN_OK\\"}'),
          toolChunks('call_b', 'execute_bash', '{\\"command\\":\\"echo OK2\\"}'),
          textChunks('Done'),
          toolChunks('call_c', 'execute_bash', '{\\"command\\":\\"echo AGAIN\\"}'),
          textChunks('Done2')
        ])
      ) as unknown as typeof fetch
      const app = render(<App />, { rows: 50, columns: 130 })
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('run tests')
        await waitForFrame(app.lastFrame, (f) => f.includes('run tests'))
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('Allow execute_bash?'))
        app.stdin.write('\u001b[C') // right arrow → Allow
        app.stdin.write('\r')
        // The follow-up execute_bash (call_b) must run WITHOUT a second dialog:
        // its output only appears if it was trusted through automatically.
        const ok2 = await waitForFrame(app.lastFrame, (f) => f.includes('OK2'))
        expect(stripAnsi(ok2)).not.toContain('User denied')
        await waitForFrame(app.lastFrame, (f) => f.includes('Done'))

        // A new prompt starts a fresh task: trust resets and the dialog pops again.
        app.stdin.write('run again')
        await waitForFrame(app.lastFrame, (f) => f.includes('run again'))
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('Allow execute_bash?'))
        app.stdin.write('\r') // Enter on default (Deny) this time
        await waitForFrame(app.lastFrame, (f) => f.includes('User denied: execute_bash'))
        await waitForFrame(app.lastFrame, (f) => f.includes('Done2'))
        expect(stripAnsi(app.lastFrame())).not.toContain('Allow execute_bash?')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'resumes auto-scroll when scrolling down during an active stream',
    async () => {
      global.fetch = jest.fn(() => timedSseStream(90, 40)) as unknown as typeof fetch
      const app = render(<App />)
      try {
        await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
        app.stdin.write('hi')
        await waitForFrame(app.lastFrame, (f) => f.includes('hi'))
        app.stdin.write('\r')
        await waitForFrame(app.lastFrame, (f) => f.includes('tok5'))
        for (let i = 0; i < 3; i++) app.stdin.write('\u001b[A') // pageUp/up detaches follow
        await new Promise((resolve) => setTimeout(resolve, 200))
        for (let i = 0; i < 15; i++) {
          app.stdin.write('\u001b[B')
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        // No further input: streaming tail must follow into view on its own.
        await waitForFrame(app.lastFrame, (f) => f.includes('tok90'), 12000)
        expect(stripAnsi(app.lastFrame())).toContain('tok90')
      } finally {
        app.unmount()
      }
    },
    TEST_TIMEOUT
  )
})
