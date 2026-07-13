import { readFileSync } from 'fs'
import { resolve } from 'path'
import { tools, executeTool } from './tools.js'
import { chunks } from './chunks.js'
import { AssistantRolesEnum, ChatMessage, ClientEvent, Data, ToolCallEvent } from './models.js'

function loadEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env file not found or unreadable — use default env vars
  }
}

loadEnv()

const MODEL_URL = process.env.MODEL_URL || 'https://opencode.ai/zen/v1/chat/completions'
const API_KEY = process.env.MODEL_API_KEY || ''
const MODEL = process.env.MODEL || 'deepseek-v4-flash-free'

async function fetchResponse(model: string, fullMessages: ChatMessage[]): Promise<Response> {
    return fetch(MODEL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: fullMessages,
        tools
      })
    })
}

async function fetchMockResponse(i: number): Promise<Response> {
    return Promise.resolve(new Response(chunks[i], {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json",
      },
    }));
}

export class ChatAI {
    public messages: ChatMessage[] = [{
          role: 'system',
          content:
            `You are a helpful assistant with access to file read and write tools.` +
            `The project root directory is ${process.cwd()}. Use paths relative to this directory (e.g. "src/main/index.ts") or absolute paths.` +
            `Any change to a file should be also reported to the user to be visible in UI.`
        }];

    private onClientEvent: (event: ClientEvent) => void;

    constructor () {
        this.onClientEvent = () => {}
    }

    public setUserPrompt(userMsg: ChatMessage) {
        this.messages.push(userMsg)
    }
    private processChunkHandler = (chunk: string) => {
        const last = this.messages[this.messages.length - 1];
        if (last?.role === AssistantRolesEnum.assistant) {
            last.content = (last.content || '') + chunk;
        } else {
            this.messages.push({ role: AssistantRolesEnum.assistant, content: chunk });
        }
        this.onClientEvent({baseRole: AssistantRolesEnum.assistant, role: AssistantRolesEnum.assistantContent, value: chunk})
    };
    private processReasoningChunkHandler = (chunk: string) => {
        const last = this.messages[this.messages.length - 1];
        if (last?.role === AssistantRolesEnum.assistant) {
            last.reasoning = (last.reasoning || '') + chunk;
        } else {
            this.messages.push({ role: AssistantRolesEnum.assistant, content: '', reasoning: chunk });
        }
        this.onClientEvent({baseRole: AssistantRolesEnum.assistant, role: AssistantRolesEnum.assistantReasoningContent, value: chunk})
    };
    private decode_function = (fName: string | undefined): string => {
        switch (fName) {
            case 'list_directory':
                return 'List';
            case 'glob_files':
                return 'Glob';
            case 'read_file':
                return 'Read';
            case 'read_multiple_files':
                return 'Read';
            case 'write_file':
                return 'Write';
            case 'edit_file':
                return 'Edit';
            case 'delete_file':
                return 'Delete';
            case 'rename_file':
                return 'Rename';
            case 'execute_bash':
                return '>';
            case 'create_directory':
                return 'mk_dir';
            default:
                return 'unknown='+fName
      }
    }
    private processToolCallHandler = (toolCall: ToolCallEvent) => {
        const assiatnsMessages = this.messages.filter((x) =>x.role === AssistantRolesEnum.assistant)  
        const lastAssistantMessage = assiatnsMessages[assiatnsMessages.length - 1]
        const aToolCall = lastAssistantMessage.tool_calls?.find((x) => x.id === toolCall.tool_call_id)
        const functionName = this.decode_function(aToolCall?.function.name)
        
        const args = aToolCall ? JSON.parse(aToolCall.function.arguments) : {}
        let argsValue = (args.filePath ?? args.path ?? args.oldPath ?? args.pattern ?? args.dirPath ?? args.command ?? '')
        const processCwd = process.cwd()
        if (argsValue.includes(processCwd) && argsValue.length >= processCwd.length) argsValue = argsValue.slice(processCwd.length)

        const value = functionName + ' : ' + argsValue
        this.messages.push({
            role: AssistantRolesEnum.tool,
            tool_call_id: toolCall.tool_call_id,
            content: toolCall.content,
        });
        this.onClientEvent({baseRole: AssistantRolesEnum.tool, role: AssistantRolesEnum.toolCall, value, toolCall})
    };
    private processAssistantMessageHandler = (msg: ChatMessage) => {
        const last = this.messages[this.messages.length - 1];
        if (last?.role === AssistantRolesEnum.assistant) {
            last.tool_calls = msg.tool_calls;
        } else {
            this.messages.push({
                role: AssistantRolesEnum.assistant,
                content: msg.content || '',
                tool_calls: msg.tool_calls,
            });
        }
        this.onClientEvent({baseRole: AssistantRolesEnum.assistant, role: AssistantRolesEnum.assistantMessage, value: '', msg}) //msg.content || ''
    };
    
    public async streamChat(
      model = MODEL,
      onClientEvent: (event: ClientEvent) => void,
      onDone: (text: string) => void,
      onError: (error: Error) => void,
      onResponse?: (response: ChatMessage[]) => void
    ): Promise<void> {
      const live = false
      let i = 0
      this.onClientEvent = onClientEvent

      while (true) {
        let response: Response
        try {
          response = live ? await fetchResponse(model, this.messages) : await fetchMockResponse(i++)
        } catch (err) {
          onError(err instanceof Error ? err : new Error('Unknown error'))
          return
        }

        if (!response.ok || !response.body) {
          onError(new Error(`AI request failed: HTTP ${response.status} ${response.statusText}`))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        let accumulatedContent = ''
        const toolCalls = new Map<
          number,
          { tool_call_id?: string; type?: string; name?: string; arguments: string }
        >()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const decoded = decoder.decode(value, { stream: true })
          buffer += decoded
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
            try {
              const data = JSON.parse(trimmed.slice(5).trim()) as Data
              const delta = data.choices?.[0]?.delta
              const finishReason = data.choices?.[0]?.finish_reason
              const usage = data.usage

              if (usage && toolCalls.size === 0) {
                  onDone(JSON.stringify(usage))
              }

              if (delta?.content) {
                accumulatedContent += delta.content
                this.processChunkHandler(delta.content)
              }

              if (delta?.reasoning_content) {
                this.processReasoningChunkHandler(delta.reasoning_content)
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index
                  if (!toolCalls.has(index)) {
                    toolCalls.set(index, { arguments: '' })
                  }
                  const existing = toolCalls.get(index)!
                  if (tc.id) existing.tool_call_id = tc.id
                  if (tc.type) existing.type = tc.type
                  if (tc.function?.name) existing.name = tc.function.name
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments
                }
              }

              if (finishReason === 'tool_calls' && toolCalls.size > 0) {
                const assistantMsg: ChatMessage = {
                  role: 'assistant',
                  content: accumulatedContent || null,
                  tool_calls: Array.from(toolCalls.values()).map((tc) => ({
                    id: tc.tool_call_id!,
                    type: 'function' as const,
                    function: {
                      name: tc.name!,
                      arguments: tc.arguments
                    }
                  }))
                }
                this.processAssistantMessageHandler(assistantMsg)

                for (const tc of Array.from(toolCalls.values())) {
                  let content: string
                  let args: Record<string, unknown> = {}
                  try {
                    args = JSON.parse(tc.arguments)
                    content = executeTool(tc.name!, args)
                  } catch (err) {
                    content = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
                  }
                  this.processToolCallHandler({ tool_call_id: tc.tool_call_id!, content, name: tc.name!, args })
                }
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error)
              onError(error instanceof Error ? error : new Error('Unknown error'))
            }
          }
        }

        if (toolCalls.size === 0) {
          onResponse?.(this.messages)
          return
        }
      }
    }

}
