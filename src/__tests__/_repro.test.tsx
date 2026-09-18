import { describe, it, jest } from '@jest/globals'
import stripAnsi from 'strip-ansi'
import App from '../ink/App.js'
import { render, waitForFrame } from './helpers/ink-render.js'

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

describe('repro', () => {
  it('dialog open/close frame analysis', async () => {
    global.fetch = jest.fn(toolCallSseResponse()) as unknown as typeof fetch
    const app = render(<App />, { rows: 24, columns: 100 })
    try {
      await waitForFrame(app.lastFrame, (f) => f.includes('Bottom panel'))
      app.stdin.write('run something')
      await waitForFrame(app.lastFrame, (f) => f.includes('run something'))
      app.stdin.write('\r')
      const d = await waitForFrame(app.lastFrame, (f) => f.includes('Allow execute_bash?'))
      const linesD = stripAnsi(d).split('\n')
      console.log('=== DIALOG OPEN lines:', linesD.length)
      linesD.forEach((l, i) => console.log(`${i}: "${l}"`))
      app.stdin.write('\u001b[C')
      app.stdin.write('\r')
      await waitForFrame(app.lastFrame, (f) => f.includes('ALLOWED'))
      await new Promise((r) => setTimeout(r, 50))
      const after = stripAnsi(app.lastFrame())
      const linesA = after.split('\n')
      console.log('=== AFTER lines:', linesA.length)
      linesA.forEach((l, i) => console.log(`${i}: "${l}"`))
    } finally {
      app.unmount()
    }
  }, 30000)
})
