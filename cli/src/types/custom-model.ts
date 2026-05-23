/**
 * Configuration for a user-defined custom model that connects to any
 * OpenAI-compatible /v1/chat/completions endpoint.
 */
export interface CustomModelConfig {
  /** Unique identifier (auto-generated UUID). */
  id: string
  /** Human-readable display name shown in the model selector. */
  name: string
  /** Base URL of the API (e.g. "https://api.openai.com/v1"). */
  baseUrl: string
  /** API key for authentication. */
  apiKey: string
  /** Model identifier sent in the request body (e.g. "gpt-4o"). */
  modelId: string
}

/** Prefix for custom model IDs so they're distinguishable from built-in ones. */
export const CUSTOM_MODEL_ID_PREFIX = 'custom/'
