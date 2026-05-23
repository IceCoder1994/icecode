import { create } from 'zustand'

import {
  loadCustomModels,
  saveCustomModels,
} from '../utils/settings'

import { CUSTOM_MODEL_ID_PREFIX } from '../types/custom-model'
import type { CustomModelConfig } from '../types/custom-model'

interface CustomModelStore {
  /** All configured custom models. */
  models: CustomModelConfig[]
  /** Load models from persisted settings. */
  load: () => void
  /** Add a new custom model. */
  add: (model: CustomModelConfig) => void
  /** Remove a custom model by id. */
  remove: (id: string) => void
  /** Update an existing custom model. */
  update: (model: CustomModelConfig) => void
  /** Find a custom model by id. */
  getById: (id: string) => CustomModelConfig | undefined
}

export const useCustomModelStore = create<CustomModelStore>((set, get) => ({
  models: [],
  load: () => {
    const models = loadCustomModels()
    set({ models })
  },
  add: (model) => {
    const models = [...get().models, model]
    saveCustomModels(models)
    set({ models })
  },
  remove: (id) => {
    const models = get().models.filter((m) => m.id !== id)
    saveCustomModels(models)
    set({ models })
  },
  update: (model) => {
    const models = get().models.map((m) =>
      m.id === model.id ? model : m,
    )
    saveCustomModels(models)
    set({ models })
  },
  getById: (id) => {
    return get().models.find((m) => m.id === id)
  },
}))

/**
 * Check if a model ID refers to a custom model (prefixed with 'custom/').
 */
export function isCustomModelId(id: string): boolean {
  return id.startsWith(CUSTOM_MODEL_ID_PREFIX)
}

/**
 * Get the custom model config by its full ID (e.g. 'custom/abc-123').
 */
export function getCustomModelById(id: string): CustomModelConfig | undefined {
  if (!isCustomModelId(id)) return undefined
  // Strip prefix to get the raw UUID
  const rawId = id.slice(CUSTOM_MODEL_ID_PREFIX.length)
  return useCustomModelStore.getState().models.find((m) => m.id === rawId)
}

/**
 * Build the full display id for a custom model (used in the selector).
 */
export function buildCustomModelFullId(rawId: string): string {
  return `${CUSTOM_MODEL_ID_PREFIX}${rawId}`
}
