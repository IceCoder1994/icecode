import { describe, expect, test } from 'bun:test'

import { additionalSystemPrompts } from '../system-prompt/prompts'

describe('additionalSystemPrompts', () => {
  test('/init prompt uses AGENTS.md and not deprecated root knowledge.md', () => {
    const initPrompt = additionalSystemPrompts['/init']

    expect(initPrompt).toContain('`AGENTS.md`')
    expect(initPrompt).not.toContain('`knowledge.md` file in the project root')
    expect(initPrompt).not.toContain('create/update `knowledge.md`')
  })

  test('init alias matches /init prompt', () => {
    expect(additionalSystemPrompts.init).toBe(additionalSystemPrompts['/init'])
  })
})
