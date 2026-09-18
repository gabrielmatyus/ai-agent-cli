import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { existsSync, rmSync } from 'fs'
import { resolve } from 'path'
import { ChatAI, should_skip, split_data, is_done } from '../ink/agent.js'
import { ChatMessage, AssistantRolesEnum, Usage, Data, FetchMethod } from '../ink/models.js'

const CAPTURE_CHUNKS = resolve(process.cwd(), 'src/ink/mocks/chunks_response.txt')

function sseChunksStream(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return Promise.resolve({
    ok: true,
    status: 200,
    body: stream,
    text: async () => 'text',
    json: async () => 'json'
  })
}

describe('ChatAI', () => {
  let chat: ChatAI

  beforeEach(() => {
    chat = new ChatAI()
    process.env.AI_AGENT_CONFIRM = 'always'
  })

  afterEach(() => {
    delete process.env.AI_AGENT_CONFIRM
    delete process.env.AI_AGENT_CAPTURE
  })

  describe('constructor', () => {
    it('should initialize with a system message', () => {
      expect(chat.messages).toHaveLength(1)
      expect(chat.messages[0].role).toBe('system')
    })

    it('should have system message content about being a helpful assistant', () => {
      expect(chat.messages[0].content).toContain('helpful assistant')
    })
  })

  describe('setUserPrompt', () => {
    it('should add a user message to the messages array', () => {
      const userMsg: ChatMessage = { role: AssistantRolesEnum.user, content: 'Hello' }
      chat.setUserPrompt(userMsg)
      expect(chat.messages).toHaveLength(2)
      expect(chat.messages[1].role).toBe('user')
      expect(chat.messages[1].content).toBe('Hello')
    })

    it('should append multiple user messages', () => {
      chat.setUserPrompt({ role: AssistantRolesEnum.user, content: 'First' })
      chat.setUserPrompt({ role: AssistantRolesEnum.user, content: 'Second' })
      expect(chat.messages).toHaveLength(3)
      expect(chat.messages[1].content).toBe('First')
      expect(chat.messages[2].content).toBe('Second')
    })
  })

  describe('agent FetchMethod.STREAM', () => {
    it('should call onError when fetch fails', async () => {
      // Mock global fetch to reject
      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onError).toHaveBeenCalled()
      expect((onError.mock.calls[0][0] as Error).message).toContain('Network error')

      global.fetch = originalFetch
    }, 10000)

    it('should call onError when response is not ok', async () => {
      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          body: null,
          text: async () => null,
          json: async () => null
        })
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onError).toHaveBeenCalled()
      expect((onError.mock.calls[0][0] as Error).message).toContain('401')

      global.fetch = originalFetch
    }, 10000)

    it('should process SSE data with content chunks having all data:', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":10}}\n\n',
              'data: [DONE]\n\n'
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).toHaveBeenCalled()
      const usageArg = onUsage.mock.calls[0][0] as Usage
      expect(usageArg.total_tokens).toBe(10)

      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('should process SSE data with content chunks containing invalid data. not data:', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
              'should be skipped: {}\n\n',
              'data: [DONE]\n\n'
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('should process SSE data with content chunks containing invalid data. data: but no string after', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
              'data: \n\n',
              'data: [DONE]\n\n'
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process SSE data with content chunks containing invalid data. data: {error: some_error}', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
              'data: {"error":"some_error"}\n\n',
              'data: [DONE]\n\n'
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process SSE data with content chunks containing no data_choices', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {}\n\n',
              'data: {"choices":[]}\n\n',
              'data: [DONE]\n\n'
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process SSE data with content chunks containing no choices but no delta', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = ['data: {"choices":[{}]}\n\n', 'data: {}\n\n', 'data: [DONE]\n\n']
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have called onDone with usage
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('should process reasoning_content chunks', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"I think..."}}]}\n\n')
            )
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n'
              )
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onUsage = jest.fn()
      const onMessage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onMessage).toHaveBeenCalled()
      expect(onMessage.mock.calls[0][0] as ChatMessage).toEqual({
        role: AssistantRolesEnum.assistant,
        content: '',
        reasoning: '',
        reasoning_content: 'I think...'
      })
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process reasoning chunks', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"reasoning":"I think..."}}]}\n\n')
            )
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n'
              )
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => 'text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onUsage = jest.fn()
      const onMessage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onMessage).toHaveBeenCalled()
      expect(onMessage.mock.calls[0][0] as ChatMessage).toEqual({
        role: AssistantRolesEnum.assistant,
        content: '',
        reasoning: 'I think...',
        reasoning_content: ''
      })
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('should process tool_calls and trigger tool execution', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // First call to fetch returns tool calls, second call returns done
      let callCount = 0

      global.fetch = jest.fn(() => {
        callCount++
        let stream: ReadableStream
        if (callCount === 1) {
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"test.txt\\"}"}}]}}]}\n\n'
                )
              )
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":5}}\n\n'
                )
              )
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
          })
        } else {
          // Subsequent calls: return a regular completion to exit the loop
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"Done"}}]}\n\n')
              )
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}\n\n'
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
          json: async () => {}
        })
      }) as unknown as typeof fetch

      const onDone = jest.fn()
      const onMessage = jest.fn()
      const onError = jest.fn()

      await chat.agent('test-model', onError, onMessage, onDone)

      // Should have tool call events
      const toolCallEvents = (onMessage.mock.calls as unknown as ChatMessage[][]).filter(
        (call: ChatMessage[]) => call[0].role === AssistantRolesEnum.tool
      )
      expect(toolCallEvents.length).toBeGreaterThan(0)

      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('should accumulate tool_calls with multiple indices', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      let callCount = 0

      global.fetch = jest.fn(() => {
        callCount++
        let stream: ReadableStream
        if (callCount === 1) {
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"a.txt\\"}"}}]}}]}\n\n'
                )
              )
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"write_file","arguments":"{\\"path\\":\\"b.txt\\",\\"content\\":\\"test\\"}"}}]}}]}\n\n'
                )
              )
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":10}}\n\n'
                )
              )
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
          })
        } else {
          // Subsequent calls: return a regular completion to exit the loop
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"Done"}}]}\n\n')
              )
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}\n\n'
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
          text: async () => 'Text',
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      // Should have two tool calls
      const toolCallEvents = (onMessage.mock.calls as unknown as ChatMessage[][]).filter(
        (call: ChatMessage[]) => call[0].role === AssistantRolesEnum.tool
      )
      expect(toolCallEvents.length).toBe(2)

      expect(onError).not.toHaveBeenCalled()
      expect(onUsage).toHaveBeenCalled()

      global.fetch = originalFetch
    })

    it('does not write capture files unless AI_AGENT_CAPTURE is enabled', async () => {
      rmSync(CAPTURE_CHUNKS, { force: true })

      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        sseChunksStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n',
          'data: [DONE]\n\n'
        ])
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onMessage).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(existsSync(CAPTURE_CHUNKS)).toBe(false)

      global.fetch = originalFetch
    })

    it('writes capture files when AI_AGENT_CAPTURE=1', async () => {
      process.env.AI_AGENT_CAPTURE = '1'
      rmSync(CAPTURE_CHUNKS, { force: true })

      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        sseChunksStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n',
          'data: [DONE]\n\n'
        ])
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(onError).not.toHaveBeenCalled()
      expect(existsSync(CAPTURE_CHUNKS)).toBe(true)

      global.fetch = originalFetch
    })

    it('passes an abort timeout signal on stream requests', async () => {
      const originalFetch = global.fetch
      let capturedSignal: AbortSignal | null | undefined
      global.fetch = jest.fn((_url: string, options?: RequestInit) => {
        capturedSignal = options?.signal
        return sseChunksStream([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n\n',
          'data: [DONE]\n\n'
        ])
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()

      await chat.agent('test-model', onError, onMessage, onUsage)

      expect(capturedSignal).toBeInstanceOf(AbortSignal)
      expect(capturedSignal?.aborted).toBe(false)

      global.fetch = originalFetch
    })
  })

  describe('agent FetchMethod.POST', () => {
    it('should call onError when fetch fails', async () => {
      // Mock global fetch to reject
      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)

      expect(onError).toHaveBeenCalled()
      expect((onError.mock.calls[0][0] as Error).message).toContain('Network error')

      global.fetch = originalFetch
    }, 10000)
    it('should call onError when response is not ok', async () => {
      const originalFetch = global.fetch
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          body: null,
          text: async () => null,
          json: async () => null
        })
      ) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)

      expect(onError).toHaveBeenCalled()
      expect((onError.mock.calls[0][0] as Error).message).toContain('401')

      global.fetch = originalFetch
    }, 10000)
    it('should process data with body having error:', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = ['error: {}\n\n']
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)

      // Should have called onDone with usage
      expect(onError).toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having no choices', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = ['{}\n\n']
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having emptychoices', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = ['{"choices":[]}\n\n']
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having valid data but no usage', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = [
          '{"choices":[{"finish_reason":null, "message":"Hello, how can I help you?" }], "usage":null}\n\n'
        ]
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having valid data with usage', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = [
          '{"choices":[{"finish_reason":null, "message":"Hello, how can I help you?" }], "usage":{"prompt_tokens":10, "completion_tokens":20}}\n\n'
        ]
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onMessage).toHaveBeenCalled()
      expect(onUsage).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having empty tool calls', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const chunks = ['{"choices":[{"finish_reason":"tool_calls", "message":{} }]}\n\n']
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: async () => chunks.join(''),
          json: async () => 'json'
        })
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onMessage).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
    it('should process data with body having tool calls', async () => {
      const originalFetch = global.fetch
      const encoder = new TextEncoder()

      // Create a mock response stream - use a factory to get fresh streams each call
      let step = 1
      global.fetch = jest.fn(() => {
        const chunks1 = [
          '{"choices":[{"finish_reason":"tool_calls", "message":{"tool_calls": []} }]}\n\n'
        ]
        const chunks2 = ['{"choices":[{"message":{} }]}\n\n']
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks1) {
              controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
          }
        })
        const response = Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: step === 1 ? async () => chunks1.join('') : async () => chunks2.join(''),
          // text: async () => { const response =  step === 1 ? chunks1.join('') : chunks2.join(''); step++; return response },
          json: async () => 'json'
        })
        step++
        return response
      }) as unknown as typeof fetch

      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const onConfirm = jest.fn<(name: string, args: Record<string, unknown>) => Promise<boolean>>()

      await chat.agent('test-model', onError, onMessage, onUsage, onConfirm, FetchMethod.POST)
      expect(onMessage).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
  })

  describe('messages array growth', () => {
    it('should maintain messages in order', () => {
      chat.setUserPrompt({ role: AssistantRolesEnum.user, content: 'Hi' })
      expect(chat.messages[0].role).toBe('system')
      expect(chat.messages[1].role).toBe('user')
      expect(chat.messages[1].content).toBe('Hi')
    })

    it('should keep the system message as the first element', () => {
      chat.setUserPrompt({ role: AssistantRolesEnum.user, content: 'Q1' })
      chat.setUserPrompt({ role: AssistantRolesEnum.user, content: 'Q2' })
      expect(chat.messages[0].role).toBe('system')
      expect(chat.messages.length).toBe(3)
    })
  })
  describe('additional coverage', () => {
    it('should call should_skip correctly', () => {
      const objWithType = { 'x-opencode-type': 'test' } as unknown as Data
      const objWithoutType = { message: 'hi' } as unknown as Data
      expect(should_skip(objWithType)).toBe(true)
      expect(should_skip(objWithoutType)).toBe(false)
    })

    it('should handle split_data with empty input', () => {
      expect(split_data(undefined)).toEqual([])
      expect(split_data('')).toEqual([])
    })

    it('should return true for [DONE] chunk', () => {
      expect(is_done('data: [DONE]\n\n')).toBe(true)
      expect(is_done('other')).toBe(false)
    })

    it('should handle process_stream error when fetch rejects', async () => {
      const originalFetch = global.fetch
      global.fetch = jest.fn(() => Promise.reject(new Error('network')))
      const onError = jest.fn()
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const chat = new ChatAI()
      await chat.agent('model', onError, onMessage, onUsage)
      expect(onError).toHaveBeenCalled()
      global.fetch = originalFetch
    })

    it('should throw when chunk has error', async () => {
      const onMessage = jest.fn()
      const onUsage = jest.fn()
      const chat = new ChatAI()
      await expect(chat.process_post('{"error":"test"}', [], onMessage, onUsage)).rejects.toThrow()
    })
  })
})
