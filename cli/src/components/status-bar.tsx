import { getFreebuffModel } from '@codebuff/common/constants/freebuff-models'
import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'

import { useFreebuffSessionProgress } from '../hooks/use-freebuff-session-progress'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { isCustomModelId, getCustomModelById } from '../state/custom-model-store'

import type { FreebuffSessionResponse } from '../types/freebuff-session'
import type { StatusIndicatorState } from '../utils/status-indicator-state'

/** A small status-bar action button with hover-bold styling. */
const StatusActionButton = ({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Button
      style={{ paddingLeft: 1, paddingRight: 1 }}
      onClick={onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text>
        <span
          fg={theme.secondary}
          attributes={hovered ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {children}
        </span>
      </text>
    </Button>
  )
}

const SHIMMER_INTERVAL_MS = 160

/** Show the "X:XX left" urgency readout under this many ms remaining. */
const COUNTDOWN_VISIBLE_MS = 5 * 60_000

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return 'expiring…'
  const totalSeconds = Math.ceil(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const formatSessionRemaining = (ms: number): string => {
  if (ms <= 0) return 'expiring…'
  if (ms < COUNTDOWN_VISIBLE_MS) return `${formatCountdown(ms)} left`
  const totalMinutes = Math.ceil(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m left`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h left` : `${hours}h ${minutes}m left`
}

interface StatusBarProps {
  timerStartTime: number | null
  isAtBottom: boolean
  scrollToLatest: () => void
  statusIndicatorState: StatusIndicatorState
  onStop?: () => void
  onEndSession?: () => void
  freebuffSession: FreebuffSessionResponse | null
}

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
  onStop,
  onEndSession,
  freebuffSession,
}: StatusBarProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Show timer when actively working (streaming or waiting for response) or paused (ask_user)
  // This uses statusIndicatorState as the single source of truth for "is the LLM working?"
  const shouldShowTimer =
    statusIndicatorState?.kind === 'waiting' ||
    statusIndicatorState?.kind === 'streaming' ||
    statusIndicatorState?.kind === 'paused'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
      setElapsedSeconds(0)
      return
    }

    // When paused, don't update the timer - just keep the frozen value
    if (statusIndicatorState?.kind === 'paused') {
      // Calculate current elapsed time once and freeze it
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
      return
    }

    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [timerStartTime, shouldShowTimer, statusIndicatorState?.kind])

  const selectedModelId = useFreebuffModelStore((state) => state.selectedModel)
  const currentModelId = (freebuffSession?.status === 'active' ? freebuffSession.model : null) || selectedModelId

  const modelDisplayName = React.useMemo(() => {
    if (!currentModelId) return ''
    if (isCustomModelId(currentModelId)) {
      const custom = getCustomModelById(currentModelId)
      return custom ? custom.name : 'Custom Model'
    }
    return getFreebuffModel(currentModelId).displayName
  }, [currentModelId])

  const sessionProgress = useFreebuffSessionProgress(freebuffSession)

  const renderStatusIndicator = () => {
    let content: React.ReactNode = null
    let color = theme.secondary

    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>

      case 'clipboard':
        // Use green color for feedback success messages
        const isFeedbackSuccess =
          statusIndicatorState.message.includes('Feedback sent')
        return (
          <span fg={isFeedbackSuccess ? theme.success : theme.primary}>
            {statusIndicatorState.message}
          </span>
        )

      case 'reconnected':
        return <span fg={theme.success}>Reconnected</span>

      case 'retrying':
        content = <ShimmerText text="retrying..." primaryColor={theme.warning} />
        break

      case 'connecting':
        content = <ShimmerText text="connecting..." />
        break

      case 'waiting':
        content = (
          <ShimmerText
            text="thinking..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )
        break

      case 'streaming':
        content = (
          <ShimmerText
            text="working..."
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )
        break

      case 'paused':
        return null

      case 'idle':
        if (sessionProgress !== null) {
          const isUrgent = sessionProgress.remainingMs < COUNTDOWN_VISIBLE_MS
          color = isUrgent ? theme.warning : theme.secondary
          content = <span>{formatSessionRemaining(sessionProgress.remainingMs)}</span>
        }
        break
    }

    if (!content) return null

    if (modelDisplayName) {
      return (
        <>
          <span fg={color}>{modelDisplayName} · </span>
          {content}
        </>
      )
    }

    return content
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }

    return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()

  // Show gray background when there's status indicator, timer, or when the
  // freebuff session fill is visible (otherwise the fill would float over
  // transparent space).
  const hasContent =
    statusIndicatorContent || elapsedTimeContent || sessionProgress !== null

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        backgroundColor: hasContent ? theme.surface : 'transparent',
      }}
    >
      {sessionProgress !== null && (
        <box
          style={{
            // 用流式占位代替绝对定位，避免背景层盖住右侧按钮点击区域。
            flexShrink: 0,
            width: `${sessionProgress.fraction * 100}%`,
            backgroundColor: theme.surfaceHover,
          }}
        />
      )}
      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
        }}
      >
        <text style={{ wrapMode: 'none' }}>{statusIndicatorContent}</text>
      </box>

      <box style={{ flexShrink: 0 }}>
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToLatest} />}
      </box>

      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
        {onStop &&
          (statusIndicatorState.kind === 'waiting' ||
            statusIndicatorState.kind === 'streaming') && (
            <StatusActionButton onClick={onStop}>■ Esc</StatusActionButton>
          )}
        {onEndSession &&
          statusIndicatorState.kind === 'idle' &&
          freebuffSession?.status === 'active' && (
            <StatusActionButton onClick={onEndSession}>
              ✕ End session
            </StatusActionButton>
          )}
        {sessionProgress !== null &&
          sessionProgress.remainingMs < COUNTDOWN_VISIBLE_MS &&
          statusIndicatorState.kind !== 'idle' && (
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.warning} attributes={TextAttributes.BOLD}>
                {formatCountdown(sessionProgress.remainingMs)}
              </span>
            </text>
          )}
      </box>
    </box>
  )
}
