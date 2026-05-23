import { trackEvent as trackCommonEvent } from '@codebuff/common/analytics'
import { env as clientEnvDefault } from '@codebuff/common/env'
import { getCiEnv } from '@codebuff/common/env-ci'
import { shouldTrackAnalyticsEvent } from '@codebuff/common/util/analytics-sampling'
import { success } from '@codebuff/common/util/error'

import type { CustomModelEndpointConfig } from './model-provider'

import {
  addAgentStep,
  fetchAgentFromDatabase,
  finishAgentRun,
  getUserInfoFromApiKey,
  startAgentRun,
} from './database'
import { promptAiSdk, promptAiSdkStream, promptAiSdkStructured } from './llm'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { DatabaseAgentCache } from '@codebuff/common/types/contracts/database'
import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'

const databaseAgentCache: DatabaseAgentCache = new Map()

/**
 * Create a promptAiSdk wrapper that injects customModelEndpoint into all LLM calls.
 */
function wrapPromptAiSdkWithCustomModel(
  customModelEndpoint: CustomModelEndpointConfig,
) {
  const wrappedPromptAiSdkStream: typeof promptAiSdkStream = async function* (
    params: any,
  ) {
    const result = yield* promptAiSdkStream({
      ...params,
      customModelEndpoint,
    })
    return result
  }

  const wrappedPromptAiSdk: typeof promptAiSdk = async (params: any) => {
    return promptAiSdk({
      ...params,
      customModelEndpoint,
    })
  }

  const wrappedPromptAiSdkStructured: typeof promptAiSdkStructured = async <T>(
    params: any,
  ) => {
    return promptAiSdkStructured<T>({
      ...params,
      customModelEndpoint,
    })
  }

  return {
    promptAiSdkStream: wrappedPromptAiSdkStream,
    promptAiSdk: wrappedPromptAiSdk,
    promptAiSdkStructured: wrappedPromptAiSdkStructured,
  }
}

export function getAgentRuntimeImpl(
  params: {
    logger?: Logger
    apiKey: string
    clientEnv?: ClientEnv
    /** If provided, all LLM calls route through this custom endpoint instead of Codebuff backend */
    customModelEndpoint?: CustomModelEndpointConfig
  } & Pick<
    AgentRuntimeScopedDeps,
    | 'handleStepsLogChunk'
    | 'requestToolCall'
    | 'requestMcpToolData'
    | 'requestFiles'
    | 'requestOptionalFile'
    | 'sendAction'
    | 'sendSubagentChunk'
  >,
): AgentRuntimeDeps & AgentRuntimeScopedDeps {
  const {
    logger,
    apiKey,
    clientEnv = clientEnvDefault,
    customModelEndpoint,
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    sendAction,
    sendSubagentChunk,
  } = params

  const trackSdkRuntimeEvent: TrackEventFn = (eventParams) => {
    if (
      clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod' &&
      !shouldTrackAnalyticsEvent({
        event: eventParams.event,
        distinctId: eventParams.userId,
        properties: eventParams.properties,
      })
    ) {
      return
    }

    trackCommonEvent(eventParams)
  }

  // If customModelEndpoint is provided, wrap the LLM functions to inject it
  const llmWrappers = customModelEndpoint
    ? wrapPromptAiSdkWithCustomModel(customModelEndpoint)
    : undefined

  // For custom models (no Codebuff backend), database functions are no-ops.
  // getUserInfoFromApiKey is NOT overridden here — run.ts handles it directly.
  const isLocalMode = !!customModelEndpoint

  return {
    // Environment
    clientEnv,
    ciEnv: getCiEnv(),

    // Database — skip server calls in local mode (custom models)
    getUserInfoFromApiKey,
    fetchAgentFromDatabase: isLocalMode
      ? async () => null
      : fetchAgentFromDatabase,
    startAgentRun: isLocalMode
      ? async () => crypto.randomUUID()
      : startAgentRun,
    finishAgentRun: isLocalMode
      ? async () => {}
      : finishAgentRun,
    addAgentStep: isLocalMode
      ? async () => null
      : addAgentStep,

    // Billing
    consumeCreditsWithFallback: async () =>
      success({
        chargedToOrganization: false,
      }),

    // LLM — use wrapped versions when custom model endpoint is configured
    promptAiSdkStream: llmWrappers?.promptAiSdkStream ?? promptAiSdkStream,
    promptAiSdk: llmWrappers?.promptAiSdk ?? promptAiSdk,
    promptAiSdkStructured: llmWrappers?.promptAiSdkStructured ?? promptAiSdkStructured,

    // Mutable State
    databaseAgentCache,

    // Analytics
    trackEvent: trackSdkRuntimeEvent,

    // Other
    logger: logger ?? noopLogger,
    fetch: globalThis.fetch,

    // Client (WebSocket)
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    sendAction,
    sendSubagentChunk,

    apiKey,
  }
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
