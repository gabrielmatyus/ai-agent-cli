import { readFileSync } from 'fs'
import { resolve } from 'path'
import { tools, execute_tool } from './tools.js'
import { chunks as mock_chunks } from './mocks/chunks.js'
import {
  AssistantRolesEnum,
  ChatMessage,
  Data,
  FetchMethod,
  ToolCallState,
  Usage,
  FunctionModel
} from './models.js'

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
const AI_AGENT_TIMEOUT_MS = Number(process.env.AI_AGENT_TIMEOUT_MS || 300000)

export function should_skip(obj: Data) {
  return 'x-opencode-type' in obj
}
export function split_data(raw: string | undefined): Data[] {
  if (!raw) return []
  const data: Data[] = []
  for (const event of raw.split('\n\n')) {
    if (!event.startsWith('data:')) continue
    const payload = event.slice(5).trim()
    if (payload === '[DONE]') break

    const obj = JSON.parse(payload) as Data
    if (should_skip(obj)) continue
    const objData = obj as Data
    data.push(objData)
  }
  return data
}

async function* stream_response(model: string, messages: ChatMessage[]) {
  const retries = 5
  let response
  let lastError
  for (let i = 0; i < retries; i++) {
    try {
      lastError = null
      response = await fetch(MODEL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: messages,
          tools
          // provider: {
          //   sort: 'throughput'
          //   // allow_fallbacks: true,
          // }
        }),
        signal: AbortSignal.timeout(AI_AGENT_TIMEOUT_MS)
      })
      break
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  if (!response) throw new Error(`HTTP no response`)

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let separatorIndex
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      if (event.trim()) {
        yield event
      }
    }
  }
}
async function* fetch_response(model: string, messages: ChatMessage[]) {
  const response = await fetch(MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: messages,
      tools
    }),
    signal: AbortSignal.timeout(AI_AGENT_TIMEOUT_MS)
  })
  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  yield await response.text()
}
async function* fetch_response_mock(chunks: string[][], index: number) {
  if (index >= chunks.length) return
  for (const chunk of chunks[index]) yield chunk
}

export function is_done(chunk: string) {
  if (chunk.startsWith('data:')) {
    const data = chunk.slice(5).trim()
    return data == '[DONE]'
  }
  return false
}
async function* fetch_data(
  model: string,
  messages: ChatMessage[],
  chunks: string[][],
  method: FetchMethod,
  index: number
) {
  switch (method) {
    case FetchMethod.STREAM:
      for await (const chunk of stream_response(model, messages)) yield chunk
      break
    case FetchMethod.POST:
      for await (const chunk of fetch_response(model, messages)) yield chunk
      break
    case FetchMethod.MOCK_STREAM:
      yield* fetch_response_mock(chunks, index)
      break
    case FetchMethod.MOCK_POST:
      yield* fetch_response_mock(chunks, index)
      break
    default:
      break
  }
}

export class ChatAI {
  public messages: ChatMessage[] = [
    {
      role: AssistantRolesEnum.system,
      content:
        `You are a helpful assistant with access to file read and write tools.` +
        `The project root directory is ${process.cwd()}. Use paths relative to this directory (e.g. "src/main/index.ts") or absolute paths.` +
        `Any change to a file should be also reported to the user to be visible in UI.` +
        `Avoid reading/sending files that contains mock data and are big in size like src/ink/mocks/chunks.ts`
    }
  ]

  constructor() {}

  private on_confirm?: (name: string, args: Record<string, unknown>) => Promise<boolean>

  public setUserPrompt(userMsg: ChatMessage) {
    this.messages.push(userMsg)
  }
  public async process_stream(
    chunk: string,
    messages: ChatMessage[],
    tool_calls: Map<number, ToolCallState>,
    on_message: (msg: ChatMessage) => void,
    on_usage: (usage: Usage) => void
  ) {
    let last_message = messages[messages.length - 1]
    if (last_message.role !== AssistantRolesEnum.assistant) {
      messages.push({
        role: AssistantRolesEnum.assistant,
        content: '',
        reasoning_content: '',
        reasoning: ''
      })
      last_message = messages[messages.length - 1]
      on_message(last_message)
    }

    let continue_reasoning = false
    const list_data = split_data(chunk)
    for (const data of list_data) {
      if (data.error) {
        const error = new Error(data.error.message)
        ;(error as Error & { statusCode: number }).statusCode = (
          data.error as Error & { code: number }
        ).code
        throw error
      }
      if (data.usage) on_usage(data.usage)
      if (!data.choices || data.choices.length !== 1) continue
      const choice = data.choices[0]
      const delta = choice.delta
      const finish_reason = choice.finish_reason

      if (delta) {
        if (delta.reasoning_content) last_message.reasoning_content += delta.reasoning_content
        if (delta.reasoning) last_message.reasoning += delta.reasoning
        if (delta.content) last_message.content += delta.content
        on_message(last_message)
      }

      if (delta.tool_calls) {
        for (const tool_call of delta.tool_calls) {
          if (!tool_calls.has(tool_call.index)) {
            tool_calls.set(tool_call.index, { tool_call_id: '', arguments: '', name: '' })
          }
          const tool_call_ = tool_calls.get(tool_call.index) as ToolCallState
          tool_call_.tool_call_id = tool_call.id ?? tool_call_?.tool_call_id
          tool_call_.type = tool_call.type ?? tool_call_.type
          tool_call_.name = tool_call.function.name ?? tool_call_.name
          if (tool_call.function) {
            tool_call_.arguments += tool_call.function.arguments
          } else tool_call_.arguments += ''
        }
      }
      if (finish_reason === 'tool_calls') {
        const tool_calls_: FunctionModel[] = []
        for (const tool_call of tool_calls.values()) {
          tool_calls_.push({
            id: tool_call.tool_call_id,
            type: 'function',
            function: {
              name: tool_call.name,
              arguments: tool_call.arguments
            }
          })
        }

        let last_message = messages[messages.length - 1]
        last_message.tool_calls = tool_calls_
        on_message(last_message)

        //execute tool calls
        for (const tool_call of tool_calls.values()) {
          const content = await execute_tool(tool_call.name, JSON.parse(tool_call.arguments), {
            confirm: this.on_confirm
          })
          messages.push({
            role: AssistantRolesEnum.tool,
            tool_call_id: tool_call.tool_call_id,
            content: content
          })
          last_message = messages[messages.length - 1]
          on_message(last_message)
        }

        continue_reasoning = true
      }
    }
    return continue_reasoning
  }

  public async process_post(
    chunk: string,
    messages: ChatMessage[],
    on_message: (msg: ChatMessage) => void,
    on_usage: (usage: Usage) => void
  ) {
    let continue_reasoning = false
    const data = JSON.parse(chunk) as Data
    if (data.error) {
      const error = new Error(data.error.message)
      ;(error as Error & { statusCode: number }).statusCode = (
        data.error as Error & { code: number }
      ).code
      throw error
    }
    if (!data.choices || data.choices.length !== 1) return false

    const finish_reason = data.choices[0].finish_reason

    messages.push(data.choices[0].message)
    let last_message = messages[messages.length - 1]
    on_message(last_message)
    if (finish_reason == 'tool_calls' && data.choices[0].message.tool_calls) {
      for (const tool_call of data.choices[0].message.tool_calls) {
        const content = await execute_tool(
          tool_call.function.name,
          JSON.parse(tool_call.function.arguments),
          { confirm: this.on_confirm }
        )
        messages.push({ role: AssistantRolesEnum.tool, tool_call_id: tool_call.id, content })
        last_message = messages[messages.length - 1]
        on_message(last_message)
      }
      continue_reasoning = true
    }
    if (data.usage) on_usage(data.usage)

    return continue_reasoning
  }

  private chunks: string[][] = []
  public async agent(
    model = MODEL,
    on_error: (error: Error) => void,
    on_message: (response: ChatMessage) => void,
    on_usage: (usage: Usage) => void,
    on_confirm?: (name: string, args: Record<string, unknown>) => Promise<boolean>,
    method?: FetchMethod
  ): Promise<void> {
    this.on_confirm = on_confirm
    let index = -1
    method = method || FetchMethod.STREAM
    let continue_reasoning = true
    while (continue_reasoning) {
      continue_reasoning = false
      this.chunks.push([])
      const tool_calls = new Map<number, ToolCallState>()
      index += 1
      try {
        for await (const chunk of fetch_data(model, this.messages, mock_chunks, method, index)) {
          this.chunks[this.chunks.length - 1].push(chunk)
          if ([FetchMethod.STREAM, FetchMethod.MOCK_STREAM].includes(method)) {
            if (is_done(chunk)) break
            continue_reasoning ||= await this.process_stream(
              chunk,
              this.messages,
              tool_calls,
              on_message,
              on_usage
            )
          } else if ([FetchMethod.POST, FetchMethod.MOCK_POST].includes(method)) {
            continue_reasoning ||= await this.process_post(
              chunk,
              this.messages,
              on_message,
              on_usage
            )
          } else break
        }
        if (process.env.AI_AGENT_CAPTURE === '1') {
          await execute_tool(
            'write_file',
            {
              path: 'src/ink/mocks/chunks_response.txt',
              content: JSON.stringify(this.chunks)
            },
            { skipConfirmation: true }
          )
          await execute_tool(
            'write_file',
            {
              path: 'src/ink/mocks/messages_response.json',
              content: JSON.stringify(this.messages)
            },
            { skipConfirmation: true }
          )
        }
      } catch (error) {
        on_error(error as Error)
        //throw error
      }
    }
  }
}
