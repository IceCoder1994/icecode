/**
 * Stateful stream XML parser that extracts tool calls from <codebuff_tool_call> XML
 * and filters them out of the text stream.
 *
 * Handles partial tags at chunk boundaries using a stateful approach.
 */

import {
  toolNameParam,
  toolXmlName,
} from '@codebuff/common/tools/constants'

export type ParsedToolCall = {
  toolName: string
  input: Record<string, unknown>
}

export type StreamParserState = {
  /** Buffer for holding partial content when inside a tool call tag or at boundaries */
  buffer: string
  /** Whether we're currently inside a tool call tag */
  insideToolCall: boolean
}

export type ParseResult = {
  /** Filtered text with tool call XML removed */
  filteredText: string
  /** Tool calls extracted from this chunk */
  toolCalls: ParsedToolCall[]
}

/**
 * Creates initial parser state
 */
export function createStreamParserState(): StreamParserState {
  return {
    buffer: '',
    insideToolCall: false,
  }
}

/**
 * Parses a stream chunk, extracting tool calls and filtering out the XML.
 *
 * @param chunk - The incoming text chunk
 * @param state - Mutable parser state (updated in place)
 * @returns Filtered text and any extracted tool calls
 */
export function parseStreamChunk(
  chunk: string,
  state: StreamParserState,
): ParseResult {
  if (!chunk) {
    return { filteredText: '', toolCalls: [] }
  }

  // Combine buffer with new chunk
  let text = state.buffer + chunk
  state.buffer = ''

  let filteredText = ''
  const toolCalls: ParsedToolCall[] = []

  while (text.length > 0) {
    if (state.insideToolCall) {
      // We're inside a tool call, look for the end tag (either </codebuff_tool_call> or </tool_call>)
      let endIndex = -1
      let endTagLength = 0

      const idx1 = text.indexOf('</codebuff_tool_call>')
      const idx2 = text.indexOf('</tool_call>')

      if (idx1 !== -1 && idx2 !== -1) {
        if (idx1 < idx2) {
          endIndex = idx1
          endTagLength = '</codebuff_tool_call>'.length
        } else {
          endIndex = idx2
          endTagLength = '</tool_call>'.length
        }
      } else if (idx1 !== -1) {
        endIndex = idx1
        endTagLength = '</codebuff_tool_call>'.length
      } else if (idx2 !== -1) {
        endIndex = idx2
        endTagLength = '</tool_call>'.length
      }

      if (endIndex !== -1) {
        // Found end tag - extract the content and parse it
        const toolCallContent = text.slice(0, endIndex)
        const parsedToolCall = parseToolCallContent(toolCallContent)
        if (parsedToolCall) {
          toolCalls.push(parsedToolCall)
        }

        text = text.slice(endIndex + endTagLength)
        state.insideToolCall = false
      } else {
        // No end tag yet - buffer all content until we find the end tag
        state.buffer = text
        text = ''
      }
    } else {
      // We're outside a tool call, look for start tag (either <codebuff_tool_call> or <tool_call>)
      let startIndex = -1
      let startTagLength = 0
      let matchedStartTag = ''

      const idx1 = text.indexOf('<codebuff_tool_call>')
      const idx2 = text.indexOf('<tool_call>')

      if (idx1 !== -1 && idx2 !== -1) {
        if (idx1 < idx2) {
          startIndex = idx1
          startTagLength = '<codebuff_tool_call>'.length
          matchedStartTag = '<codebuff_tool_call>'
        } else {
          startIndex = idx2
          startTagLength = '<tool_call>'.length
          matchedStartTag = '<tool_call>'
        }
      } else if (idx1 !== -1) {
        startIndex = idx1
        startTagLength = '<codebuff_tool_call>'.length
        matchedStartTag = '<codebuff_tool_call>'
      } else if (idx2 !== -1) {
        startIndex = idx2
        startTagLength = '<tool_call>'.length
        matchedStartTag = '<tool_call>'
      }

      if (startIndex !== -1) {
        // Found start tag - emit text before it, then enter tool call
        filteredText += text.slice(0, startIndex)
        text = text.slice(startIndex + startTagLength)
        state.insideToolCall = true
      } else {
        // No start tag - check if we might have a partial start tag for either pattern
        const partial1 = findPartialTagMatch(text, '<codebuff_tool_call>')
        const partial2 = findPartialTagMatch(text, '<tool_call>')
        const partialStart = Math.max(partial1, partial2)

        if (partialStart > 0) {
          // Emit everything except the partial tag, buffer the partial
          filteredText += text.slice(0, -partialStart)
          state.buffer = text.slice(-partialStart)
          text = ''
        } else {
          // No partial match, emit all
          filteredText += text
          text = ''
        }
      }
    }
  }

  return { filteredText, toolCalls }
}

/**
 * Parse the JSON content inside a tool call tag.
 */
function parseToolCallContent(content: string): ParsedToolCall | null {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    const toolName = parsed[toolNameParam]

    if (typeof toolName !== 'string') {
      return null
    }

    // Remove internal params from the input
    const input = { ...parsed }
    delete input[toolNameParam]
    delete input['cb_easp'] // endsAgentStepParam

    return { toolName, input }
  } catch {
    // JSON 解析失败，尝试使用松散 XML 格式解析
    return parseLooseToolCall(trimmed)
  }
}

/**
 * 尝试以松散 XML 格式解析大模型降级输出的工具调用。
 * 支持以下伪 XML 格式：
 * <function=read_files>
 * <parameter=paths>
 * ["src/components/common/lang-switch.vue"]
 */
function parseLooseToolCall(content: string): ParsedToolCall | null {
  // 1. 提取函数名。支持: <function=read_files> 或 <function="read_files"> 等
  const funcMatch = content.match(/<function=["']?([\w\-]+)["']?>/i)
  if (!funcMatch) {
    return null
  }
  const toolName = funcMatch[1]

  // 2. 提取所有的参数
  const paramRegex = /<parameter=["']?([\w\-]+)["']?>/gi
  const matches = Array.from(content.matchAll(paramRegex))
  const input: Record<string, unknown> = {}

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const paramName = match[1]
    const startIdx = match.index! + match[0].length

    // 参数值的结束位置是下一个参数标签的起点，或者是内容的末尾
    const endIdx = (i + 1 < matches.length) ? matches[i + 1].index! : content.length
    let paramValStr = content.slice(startIdx, endIdx).trim()

    // 清理可能存在的闭合标签（比如 </parameter> 等）
    paramValStr = paramValStr.replace(/<\/parameter\s*>/i, '').trim()

    // 尝试将其解析为 JSON，如果是个对象、数组、布尔或数字，这能极大地恢复结构
    let parsedVal: unknown = paramValStr
    try {
      parsedVal = JSON.parse(paramValStr)
    } catch {
      // 如果解析失败，说明可能是普通未加引号的纯文本，保持原样
    }

    input[paramName] = parsedVal
  }

  return { toolName, input }
}

/**
 * Find if the end of `text` is a partial match for the beginning of `tag`.
 * Returns the length of the overlap, or 0 if no overlap.
 */
function findPartialTagMatch(text: string, tag: string): number {
  const maxOverlap = Math.min(text.length, tag.length - 1)

  for (let len = maxOverlap; len > 0; len--) {
    const suffix = text.slice(-len)
    const prefix = tag.slice(0, len)
    if (suffix === prefix) {
      return len
    }
  }

  return 0
}
