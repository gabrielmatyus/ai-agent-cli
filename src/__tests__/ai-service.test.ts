import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChatAI } from '../ink/ai-service.js';
import { ChatMessage, ClientEvent, AssistantRolesEnum } from '../ink/models.js';

describe('ChatAI', () => {
  let chat: ChatAI;

  beforeEach(() => {
    chat = new ChatAI();
  });

  describe('constructor', () => {
    it('should initialize with a system message', () => {
      expect(chat.messages).toHaveLength(1);
      expect(chat.messages[0].role).toBe('system');
    });

    it('should have system message content about being a helpful assistant', () => {
      expect(chat.messages[0].content).toContain('helpful assistant');
    });
  });

  describe('setUserPrompt', () => {
    it('should add a user message to the messages array', () => {
      const userMsg: ChatMessage = { role: 'user', content: 'Hello' };
      chat.setUserPrompt(userMsg);
      expect(chat.messages).toHaveLength(2);
      expect(chat.messages[1].role).toBe('user');
      expect(chat.messages[1].content).toBe('Hello');
    });

    it('should append multiple user messages', () => {
      chat.setUserPrompt({ role: 'user', content: 'First' });
      chat.setUserPrompt({ role: 'user', content: 'Second' });
      expect(chat.messages).toHaveLength(3);
      expect(chat.messages[1].content).toBe('First');
      expect(chat.messages[2].content).toBe('Second');
    });
  });

  describe('streamChat', () => {
    it('should call onError when fetch fails', async () => {
      // Mock global fetch to reject
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      expect(onError).toHaveBeenCalled();
      expect((onError.mock.calls[0][0] as Error).message).toContain('Network error');

      global.fetch = originalFetch;
    }, 10000);

    it('should call onError when response is not ok', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          body: null,
        })
      ) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      expect(onError).toHaveBeenCalled();
      expect((onError.mock.calls[0][0] as Error).message).toContain('401');

      global.fetch = originalFetch;
    }, 10000);

    it('should process SSE data with content chunks', async () => {
      const originalFetch = global.fetch;
      const encoder = new TextEncoder();

      // Create a mock response stream - use a factory to get fresh streams each call
      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
              'data: {"choices":[{"delta":{"content":" World"}}]}\n',
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":10}}\n',
              'data: [DONE]\n',
            ];
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      // Should have received content chunks
      expect(onClientEvent).toHaveBeenCalled();
      // First chunk
      expect((onClientEvent.mock.calls[0][0] as ClientEvent)).toEqual({
        baseRole: AssistantRolesEnum.assistant,
        role: AssistantRolesEnum.assistantContent,
        value: 'Hello',
      });
      // Second chunk
      expect((onClientEvent.mock.calls[1][0] as ClientEvent)).toEqual({
        baseRole: AssistantRolesEnum.assistant,
        role: AssistantRolesEnum.assistantContent,
        value: ' World',
      });
      // Should have called onDone with usage
      expect(onDone).toHaveBeenCalled();
      const usageArg = JSON.parse(onDone.mock.calls[0][0] as string);
      expect(usageArg.total_tokens).toBe(10);

      expect(onError).not.toHaveBeenCalled();

      global.fetch = originalFetch;
    }, 10000);

    it('should process reasoning_content chunks', async () => {
      const originalFetch = global.fetch;
      const encoder = new TextEncoder();

      global.fetch = jest.fn(() => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"reasoning_content":"I think..."}}]}\n'
              )
            );
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":5}}\n'
              )
            );
            controller.enqueue(encoder.encode('data: [DONE]\n'));
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      expect(onClientEvent).toHaveBeenCalled();
      expect((onClientEvent.mock.calls[0][0] as ClientEvent)).toEqual({
        baseRole: AssistantRolesEnum.assistant,
        role: AssistantRolesEnum.assistantReasoningContent,
        value: 'I think...',
      });
      expect(onError).not.toHaveBeenCalled();

      global.fetch = originalFetch;
    }, 10000);

    it('should process tool_calls and trigger tool execution', async () => {
      const originalFetch = global.fetch;
      const encoder = new TextEncoder();

      // First call to fetch returns tool calls, second call returns done
      let callCount = 0;

      global.fetch = jest.fn(() => {
        callCount++;
        let stream: ReadableStream;
        if (callCount === 1) {
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"filePath\\":\\"test.txt\\"}"}}]}}]}\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":5}}\n'
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n'));
              controller.close();
            },
          });
        } else {
          // Subsequent calls: return a regular completion to exit the loop
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"Done"}}]}\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}\n'
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n'));
              controller.close();
            },
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      // Should have tool call events
      const toolCallEvents = (onClientEvent.mock.calls as unknown as ClientEvent[][]).filter(
        (call: ClientEvent[]) => call[0].baseRole === AssistantRolesEnum.tool
      );
      expect(toolCallEvents.length).toBeGreaterThan(0);

      expect(onError).not.toHaveBeenCalled();

      global.fetch = originalFetch;
    }, 10000);

    it('should accumulate tool_calls with multiple indices', async () => {
      const originalFetch = global.fetch;
      const encoder = new TextEncoder();

      let callCount = 0;

      global.fetch = jest.fn(() => {
        callCount++;
        let stream: ReadableStream;
        if (callCount === 1) {
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"filePath\\":\\"a.txt\\"}"}}]}}]}\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"write_file","arguments":"{\\"filePath\\":\\"b.txt\\",\\"content\\":\\"test\\"}"}}]}}]}\n'
                )
              );
              // controller.enqueue(
              //   encoder.encode(
              //     'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"write_file","arguments":"{\\"filePath\\":\\"b.txt\\",\\"content\\":\\"test\\"}"}}]}}]}\n'
              //   )
              // );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":10}}\n'
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n'));
              controller.close();
            },
          });
        } else {
          // Subsequent calls: return a regular completion to exit the loop
          stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"Done"}}]}\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}\n'
                )
              );
              controller.enqueue(encoder.encode('data: [DONE]\n'));
              controller.close();
            },
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }) as unknown as typeof fetch;

      const onClientEvent = jest.fn();
      const onDone = jest.fn();
      const onError = jest.fn();

      await chat.streamChat('test-model', onClientEvent, onDone, onError, undefined, true);

      // Should have two tool calls
      const toolCallEvents = (onClientEvent.mock.calls as unknown as ClientEvent[][]).filter(
        (call: ClientEvent[]) =>
          call[0].baseRole === AssistantRolesEnum.tool &&
          call[0].role === AssistantRolesEnum.toolCall
      );
      expect(toolCallEvents.length).toBe(2);

      expect(onError).not.toHaveBeenCalled();

      global.fetch = originalFetch;
    }, 10000);
  });

  describe('messages array growth', () => {
    it('should maintain messages in order', () => {
      chat.setUserPrompt({ role: 'user', content: 'Hi' });
      expect(chat.messages[0].role).toBe('system');
      expect(chat.messages[1].role).toBe('user');
      expect(chat.messages[1].content).toBe('Hi');
    });

    it('should keep the system message as the first element', () => {
      chat.setUserPrompt({ role: 'user', content: 'Q1' });
      chat.setUserPrompt({ role: 'user', content: 'Q2' });
      expect(chat.messages[0].role).toBe('system');
      expect(chat.messages.length).toBe(3);
    });
  });
});
