/**
 * Simple single-line text input for form fields.
 *
 * Lightweight wrapper around basic keyboard handling — no word-wrap, no
 * scrollbar, no multi-line. Uses useKeyboard directly so multiple instances
 * can coexist; only the currently-focused one processes keys.
 *
 * Paste is handled through OpenTUI's built-in PasteEvent (bracketed paste
 * mode), which works on all modern terminals. Ctrl+V and Shift+Insert are
 * also handled by reading the system clipboard via execSync as a fallback
 * for terminals that don't support bracketed paste.
 */

import { useAppContext, useKeyboard } from '@opentui/react'
import { execSync } from 'child_process'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { InputCursor } from './input-cursor'
import { useTheme } from '../hooks/use-theme'

import type { KeyEvent, PasteEvent } from '@opentui/core'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  secret?: boolean
  focused: boolean
  onFocus: () => void
  onSubmit?: () => void
}

/**
 * Read the system clipboard synchronously via platform-specific shell command.
 * Fallback used only when bracketed paste is not available.
 */
function readClipboard(): string {
  try {
    if (process.platform === 'win32') {
      return execSync(
        'powershell -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard"',
        { timeout: 2000, encoding: 'utf-8' },
      )
        .toString()
        .replace(/\r?\n$/, '')
    }
    if (process.platform === 'darwin') {
      return execSync('pbpaste', { timeout: 2000, encoding: 'utf-8' })
        .toString()
        .replace(/\r?\n$/, '')
    }
    // Linux — try xclip first, fall back to xsel
    try {
      return execSync('xclip -o -selection clipboard -l 1', {
        timeout: 2000,
        encoding: 'utf-8',
      })
        .toString()
        .replace(/\r?\n$/, '')
    } catch {
      return execSync('xsel --clipboard --output', {
        timeout: 2000,
        encoding: 'utf-8',
      })
        .toString()
        .replace(/\r?\n$/, '')
    }
  } catch {
    return ''
  }
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder = '',
  secret = false,
  focused,
  onFocus,
  onSubmit,
}) => {
  const theme = useTheme()
  const { keyHandler } = useAppContext()
  const [cursorPos, setCursorPos] = useState(value.length)
  const cursorPosRef = useRef(cursorPos)
  cursorPosRef.current = cursorPos
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const displayValue = secret ? '•'.repeat(value.length) : value
  const isEmpty = value.length === 0
  const showPlaceholder = isEmpty && placeholder.length > 0
  const text = showPlaceholder ? placeholder : displayValue
  const clampedCursor = Math.min(cursorPos, text.length)

  // Keep cursor clamped to value length when value changes externally
  useEffect(() => {
    setCursorPos((p) => Math.min(p, value.length))
  }, [value])

  // Insert text at the current cursor position
  const insertAtCursor = useCallback(
    (textToInsert: string) => {
      const pos = cursorPosRef.current
      const newVal = value.slice(0, pos) + textToInsert + value.slice(pos)
      onChange(newVal)
      setCursorPos(pos + textToInsert.length)
    },
    [value, onChange],
  )

  // Subscribe to OpenTUI's built-in paste event (bracketed paste mode).
  // This is the primary paste mechanism — it fires when the user pastes
  // via any terminal paste method (right-click, Ctrl+V, Shift+Insert)
  // on terminals that support bracketed paste (all modern terminals).
  useEffect(() => {
    if (!keyHandler) return

    const handler = (event: PasteEvent) => {
      if (!focusedRef.current) return
      const decoder = new TextDecoder()
      const text = decoder.decode(event.bytes)
      if (text) {
        // Strip newlines for single-line input
        insertAtCursor(text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
      }
    }

    keyHandler.on('paste', handler)
    return () => {
      keyHandler.off('paste', handler)
    }
  }, [keyHandler, insertAtCursor])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!focused) return

        const name = key.name ?? ''

        // Escape — let parent handle form cancellation
        if (name === 'escape' || name === 'esc') {
          return false
        }

        // Enter / Return — submit the field
        if (name === 'return' || name === 'enter') {
          key.preventDefault?.()
          onSubmit?.()
          return
        }

        // Tab — let parent handle field navigation
        if (name === 'tab') return false

        // Left arrow
        if (name === 'left') {
          key.preventDefault?.()
          setCursorPos((p) => Math.max(0, p - 1))
          return
        }

        // Right arrow
        if (name === 'right') {
          key.preventDefault?.()
          setCursorPos((p) => Math.min(text.length, p + 1))
          return
        }

        // Home
        if (name === 'home') {
          key.preventDefault?.()
          setCursorPos(0)
          return
        }

        // End
        if (name === 'end') {
          key.preventDefault?.()
          setCursorPos(text.length)
          return
        }

        // Backspace
        if (name === 'backspace') {
          key.preventDefault?.()
          if (cursorPosRef.current > 0) {
            const pos = cursorPosRef.current
            const newVal = value.slice(0, pos - 1) + value.slice(pos)
            onChange(newVal)
            setCursorPos(pos - 1)
          }
          return
        }

        // Delete
        if (name === 'delete') {
          key.preventDefault?.()
          const pos = cursorPosRef.current
          if (pos < value.length) {
            const newVal = value.slice(0, pos) + value.slice(pos + 1)
            onChange(newVal)
          }
          return
        }

        // Ctrl+V / Shift+Insert — read clipboard directly (fallback for
        // terminals without bracketed paste support). On most modern
        // terminals the PasteEvent handler above already caught this.
        if (
          (key.ctrl && (key.sequence === 'v' || name === 'v')) ||
          (key.shift && name === 'insert')
        ) {
          key.preventDefault?.()
          const clipboard = readClipboard()
          if (clipboard) {
            insertAtCursor(
              clipboard.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim(),
            )
          }
          return
        }

        // Select all (Ctrl+A) — move cursor to end
        if (key.ctrl && (key.sequence === 'a' || name === 'a')) {
          key.preventDefault?.()
          setCursorPos(value.length)
          return
        }

        // Printable characters (including space)
        if (key.sequence && key.sequence.length >= 1 && !key.ctrl && !key.meta && !key.option) {
          key.preventDefault?.()
          const pos = cursorPosRef.current
          const newVal = value.slice(0, pos) + key.sequence + value.slice(pos)
          onChange(newVal)
          setCursorPos(pos + key.sequence.length)
          return
        }
      },
      [focused, value, onChange, onSubmit, text.length, insertAtCursor],
    ),
  )

  const beforeCursor = text.slice(0, clampedCursor)
  const afterCursor = text.slice(clampedCursor)
  const textColor = showPlaceholder ? theme.muted : theme.foreground
  const borderColor = focused ? theme.primary : theme.muted

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderStyle: 'single',
        borderColor,
        paddingLeft: 1,
        paddingRight: 1,
      }}
      onMouseDown={() => onFocus()}
    >
      <text style={{ fg: textColor }}>
        {focused ? (
          <>
            {beforeCursor}
            <InputCursor
              visible={true}
              focused={true}
              shouldBlink={true}
              color={theme.info}
            />
            {afterCursor.length > 0 ? afterCursor : ' '}
          </>
        ) : (
          <>{text || ' '}</>
        )}
      </text>
    </box>
  )
}
