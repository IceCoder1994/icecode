import React, { useCallback, useState } from 'react'

import { Button } from './button'
import { CustomModelConfigScreen } from './custom-model-config-screen'
import { useTheme } from '../hooks/use-theme'
import { useCustomModelStore, buildCustomModelFullId } from '../state/custom-model-store'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { TextAttributes } from '@opentui/core'

import type { CustomModelConfig } from '../types/custom-model'

type CustomModelManagerMode = 'waiting_room' | 'config'

interface CustomModelManagerProps {
  onClose: () => void
}

/**
 * Manages custom model configuration from the waiting room.
 * In waiting_room mode, shows the model list with [Select] buttons.
 * Clicking [Select] immediately starts a conversation with that model.
 */
export const CustomModelManager: React.FC<CustomModelManagerProps> = ({
  onClose,
}) => {
  const theme = useTheme()
  const { models, load } = useCustomModelStore()
  const [mode, setMode] = useState<CustomModelManagerMode>('waiting_room')

  // Load models on mount
  React.useEffect(() => {
    load()
  }, [load])

  /** Select a custom model and start the conversation. */
  const selectModel = useCallback((model: CustomModelConfig) => {
    const fullId = buildCustomModelFullId(model.id)
    useFreebuffModelStore.getState().setSelectedModel(fullId)
    useFreebuffSessionStore.getState().setSession({
      status: 'active' as const,
      instanceId: 'custom',
      model: fullId,
    } as any)
  }, [])

  if (mode === 'config') {
    return (
      <CustomModelConfigScreen
        onClose={() => setMode('waiting_room')}
      />
    )
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        width: '100%',
      }}
    >
      {models.length === 0 ? (
        <text style={{ fg: theme.muted, marginTop: 0, wrapMode: 'word' }}>
          <span fg={theme.secondary}>⚡</span>{' '}
          Skip the queue —{' '}
          <span
            fg={theme.primary}
            attributes={TextAttributes.BOLD}
          >
            configure your own API key
          </span>{' '}
          to use your own LLM provider.
        </text>
      ) : (
        <box style={{ flexDirection: 'column', gap: 0, marginTop: 0, width: '100%' }}>
          <text style={{ fg: theme.muted, marginBottom: 0 }} attributes={TextAttributes.BOLD}>
            Your Custom Models:
          </text>
          {(() => {
            return models.map((model) => {
              return (
                <box
                  key={model.id}
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
                  <Button
                    onClick={() => selectModel(model)}
                    style={{ paddingLeft: 1, paddingRight: 1 }}
                  >
                    <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
                      [Select]
                    </text>
                  </Button>
                </box>
              )
            })
          })()}
        </box>
      )}
      <Button
        onClick={() => setMode('config')}
        style={{ paddingLeft: 1, paddingRight: 1, marginTop: 1 }}
        border={['top', 'bottom', 'left', 'right']}
        borderStyle="single"
        borderColor={theme.primary}
      >
        <text style={{ fg: theme.primary }} attributes={TextAttributes.BOLD}>
          {models.length > 0 ? 'Manage →' : 'Configure →'}
        </text>
      </Button>
    </box>
  )
}
