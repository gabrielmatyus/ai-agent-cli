export interface ChatMessage {
  role: AssistantRolesEnum //'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: FunctionModel[]
  tool_call_id?: string
  reasoning?: string
  reasoning_content?: string
}

export interface FunctionDefinition {
  name: string
  description?: string
  arguments: string
  parameters?: string
}

export interface FunctionModel {
  id: string
  type: 'function'
  function: FunctionDefinition
}

export interface ToolCallEvent {
  tool_call_id: string
  name: string
  args: Record<string, unknown>
  content: string
}

export enum AssistantRolesEnum {
  system = 'system',
  user = 'user',
  assistant = 'assistant',
  tool = 'tool'
}

export type Data = {
  id: string
  object: string
  created: number
  model: string
  system_fingerprint: string
  choices: Choice[]
  usage: Usage | null
  error: Error
}
export type Choice = {
  index: number
  delta: Delta
  logprobs: string | null
  finish_reason?: string | null
  message: ChatMessage
}
export type Delta = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: ToolCall[]
  reasoning?: string | null
  reasoning_details?: string
  error?: Error
}
export type ToolCall = {
  index: number
  id?: string
  type?: string
  function: { name?: string; arguments: string }
}

export type ToolCallState = {
  arguments: string
  tool_call_id: string
  type?: string
  name: string
}

export type PromptTokensDetailsModel = {
  cached_tokens: number
  audio_tokens: number
  cache_write_tokens: number
}
export type CompletionTokensDetailsModel = {
  reasoning_tokens: number
  audio_tokens: number
}
export type Usage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  prompt_tokens_details: PromptTokensDetailsModel
  completion_tokens_details?: CompletionTokensDetailsModel
}

export enum FetchMethod {
  STREAM = 'stream',
  POST = 'post',
  MOCK_STREAM = 'mock_stream',
  MOCK_POST = 'mock_post'
}

export type FunctionArguments = {
  path?: string | string[]
  command?: string
}
