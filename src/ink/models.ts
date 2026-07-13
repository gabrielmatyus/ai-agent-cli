export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  reasoning?: string
}

export interface ToolCallEvent {
  tool_call_id: string
  name: string
  args: Record<string, unknown>
  content: string
}

export enum AssistantRolesEnum {
  user = 'user',
  assistant= 'assistant',
  tool = 'tool',
  assistantReasoningContent = 'assistantReasoningContent',
  assistantContent = 'assistantContent',
  assistantMessage = 'assistantMessage',
  toolCall = 'toolCall',
  toolCallResponse = 'toolCallResponse'
}

export interface ClientEvent {
    baseRole: AssistantRolesEnum;
    role: AssistantRolesEnum;
    value: string;
    toolCall?: ToolCallEvent;
    msg?: ChatMessage;
}

export type Data = {
    id: string;
    object: string;
    created: number;
    model: string;
    system_fingerprint: string;
    choices: Choice[];
    usage: Usage | null;
}
export type Choice = {
    index: number;
    delta: Delta;
    logprobs: string | null;
    finish_reason?: string | null;
}
export type Delta = {
    content?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ToolCall[]
}
export type ToolCall = {
    index: number;
    id?: string;
    type?: string;
    function: { name?: string, arguments: string}
}

export type Usage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  prompt_tokens_details: { cached_tokens: number }
  completion_tokens_details: { reasoning_tokens: number }
}
