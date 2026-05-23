import { logger } from './logger'

import type { CustomModelConfig } from '../types/custom-model'

/**
 * Simple streaming chat completions client for OpenAI-compatible APIs.
 * Supports SSE (Server-Sent Events) streaming via the `stream: true` parameter.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  /** The delta content of this chunk, if any. */
  content: string | null
  /** Whether this is the final chunk (stream is done). */
  done: boolean
  /** Optional finish reason from the API. */
  finishReason?: string | null
}

/**
 * Build the request URL from the custom model config.
 */
function buildChatUrl(config: CustomModelConfig): string {
  const base = config.baseUrl.replace(/\/+$/, '')
  return `${base}/chat/completions`
}

/**
 * Build the request headers.
 */
function buildHeaders(config: CustomModelConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
}

/**
 * Build the request body.
 */
function buildBody(
  config: CustomModelConfig,
  messages: ChatMessage[],
  stream: boolean,
): string {
  return JSON.stringify({
    model: config.modelId,
    messages,
    stream,
  })
}

/**
 * Parse a single SSE data line from the streaming response.
 * Returns null for non-data lines (comments, empty lines, etc.).
 */
function parseSSELine(line: string): string | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  // The "[DONE]" signal indicates stream completion
  if (data === '[DONE]') return null
  return data
}

/**
 * Parse a streaming chunk from an SSE JSON payload.
 */
function parseStreamChunk(jsonData: string): StreamChunk {
  try {
    const parsed = JSON.parse(jsonData)
    const choice = parsed.choices?.[0]
    if (!choice) {
      return { content: null, done: true }
    }
    const delta = choice.delta?.content ?? null
    const finishReason = choice.finish_reason ?? null
    return {
      content: delta,
      done: finishReason !== null || choice.finish_reason !== undefined,
      finishReason,
    }
  } catch {
    logger.debug({ jsonData }, '[custom-model] Failed to parse stream chunk')
    return { content: null, done: true }
  }
}

/**
 * Send a chat completion request with streaming support.
 * The `onChunk` callback is called for each content delta.
 *
 * Returns the full accumulated text on success, or throws on error.
 */
export async function streamChatCompletion(
  config: CustomModelConfig,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = buildChatUrl(config)
  const headers = buildHeaders(config)
  const body = buildBody(config, messages, true)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Custom model API error (${response.status}): ${errorText.slice(0, 500)}`,
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Custom model API response has no readable body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines from the buffer
      const lines = buffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        const jsonData = parseSSELine(trimmedLine)
        if (!jsonData) continue

        const chunk = parseStreamChunk(jsonData)
        if (chunk.content) {
          accumulated += chunk.content
        }
        onChunk(chunk)

        if (chunk.done) {
          return accumulated
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const jsonData = parseSSELine(buffer.trim())
      if (jsonData) {
        const chunk = parseStreamChunk(jsonData)
        if (chunk.content) {
          accumulated += chunk.content
        }
        onChunk(chunk)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return accumulated
}

/**
 * Send a non-streaming chat completion request.
 * Returns the full response text.
 */
export async function chatCompletion(
  config: CustomModelConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = buildChatUrl(config)
  const headers = buildHeaders(config)
  const body = buildBody(config, messages, false)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Custom model API error (${response.status}): ${errorText.slice(0, 500)}`,
    )
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  return content
}
