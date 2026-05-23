import fs from 'fs'
import path from 'path'

import { isFreebuffModelId } from '@codebuff/common/constants/freebuff-models'

import { CUSTOM_MODEL_ID_PREFIX } from '../types/custom-model'
import { getConfigDir } from './auth'
import { AGENT_MODES } from './constants'
import { logger } from './logger'

import type { CustomModelConfig } from '../types/custom-model'
import type { AgentMode } from './constants'

const DEFAULT_SETTINGS: Settings = {
  mode: 'DEFAULT' as const,
  adsEnabled: true,
}

// Note: The old FREE mode has been renamed back to LITE; migrate on load.

/**
 * Settings schema - add new settings here as the product evolves
 */
export interface Settings {
  mode?: AgentMode
  adsEnabled?: boolean
  /** Last model the user picked in the freebuff model selector. Restored on
   *  next freebuff launch so users land in the queue for their preferred
   *  model without re-picking. Persisted as the canonical model id. */
  freebuffModel?: string
  /** User-defined custom models that connect to OpenAI-compatible endpoints. */
  customModels?: CustomModelConfig[]
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  alwaysUseALaCarte?: boolean
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  fallbackToALaCarte?: boolean
}

/**
 * Get the settings file path
 */
export const getSettingsPath = (): string => {
  return path.join(getConfigDir(), 'settings.json')
}

/**
 * Ensure the config directory exists, creating it if necessary
 */
const ensureConfigDirExists = (): void => {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * Load all settings from file system
 * @returns The saved settings object, with defaults for missing values
 */
export const loadSettings = (): Settings => {
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    ensureConfigDirExists()
    // Create default settings file
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }

  try {
    const settingsFile = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(settingsFile)
    return validateSettings(parsed)
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading settings',
    )
    return {}
  }
}

/**
 * Validate and sanitize settings from file
 */
const validateSettings = (parsed: unknown): Settings => {
  if (typeof parsed !== 'object' || parsed === null) {
    return {}
  }

  const settings: Settings = {}
  const obj = parsed as Record<string, unknown>

  // Validate mode; migrate the previously-saved 'FREE' value to 'LITE'.
  if (typeof obj.mode === 'string') {
    const normalized = obj.mode === 'FREE' ? 'LITE' : obj.mode
    if (AGENT_MODES.includes(normalized as AgentMode)) {
      settings.mode = normalized as AgentMode
    }
  }

  // Validate adsEnabled
  if (typeof obj.adsEnabled === 'boolean') {
    settings.adsEnabled = obj.adsEnabled
  }

  // Validate freebuffModel — drop unknown ids so a removed model doesn't
  // strand the user on a non-existent queue.
  // Also allow custom model IDs (prefixed with 'custom/').
  if (
    typeof obj.freebuffModel === 'string' &&
    (isFreebuffModelId(obj.freebuffModel) || obj.freebuffModel.startsWith(CUSTOM_MODEL_ID_PREFIX))
  ) {
    settings.freebuffModel = obj.freebuffModel
  }

  // Validate customModels
  if (Array.isArray(obj.customModels)) {
    const validatedModels: CustomModelConfig[] = []
    for (const model of obj.customModels) {
      if (isValidCustomModelConfig(model)) {
        validatedModels.push(model)
      }
    }
    if (validatedModels.length > 0) {
      settings.customModels = validatedModels
    }
  }

  // Validate alwaysUseALaCarte (legacy)
  if (typeof obj.alwaysUseALaCarte === 'boolean') {
    settings.alwaysUseALaCarte = obj.alwaysUseALaCarte
  }

  // Validate fallbackToALaCarte (legacy)
  if (typeof obj.fallbackToALaCarte === 'boolean') {
    settings.fallbackToALaCarte = obj.fallbackToALaCarte
  }

  return settings
}

/**
 * Validate a single custom model config object.
 */
function isValidCustomModelConfig(value: unknown): value is CustomModelConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.baseUrl === 'string' &&
    typeof c.apiKey === 'string' &&
    typeof c.modelId === 'string'
  )
}

/**
 * Save settings to file system (merges with existing settings)
 */
export const saveSettings = (newSettings: Partial<Settings>): void => {
  const settingsPath = getSettingsPath()

  try {
    ensureConfigDirExists()

    // Load existing settings and merge
    const existingSettings = loadSettings()
    const mergedSettings = { ...existingSettings, ...newSettings }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2))
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving settings',
    )
  }
}

/**
 * Load the saved agent mode preference
 * @returns The saved mode, or 'DEFAULT' if not found or invalid
 */
export const loadModePreference = (): AgentMode => {
  const settings = loadSettings()
  return settings.mode ?? 'DEFAULT'
}

/**
 * Save the agent mode preference
 */
export const saveModePreference = (mode: AgentMode): void => {
  saveSettings({ mode })
}

/**
 * Load the saved freebuff model preference. Returns undefined if none is
 * saved yet — callers should fall back to DEFAULT_FREEBUFF_MODEL_ID.
 */
export const loadFreebuffModelPreference = (): string | undefined => {
  return loadSettings().freebuffModel
}

/**
 * Save the freebuff model preference. Called whenever the user picks a model
 * in the waiting room so the next launch defaults to it.
 */
export const saveFreebuffModelPreference = (model: string): void => {
  saveSettings({ freebuffModel: model })
}

// ============================================================================
// Custom model persistence
// ============================================================================

/**
 * Load all custom model configs from settings.
 */
export function loadCustomModels(): CustomModelConfig[] {
  return loadSettings().customModels ?? []
}

/**
 * Save an array of custom models to settings (replaces all).
 */
export function saveCustomModels(models: CustomModelConfig[]): void {
  saveSettings({ customModels: models })
}

/**
 * Add a single custom model to settings.
 */
export function addCustomModel(model: CustomModelConfig): void {
  const models = loadCustomModels()
  models.push(model)
  saveCustomModels(models)
}

/**
 * Remove a custom model by its id.
 */
export function removeCustomModel(id: string): void {
  const models = loadCustomModels().filter((m) => m.id !== id)
  saveCustomModels(models)
}

/**
 * Update an existing custom model by id.
 */
export function updateCustomModel(updated: CustomModelConfig): void {
  const models = loadCustomModels().map((m) =>
    m.id === updated.id ? updated : m,
  )
  saveCustomModels(models)
}
