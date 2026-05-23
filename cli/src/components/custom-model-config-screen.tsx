import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { TextInput } from './text-input'
import { useCustomModelStore, buildCustomModelFullId } from '../state/custom-model-store'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTheme } from '../hooks/use-theme'
import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'

import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import type { CustomModelConfig } from '../types/custom-model'
import type { KeyEvent } from '@opentui/core'

interface CustomModelConfigScreenProps {
  onClose: () => void
}

/**
 * Interactive screen for managing custom model configurations.
 * Supports adding new models and editing/deleting existing ones.
 *
 * Uses inline TextInput fields for each field; Tab/Shift+Tab cycles
 * between fields, Enter on the last field saves, Escape cancels.
 */
export  const CustomModelConfigScreen: React.FC<CustomModelConfigScreenProps> = ({
  onClose,
}) => {
  const theme = useTheme()
  const { contentMaxWidth } = useTerminalDimensions()
  const { models, add, remove, update } = useCustomModelStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CustomModelConfig>({
    id: '',
    name: '',
    baseUrl: '',
    apiKey: '',
    modelId: '',
  })
  // Which field index is focused within the form (0-3 for text fields, 4 for
  // the Save button; -1 = none / form closed)
  const NUM_TEXT_FIELDS = 4
  const SAVE_BUTTON_INDEX = 4
  const TOTAL_FIELDS = 5
  const [focusedField, setFocusedField] = useState(-1)
  const [validationError, setValidationError] = useState<string | null>(null)

  const startNew = useCallback(() => {
    setEditingId('__new__')
    setEditForm({
      id: crypto.randomUUID(),
      name: '',
      baseUrl: '',
      apiKey: '',
      modelId: '',
    })
    setFocusedField(0)
  }, [])

  const startEdit = useCallback((model: CustomModelConfig) => {
    setEditingId(model.id)
    setEditForm({ ...model })
    setFocusedField(0)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setFocusedField(-1)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editForm.name.trim() || !editForm.baseUrl.trim() || !editForm.apiKey.trim() || !editForm.modelId.trim()) {
      setValidationError('All fields are required.')
      return
    }
    setValidationError(null)
    if (editingId === '__new__') {
      add({ ...editForm, id: crypto.randomUUID() })
    } else if (editingId) {
      update(editForm)
    }
    setEditingId(null)
    setFocusedField(-1)
  }, [editForm, editingId, add, update])

  const handleRemove = useCallback((id: string) => {
    remove(id)
    if (editingId === id) {
      setEditingId(null)
      setFocusedField(-1)
    }
  }, [remove, editingId])

  const setField = useCallback(<K extends keyof CustomModelConfig>(
    key: K,
    value: CustomModelConfig[K],
  ) => {
    setEditForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Navigate fields with Tab/Shift+Tab. Enter saves, Escape cancels.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!editingId) return false
        const name = key.name ?? ''

        // Escape cancels
        if (name === 'escape' || name === 'esc') {
          key.preventDefault?.()
          cancelEdit()
          return
        }

        // Enter / Return — save the form only when the Save button is
        // focused (index >= 4) or no field is focused (-1). TextInput's
        // handler fires first (LIFO registration) for field advancement,
        // so this guard prevents a double-save.
        if (name === 'return' || name === 'enter') {
          key.preventDefault?.()
          if (focusedField === -1 || focusedField >= SAVE_BUTTON_INDEX) {
            saveEdit()
          }
          return
        }

        // Tab/Shift+Tab cycle through fields
        if (name === 'tab') {
          key.preventDefault?.()
          setFocusedField((prev) => {
            if (key.shift) {
              return prev <= 0 ? TOTAL_FIELDS - 1 : prev - 1
            }
            return prev >= TOTAL_FIELDS - 1 ? 0 : prev + 1
          })
          return
        }

        return false
      },
      [editingId, cancelEdit, saveEdit, focusedField],
    ),
  )

  const isEditing = editingId !== null

  const fields: Array<{
    key: keyof CustomModelConfig
    label: string
    placeholder: string
    secret?: boolean
  }> = [
    { key: 'name', label: 'Name', placeholder: 'My GPT-4o' },
    { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.openai.com/v1' },
    { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true },
    { key: 'modelId', label: 'Model ID', placeholder: 'gpt-4o' },
  ]

  return (
    <box
      style={{
        flexDirection: 'column',
        width: '100%',
        backgroundColor: theme.background,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {/* Header */}
      <text
        style={{ fg: theme.foreground, marginTop: 0, marginBottom: 0 }}
        attributes={TextAttributes.BOLD}
      >
        Custom API Models Configuration
      </text>
      <text style={{ fg: theme.muted, marginBottom: 1, wrapMode: 'word' }}>
        Add your own OpenAI-compatible API endpoints.
        API keys are stored locally and never sent to Codebuff.
      </text>

      {/* Form (when adding/editing) */}
      {isEditing && (
        <box
          style={{
            flexDirection: 'column',
            gap: 0,
            marginTop: 0,
            marginBottom: 1,
            borderStyle: 'single',
            borderColor: theme.primary,
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            width: Math.min(contentMaxWidth, 76),
          }}
          border={['top', 'bottom', 'left', 'right']}
        >
          <text style={{ fg: theme.primary, marginBottom: 0 }} attributes={TextAttributes.BOLD}>
            {editingId === '__new__' ? 'Add New Model' : 'Edit Model'}
          </text>

          {/* Validation error */}
          {validationError && (
            <text style={{ fg: theme.secondary, marginBottom: 0 }}>
              ⚠ {validationError}
            </text>
          )}

          {/* Text fields */}
          {fields.map((field, idx) => (
            <FieldWithLabel
              key={field.key}
              label={field.label}
              value={editForm[field.key] as string}
              onChange={(v) => {
                setField(field.key, v as never)
                setValidationError(null) // Clear error on edit
              }}
              placeholder={field.placeholder}
              secret={field.secret}
              focused={focusedField === idx}
              onFocus={() => setFocusedField(idx)}
              onSubmit={() => {
                setFocusedField(
                  idx < NUM_TEXT_FIELDS - 1
                    ? idx + 1
                    : SAVE_BUTTON_INDEX,
                )
              }}
              theme={theme}
            />
          ))}

          {/* Action buttons */}
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 0, marginBottom: 0 }}>
            <Button
              onClick={saveEdit}
              style={{ paddingLeft: 1, paddingRight: 1 }}
            >
              <text
                style={{
                  fg: focusedField === SAVE_BUTTON_INDEX ? theme.primary : theme.primary,
                  bg: focusedField === SAVE_BUTTON_INDEX ? theme.muted : undefined,
                }}
                attributes={TextAttributes.BOLD}
              >
                [{editingId === '__new__' ? 'Add Model' : 'Save'}]
              </text>
            </Button>
            <Button
              onClick={cancelEdit}
              style={{ paddingLeft: 1, paddingRight: 1 }}
            >
              <text style={{ fg: theme.muted }}>
                [Cancel]
              </text>
            </Button>
          </box>
        </box>
      )}

      {/* Model list */}
      {models.length === 0 && !isEditing && (
        <text style={{ fg: theme.muted, marginTop: 0, marginBottom: 1 }}>
          No custom models configured yet. Click "Add Model" to get started.
        </text>
      )}

      {models.length > 0 && (
        <box style={{ flexDirection: 'column', gap: 0, marginTop: 0 }}>
          <text style={{ fg: theme.muted, marginBottom: 0 }} attributes={TextAttributes.BOLD}>
            Configured Models:
          </text>
          {models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              onEdit={() => startEdit(model)}
              onDelete={() => handleRemove(model.id)}
              onSelect={() => {
                const fullId = buildCustomModelFullId(model.id)
                useFreebuffModelStore.getState().setSelectedModel(fullId)
                useFreebuffSessionStore.getState().setSession({
                  status: 'active' as const,
                  instanceId: 'custom',
                  model: fullId,
                } as any)
              }}
              theme={theme}
            />
          ))}
        </box>
      )}

      {/* Add new button */}
      {!isEditing && (
        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, marginBottom: 0 }}>
          <Button
            onClick={startNew}
            style={{ paddingLeft: 1, paddingRight: 1 }}
            border={['top', 'bottom', 'left', 'right']}
            borderStyle="single"
            borderColor={theme.primary}
          >
            <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
              + Add Model
            </text>
          </Button>
          <Button
            onClick={onClose}
            style={{ paddingLeft: 1, paddingRight: 1 }}
            border={['top', 'bottom', 'left', 'right']}
            borderStyle="single"
            borderColor={theme.muted}
          >
            <text style={{ fg: theme.muted }}>
              Close
            </text>
          </Button>
        </box>
      )}
    </box>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldWithLabelProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  secret?: boolean
  focused: boolean
  onFocus: () => void
  onSubmit: () => void
  theme: ReturnType<typeof import('../hooks/use-theme').useTheme>
}

const FieldWithLabel: React.FC<FieldWithLabelProps> = ({
  label,
  value,
  onChange,
  placeholder,
  secret,
  focused,
  onFocus,
  onSubmit,
  theme,
}) => {
  return (
    <box style={{ flexDirection: 'row', marginBottom: 0, alignItems: 'center' }}>
      <box style={{ width: 12 }}>
        <text style={{ fg: theme.muted }}>
          {label}:
        </text>
      </box>
      <box style={{ flex: 1 }}>
        <TextInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          secret={secret}
          focused={focused}
          onFocus={onFocus}
          onSubmit={onSubmit}
        />
      </box>
    </box>
  )
}

interface ModelRowProps {
  model: CustomModelConfig
  onEdit: () => void
  onDelete: () => void
  onSelect?: () => void
  theme: ReturnType<typeof import('../hooks/use-theme').useTheme>
}

const ModelRow: React.FC<ModelRowProps> = ({ model, onEdit, onDelete, onSelect, theme }) => {
  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 1,
        alignItems: 'center',
        marginBottom: 0,
      }}
    >
      <text style={{ fg: theme.foreground, width: 20 }} attributes={TextAttributes.BOLD} wrapMode="truncate">
        {model.name}
      </text>
      <text style={{ fg: theme.muted, flex: 1 }} wrapMode="truncate">
        ({model.modelId})
      </text>
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <Button
          onClick={onEdit}
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          <text style={{ fg: theme.muted }}>[Edit]</text>
        </Button>
        <Button
          onClick={onDelete}
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          <text style={{ fg: theme.secondary }}>[Del]</text>
        </Button>
        <Button
          onClick={onSelect}
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
            [Select]
          </text>
        </Button>
      </box>
    </box>
  )
}
