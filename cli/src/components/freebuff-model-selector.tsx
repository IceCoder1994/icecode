import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from './button'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModelsForAccessTier,
  isFreebuffModelAvailable,
} from '@codebuff/common/constants/freebuff-models'
import { getRateLimitsByModel } from '@codebuff/common/types/freebuff-session'
import {
  CUSTOM_MODEL_ID_PREFIX,
} from '../types/custom-model'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { buildCustomModelFullId, useCustomModelStore } from '../state/custom-model-store'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { getCustomModelById } from '../state/custom-model-store'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  freebuffModelNavigationDirectionForKey,
  nextFreebuffModelId,
} from '../utils/freebuff-model-navigation'

import type { FreebuffModelOption } from '@codebuff/common/constants/freebuff-models'
import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

/**
 * Wrapper around a custom model config that looks like a FreebuffModelOption
 * for rendering in the model selector.
 */
interface CustomModelDisplayOption {
  id: string
  displayName: string
  tagline: string
  availability: 'always' | 'deployment_hours'
  warning?: string
  /** True if this is a custom model entry. */
  isCustom: true
}

/** Possible entry types in the selector. */
type ModelEntry = FreebuffModelOption | CustomModelDisplayOption

function isCustomEntry(entry: ModelEntry): entry is CustomModelDisplayOption {
  return 'isCustom' in entry && entry.isCustom === true
}

/** Build a display option from a custom model config. */
function toCustomDisplayOption(
  id: string,
  name: string,
  modelId: string,
): CustomModelDisplayOption {
  return {
    id,
    displayName: name,
    tagline: modelId,
    availability: 'always',
    isCustom: true,
  }
}

// Section grouping: premium models share one quota pool, unlimited has none.
// Putting the tier on a section header lets each row drop its redundant
// "Premium"/"Unlimited" chip. The shared 0/5 counter lives in the page title
// (rendered by the parent), not the section header — this picker is purely a
// list of choices grouped by tier. Empty sections are filtered so a model set
// with no premium (or no unlimited) entries doesn't render an orphan header.
//
// `label` may be empty: limited-tier users only ever see one section, so the
// "LIMITED" header would just leak the internal tier name without organizing
// anything. Renderer treats an empty label as "no header row".
type Section = {
  key: 'premium' | 'unlimited' | 'limited' | 'custom'
  label: string
  models: readonly ModelEntry[]
}

/**
 * Dual-purpose model picker:
 *   - Pre-chat landing (session 'none'): user hasn't joined any queue. Picking
 *     a model is their explicit commitment to enter — this triggers the POST.
 *   - In-queue switcher (session 'queued'): picking a *different* model moves
 *     the user to the back of that queue (lose place in original). Picking the
 *     model they're already in is a no-op.
 *
 * Keyboard navigation: Tab / arrow keys move the green highlight; Enter (or
 * Space) commits the focused row. Mouse click commits in one step.
 *
 * Layout: rows are grouped into PREMIUM / UNLIMITED sections so the tier is
 * visible without a per-row chip; the shared 0/5 counter sits inside the
 * PREMIUM section header. Names align in a column so taglines line up across
 * rows. On narrow terminals the secondary details (warning / deployment
 * hours) drop onto an indented second line under the row.
 *
 * On short terminals the parent passes `maxHeight`: the row list then lives
 * in a scrollbox capped at that many rows, a scrollbar appears when the
 * models don't all fit, and Tab/arrow navigation keeps the focused row
 * scrolled into view.
 */
interface FreebuffModelSelectorProps {
  /** Max vertical rows the picker may occupy. When the rendered rows exceed
   *  this, the list scrolls (scrollbar shown, focused row kept in view);
   *  otherwise the scrollbox shrinks to fit and no scrollbar appears. */
  maxHeight: number
}

export const FreebuffModelSelector: React.FC<FreebuffModelSelectorProps> = ({
  maxHeight,
}) => {
  const theme = useTheme()
  // contentMaxWidth (not terminalWidth) is the real budget — the parent
  // waiting-room screen wraps this picker in a `maxWidth: contentMaxWidth`
  // box (capped at 80 cols), so a wide terminal doesn't actually let us
  // sprawl the buttons across it.
  const { contentMaxWidth } = useTerminalDimensions()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const setSelectedModel = useFreebuffModelStore((s) => s.setSelectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
  const accessTier =
    session && 'accessTier' in session ? session.accessTier : 'full'
  const now = useNow(60_000)
  const deploymentAvailabilityLabel = useMemo(
    () => getFreebuffDeploymentAvailabilityLabel(new Date(now)),
    [now],
  )
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Keyboard cursor — separate from the actually-selected model so that
  // Tab/arrow navigation can preview without committing. Re-syncs to the
  // selected model whenever the selection changes (after a successful switch
  // or an external selectedModel update).
  const [focusedId, setFocusedId] = useState<string>(selectedModel)
  const availableModels = useMemo(
    () => getFreebuffModelsForAccessTier(accessTier),
    [accessTier],
  )
  // Limited tier only ever surfaces one model, so a comparative tagline
  // ("Most efficient") reads as filler. Hide it; the warning (data-collection)
  // is the row's real content.
  const showTagline = accessTier !== 'limited'
  // Load custom models from the store for display.
  const customModels = useCustomModelStore((s) => s.models)
  useEffect(() => {
    useCustomModelStore.getState().load()
  }, [])
  const customModelEntries = useMemo(
    () =>
      customModels.map((cm) =>
        toCustomDisplayOption(buildCustomModelFullId(cm.id), cm.name, cm.modelId),
      ),
    [customModels],
  )
  // Only show custom model IDs for navigation — built-in models require the
  // Codebuff backend which is unavailable in offline/custom-model mode.
  const allModelIds = useMemo(
    () => customModelEntries.map((m) => m.id),
    [customModelEntries],
  )
  // Only show CUSTOM section — built-in models (premium/unlimited/limited)
  // require the Codebuff backend which is unavailable in offline mode.
  const sections = useMemo(() => {
    return customModelEntries.length > 0
      ? [
          {
            key: 'custom',
            label: 'CUSTOM',
            models: customModelEntries,
          } satisfies Section,
        ]
      : []
  }, [customModelEntries])
  useEffect(() => {
    setFocusedId(
      allModelIds.length > 0
        ? allModelIds.includes(selectedModel)
          ? selectedModel
          : allModelIds[0]!
        : selectedModel,
    )
  }, [allModelIds, selectedModel])

  useEffect(() => {
    // Landing-screen safety net: only applies when there are selectable
    // models and the current selection isn't among them. Skips entirely
    // when no models are available (offline mode with no custom models).
    if (allModelIds.length === 0) return
    if (
      (session?.status === 'none' || !session) &&
      !selectedModel.startsWith(CUSTOM_MODEL_ID_PREFIX) &&
      (!allModelIds.includes(selectedModel) ||
        !isFreebuffModelAvailable(selectedModel, new Date(now)))
    ) {
      setSelectedModel(allModelIds[0] ?? FALLBACK_FREEBUFF_MODEL_ID)
    }
  }, [allModelIds, now, selectedModel, session, setSelectedModel])

  const committedModelId = session?.status === 'queued' ? session.model : null
  const rateLimitsByModel = getRateLimitsByModel(session)

  const BUTTON_CHROME = 4 // 2 border + 2 padding
  const NAME_GAP = 2 // spaces between name column and details column

  // Two-column layout: a fixed name column (padded to the longest displayName
  // across all rows) followed by a details column (tagline · warning ·
  // deployment-hours/closed). Falls back to single-column mode on narrow
  // terminals where the secondary details spill to an indented second line.
  const { wrapDetails, buttonOuterWidth, nameColumnWidth } = useMemo(() => {
    const nameLen = (m: FreebuffModelOption) => m.displayName.length
    const maxNameLen = Math.max(...availableModels.map(nameLen))

    const detailsParts = (model: FreebuffModelOption): number[] => {
      const parts: number[] = []
      if (showTagline) parts.push(model.tagline.length)
      if (model.warning) parts.push(model.warning.length)
      if (model.availability === 'deployment_hours') {
        parts.push(deploymentAvailabilityLabel.length)
      }
      return parts
    }

    const joinedLen = (parts: number[]): number =>
      parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 3 // " · "

    const oneLineLen = (model: FreebuffModelOption): number =>
      2 /* indicator + space */ +
      maxNameLen +
      NAME_GAP +
      joinedLen(detailsParts(model))

    const maxOneLineOuter =
      Math.max(...availableModels.map(oneLineLen)) + BUTTON_CHROME
    if (maxOneLineOuter <= contentMaxWidth) {
      return {
        wrapDetails: false,
        buttonOuterWidth: maxOneLineOuter,
        nameColumnWidth: maxNameLen,
      }
    }

    // Narrow: line 1 = "indicator name · tagline", line 2 (if any) =
    // "  warning · hours". Compute the max of both so all buttons stay the
    // same width. When taglines are hidden (limited tier), line 1 is just
    // "indicator name" with no separator.
    const labelLineLen = (m: FreebuffModelOption) =>
      2 + m.displayName.length + (showTagline ? 3 + m.tagline.length : 0)
    const detailsLineLen = (m: FreebuffModelOption) => {
      const parts: number[] = []
      if (m.warning) parts.push(m.warning.length)
      if (m.availability === 'deployment_hours') {
        parts.push(deploymentAvailabilityLabel.length)
      }
      return parts.length === 0 ? 0 : 2 /* indent */ + joinedLen(parts)
    }
    const maxTwoLineInner = Math.max(
      ...availableModels.map((m) =>
        Math.max(labelLineLen(m), detailsLineLen(m)),
      ),
    )
    return {
      wrapDetails: true,
      buttonOuterWidth: Math.min(
        maxTwoLineInner + BUTTON_CHROME,
        contentMaxWidth,
      ),
      nameColumnWidth: maxNameLen,
    }
  }, [availableModels, contentMaxWidth, deploymentAvailabilityLabel, showTagline])

  // Flattened vertical layout: every model's top offset + height within the
  // scroll content, plus the total. Mirrors the JSX below exactly so the
  // auto-scroll math lands the focused row precisely. A button is 2 border
  // rows + its text line(s); in wrapDetails mode a row with a warning or
  // deployment-hours label spills its details onto a second indented line.
  // Headers add 1 row; sections after the first add 1 row of marginTop.
  const SECTION_GAP = 1
  const { totalHeight, offsetById } = useMemo(() => {
    const offsets: Record<string, { top: number; height: number }> = {}
    let y = 0
    sections.forEach((section, idx) => {
      if (idx > 0) y += SECTION_GAP
      if (section.label) y += 1
      section.models.forEach((m) => {
        const wraps =
          wrapDetails && (!!m.warning || m.availability === 'deployment_hours')
        const h = 2 /* borders */ + (wraps ? 2 : 1)
        offsets[m.id] = { top: y, height: h }
        y += h
      })
    })
    return { totalHeight: y, offsetById: offsets }
  }, [sections, wrapDetails])

  const needsScroll = totalHeight > maxHeight
  const scrollViewportHeight = Math.max(1, Math.min(totalHeight, maxHeight))
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  // Keep the keyboard-focused row inside the viewport as the user Tabs/arrows
  // through a list taller than the available rows.
  useEffect(() => {
    const sb = scrollRef.current
    if (!sb || !needsScroll) return
    const entry = offsetById[focusedId]
    if (!entry) return
    const viewportHeight = sb.viewport.height
    const currentScroll = sb.scrollTop
    if (entry.top < currentScroll) {
      sb.scrollTop = entry.top
    } else if (entry.top + entry.height > currentScroll + viewportHeight) {
      sb.scrollTop = entry.top + entry.height - viewportHeight
    }
  }, [focusedId, offsetById, needsScroll])

  const isJoinable = useCallback(
    (modelId: string) => {
      if (!isFreebuffModelAvailable(modelId, new Date(now))) return false
      const rateLimit = rateLimitsByModel?.[modelId]
      return !rateLimit || rateLimit.recentCount < rateLimit.limit
    },
    [now, rateLimitsByModel],
  )

  /** Pick a built-in model through the waiting-room queue. */
  const pickBuiltIn = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === committedModelId) return
      if (!isJoinable(modelId)) return
      setPending(modelId)
      joinFreebuffQueue(modelId).finally(() => setPending(null))
    },
    [pending, committedModelId, isJoinable],
  )

  /** Pick a custom model — skip the queue entirely and go straight to chat. */
  const pickCustom = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === committedModelId) return
      setPending(modelId)
      useFreebuffModelStore.getState().setSelectedModel(modelId)
      // Directly set the session to 'active' so app.tsx renders <Chat>.
      useFreebuffSessionStore.getState().setSession({
        status: 'active',
        instanceId: 'custom',
        model: modelId,
      })
      setFocusedId(modelId)
      setPending(null)
    },
    [pending, committedModelId],
  )

  const pick = useCallback(
    (modelId: string) => {
      if (modelId.startsWith(CUSTOM_MODEL_ID_PREFIX)) {
        return pickCustom(modelId)
      }
      return pickBuiltIn(modelId)
    },
    [pickBuiltIn, pickCustom],
  )

  // Tab / Shift+Tab and arrow keys move the focus highlight only; Enter or
  // Space commits the focused row. Two-step navigation lets the user preview
  // the highlight before committing.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        const direction = freebuffModelNavigationDirectionForKey(key)
        const isCommit =
          name === 'return' || name === 'enter' || name === 'space'
        if (isCommit) {
          if (isJoinable(focusedId) && focusedId !== committedModelId) {
            key.preventDefault?.()
            key.stopPropagation?.()
            pick(focusedId)
          }
          return
        }
        if (!direction) return
        const targetId = nextFreebuffModelId({
          modelIds: allModelIds,
          focusedId,
          direction,
        })
        if (targetId) {
          key.preventDefault?.()
          key.stopPropagation?.()
          setFocusedId(targetId)
        }
      },
      [
        pending,
        pick,
        focusedId,
        committedModelId,
        isJoinable,
        allModelIds,
      ],
    ),
  )

  const renderModelButton = (model: ModelEntry) => {
    const isCustom = isCustomEntry(model)
    // Single visual state: the focused row IS the highlight. The user's
    // saved/committed pick is not shown separately — it just sets where
    // focus lands when the picker opens. Pressing Enter on the focused
    // row commits it.
    const isHovered = hoveredId === model.id
    const isFocused = focusedId === model.id
    const canJoin =
      isCustom || // custom models are always joinable
      isJoinable(model.id)
    // Clickable whenever picking would actually do something — i.e.
    // anything except re-picking the queue we're already in.
    const interactable =
      !pending && canJoin && model.id !== committedModelId

    // Focused row: green border + arrow indicator + bold name. The name
    // itself stays the normal foreground color so it doesn't shout — the
    // border and arrow do the highlighting. Off-focus rows are default.
    const indicator = isFocused ? '›' : ' '
    const fgColor = canJoin ? theme.foreground : theme.muted
    const mutedColor = theme.muted
    const warningColor = theme.secondary
    // Custom models get a bright accent color for the tagline.
    const taglineColor = isCustom ? theme.primary : mutedColor

    const borderColor = isFocused
      ? theme.primary
      : isHovered
        ? theme.foreground
        : theme.border

    // Deployment-hours rows show "until 5pm PT" while open and "opens 9am ET"
    // while closed (the label flips inside getFreebuffDeploymentAvailabilityLabel),
    // so the same string carries both the in-hours and out-of-hours signals
    // without a separate "Closed" chip. Greyed-out fgColor handles the rest.
    const hasHours =
      !isCustom && (model as FreebuffModelOption).availability === 'deployment_hours'
    const hasWarning =
      !isCustom && !!(model as FreebuffModelOption).warning

    // Spaces inside <span>s render verbatim, so we hand-pad the name to align
    // taglines into a column. nameColumnWidth is the longest name across all
    // rows, so the diff is >= 0; +NAME_GAP guarantees breathing room even on
    // the widest row.
    const namePadding = ' '.repeat(
      Math.max(0, nameColumnWidth - model.displayName.length + NAME_GAP),
    )

    return (
      <Button
        key={model.id}
        onClick={() => {
          setFocusedId(model.id)
          if (canJoin) pick(model.id)
        }}
        onMouseOver={() => interactable && setHoveredId(model.id)}
        onMouseOut={() =>
          setHoveredId((curr) => (curr === model.id ? null : curr))
        }
        style={{
          borderStyle: 'single',
          borderColor,
          paddingLeft: 1,
          paddingRight: 1,
          width: buttonOuterWidth,
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text>
          <span fg={fgColor}>{indicator} </span>
          <span
            fg={fgColor}
            attributes={isFocused ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            {model.displayName}
          </span>
          {wrapDetails ? (
            <span fg={taglineColor}> · {model.tagline}</span>
          ) : (
            <>
              <span fg={taglineColor}>{namePadding + model.tagline}</span>
              {hasWarning && (
                <span fg={warningColor}> · {model.warning}</span>
              )}
              {hasHours && (
                <span fg={mutedColor}> · {deploymentAvailabilityLabel}</span>
              )}
            </>
          )}
        </text>
        {wrapDetails && (hasWarning || hasHours) && (
          <text>
            <span> </span>
            {hasWarning && <span fg={warningColor}>{model.warning}</span>}
            {hasWarning && hasHours && <span fg={mutedColor}> · </span>}
            {hasHours && (
              <span fg={mutedColor}>{deploymentAvailabilityLabel}</span>
            )}
          </text>
        )}
      </Button>
    )
  }

  const sectionsContent = sections.map((section, sectionIdx) => (
    <box
      key={section.key}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        marginTop: sectionIdx === 0 ? 0 : SECTION_GAP,
      }}
    >
      {section.label && (
        <text style={{ fg: theme.muted }}>{section.label}</text>
      )}
      {section.models.map(renderModelButton)}
    </box>
  ))

  // Scrollbox clamped to the rows the parent can spare. When everything fits
  // it shrinks to the content height and no scrollbar shows, so tall
  // terminals look exactly like a plain column.
  return (
    <scrollbox
      ref={scrollRef}
      scrollX={false}
      scrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        visible: needsScroll,
        trackOptions: { width: 1 },
      }}
      style={{
        height: scrollViewportHeight,
        // A scrollbox stretches to fill its parent, which would left-align
        // the picker; pin it to the button column width (plus a gutter for
        // the scrollbar) so the landing block stays content-sized and the
        // parent can center it as it did before this was a scrollbox.
        width: buttonOuterWidth + (needsScroll ? 1 : 0),
        flexShrink: 0,
        rootOptions: {
          flexDirection: 'row',
          backgroundColor: 'transparent',
        },
        wrapperOptions: {
          border: false,
          backgroundColor: 'transparent',
          flexDirection: 'column',
        },
        contentOptions: {
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          backgroundColor: 'transparent',
        },
      }}
    >
      {sectionsContent}
    </scrollbox>
  )
}
