import { describe, expect, test } from 'bun:test'

import {
  KNOWLEDGE_FILE_NAMES,
  isKnowledgeFile,
  selectHighestPriorityKnowledgeFile,
  selectKnowledgeFilePaths,
} from '../run-state'

describe('KNOWLEDGE_FILE_NAMES', () => {
  test('contains expected file names in priority order', () => {
    expect(KNOWLEDGE_FILE_NAMES).toEqual(['AGENTS.md', 'CLAUDE.md'])
  })
})

describe('isKnowledgeFile', () => {
  test('returns false for knowledge.md', () => {
    expect(isKnowledgeFile('knowledge.md')).toBe(false)
    expect(isKnowledgeFile('src/knowledge.md')).toBe(false)
    expect(isKnowledgeFile('KNOWLEDGE.MD')).toBe(false)
  })

  test('returns false for *.knowledge.md pattern', () => {
    expect(isKnowledgeFile('authentication.knowledge.md')).toBe(false)
    expect(isKnowledgeFile('src/api.knowledge.md')).toBe(false)
    expect(isKnowledgeFile('docs/AUTH.KNOWLEDGE.MD')).toBe(false)
    expect(isKnowledgeFile('foo.bar.knowledge.md')).toBe(false)
  })

  test('returns true for AGENTS.md', () => {
    expect(isKnowledgeFile('AGENTS.md')).toBe(true)
    expect(isKnowledgeFile('src/agents.md')).toBe(true)
    expect(isKnowledgeFile('Agents.MD')).toBe(true)
  })

  test('returns true for CLAUDE.md', () => {
    expect(isKnowledgeFile('CLAUDE.md')).toBe(true)
    expect(isKnowledgeFile('src/claude.md')).toBe(true)
    expect(isKnowledgeFile('Claude.MD')).toBe(true)
  })

  test('returns false for non-knowledge files', () => {
    expect(isKnowledgeFile('README.md')).toBe(false)
    expect(isKnowledgeFile('src/utils.ts')).toBe(false)
    expect(isKnowledgeFile('knowledge.txt')).toBe(false)
    expect(isKnowledgeFile('agents.txt')).toBe(false)
  })

  test('returns false for files with knowledge in name but no exact filename match', () => {
    expect(isKnowledgeFile('myknowledge.md')).toBe(false)
    expect(isKnowledgeFile('src/authknowledge.md')).toBe(false)
    expect(isKnowledgeFile('preknowledge.md')).toBe(false)
  })

  test('returns false for similar but non-matching patterns', () => {
    expect(isKnowledgeFile('auth.agents.md')).toBe(false)
    expect(isKnowledgeFile('auth.claude.md')).toBe(false)
    expect(isKnowledgeFile('foo.AGENTS.md')).toBe(false)
    expect(isKnowledgeFile('foo.CLAUDE.md')).toBe(false)
  })
})

describe('selectHighestPriorityKnowledgeFile', () => {
  test('returns undefined for empty array', () => {
    expect(selectHighestPriorityKnowledgeFile([])).toBeUndefined()
  })

  test('returns undefined when no knowledge files present', () => {
    expect(
      selectHighestPriorityKnowledgeFile(['README.md', 'src/utils.ts']),
    ).toBeUndefined()
  })

  test('returns the only knowledge file', () => {
    expect(selectHighestPriorityKnowledgeFile(['AGENTS.md'])).toBe('AGENTS.md')
  })

  test('prefers AGENTS.md over CLAUDE.md', () => {
    expect(selectHighestPriorityKnowledgeFile(['CLAUDE.md', 'AGENTS.md'])).toBe(
      'AGENTS.md',
    )
  })

  test('handles case-insensitive matching', () => {
    expect(selectHighestPriorityKnowledgeFile(['agents.md'])).toBe('agents.md')
    expect(selectHighestPriorityKnowledgeFile(['Claude.md'])).toBe('Claude.md')
  })

  test('filters out non-knowledge files before selecting', () => {
    expect(
      selectHighestPriorityKnowledgeFile([
        'README.md',
        'AGENTS.md',
        'utils.ts',
      ]),
    ).toBe('AGENTS.md')
  })
})

describe('selectKnowledgeFilePaths', () => {
  test('selects AGENTS.md when it exists alone', () => {
    const files = ['src/AGENTS.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('selects CLAUDE.md when AGENTS.md does not exist', () => {
    const files = ['src/CLAUDE.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/CLAUDE.md'])
  })

  test('ignores knowledge.md and *.knowledge.md files', () => {
    const files = [
      'src/knowledge.md',
      'src/topic.knowledge.md',
      'src/AGENTS.md',
      'docs/guide.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('prefers AGENTS.md over CLAUDE.md when both exist in same directory', () => {
    const files = ['src/AGENTS.md', 'src/CLAUDE.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('handles case-insensitive matching for AGENTS.md', () => {
    const files = ['src/agents.md', 'lib/Agents.MD', 'root/AGENTS.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/agents.md')
    expect(result).toContain('lib/Agents.MD')
    expect(result).toContain('root/AGENTS.md')
  })

  test('handles case-insensitive matching for CLAUDE.md', () => {
    const files = ['src/claude.md', 'lib/Claude.MD', 'root/CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/claude.md')
    expect(result).toContain('lib/Claude.MD')
    expect(result).toContain('root/CLAUDE.md')
  })

  test('selects one knowledge file per directory when multiple directories have files', () => {
    const files = [
      'src/AGENTS.md',
      'lib/AGENTS.md',
      'lib/CLAUDE.md',
      'docs/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/AGENTS.md')
    expect(result).toContain('lib/AGENTS.md')
    expect(result).toContain('docs/CLAUDE.md')
  })

  test('handles nested directory structures', () => {
    const files = [
      'src/components/AGENTS.md',
      'src/utils/AGENTS.md',
      'src/utils/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('src/components/AGENTS.md')
    expect(result).toContain('src/utils/AGENTS.md')
  })

  test('returns empty array when no knowledge files exist', () => {
    const files = ['src/utils.ts', 'lib/helper.js', 'README.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual([])
  })

  test('handles root directory knowledge files', () => {
    const files = ['AGENTS.md', 'CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['AGENTS.md'])
  })

  test('handles deeply nested directory structures', () => {
    const files = [
      'a/b/c/d/AGENTS.md',
      'a/b/c/CLAUDE.md',
      'a/b/AGENTS.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('a/b/c/d/AGENTS.md')
    expect(result).toContain('a/b/c/CLAUDE.md')
    expect(result).toContain('a/b/AGENTS.md')
  })

  test('handles files with similar names but different extensions', () => {
    const files = ['src/AGENTS.md', 'src/agents.txt']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('handles empty file list', () => {
    const files: string[] = []
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual([])
  })

  test('handles file paths with special characters', () => {
    const files = ['my_project/AGENTS.md', 'my.project/CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('my_project/AGENTS.md')
    expect(result).toContain('my.project/CLAUDE.md')
  })

  test('prioritizes correctly with all variations in same directory', () => {
    const files = [
      'dir/AGENTS.md',
      'dir/agents.MD',
      'dir/CLAUDE.md',
      'dir/claude.MD',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(1)
    expect(result[0].toLowerCase()).toBe('dir/agents.md')
  })

  test('handles paths correctly regardless of separator', () => {
    const files = ['src/components/AGENTS.md', 'lib/CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('src/components/AGENTS.md')
    expect(result).toContain('lib/CLAUDE.md')
  })
})
