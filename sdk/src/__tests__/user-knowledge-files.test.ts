import nodePath from 'path'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { createMockLogger } from '@codebuff/common/testing/mocks/logger'
import { describe, it, expect } from 'bun:test'

import { loadUserKnowledgeFiles } from '../run-state'

const MOCK_HOME = '/mock/home'

describe('loadUserKnowledgeFiles', () => {
  it('should return empty object when no knowledge files exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.bashrc', '.gitconfig', '.profile'],
      readFileImpl: async () => {
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(0)
  })

  it('should load ~/.AGENTS.md when it exists', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.AGENTS.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === nodePath.join(MOCK_HOME, '.AGENTS.md')) {
          return '# Agents config'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents config' })
  })

  it('should load ~/.CLAUDE.md when AGENTS.md does not exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.CLAUDE.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === nodePath.join(MOCK_HOME, '.CLAUDE.md')) {
          return '# Claude instructions'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.CLAUDE.md': '# Claude instructions' })
  })

  it('should prefer AGENTS.md over CLAUDE.md when both exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.CLAUDE.md', '.AGENTS.md'],
      readFileImpl: async (path: string) => {
        if (path === nodePath.join(MOCK_HOME, '.AGENTS.md')) {
          return '# Agents content'
        }
        if (path === nodePath.join(MOCK_HOME, '.CLAUDE.md')) {
          return '# Claude content'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents content' })
  })

  it('should only return one knowledge file (highest priority)', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.AGENTS.md', '.CLAUDE.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === nodePath.join(MOCK_HOME, '.AGENTS.md')) {
          return '# Agents'
        }
        if (path === nodePath.join(MOCK_HOME, '.CLAUDE.md')) {
          return '# Claude'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['~/.AGENTS.md']).toBe('# Agents')
  })

  describe('case-insensitive matching', () => {
    it('should find ~/.agents.md (lowercase) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.agents.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === nodePath.join(MOCK_HOME, '.agents.md')) {
            return '# Agents file (lowercase)'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.agents.md']).toBe('# Agents file (lowercase)')
    })

    it('should find ~/.claude.md (lowercase) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.claude.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === nodePath.join(MOCK_HOME, '.claude.md')) {
            return '# Claude (lowercase)'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.claude.md']).toBe('# Claude (lowercase)')
    })

    it('should preserve the original filename case in the key', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.AGENTS.MD', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === nodePath.join(MOCK_HOME, '.AGENTS.MD')) {
            return '# All caps'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)[0]).toBe('~/.AGENTS.MD')
    })
  })

  describe('error handling', () => {
    it('should handle readdir failure gracefully', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => {
          throw new Error('Permission denied')
        },
        readFileImpl: async () => '',
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should handle readFile failure gracefully and try next priority', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.AGENTS.md', '.CLAUDE.md'],
        readFileImpl: async (path: string) => {
          if (path === nodePath.join(MOCK_HOME, '.AGENTS.md')) {
            throw new Error('Read error')
          }
          if (path === nodePath.join(MOCK_HOME, '.CLAUDE.md')) {
            return '# Claude fallback'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(result).toEqual({ '~/.CLAUDE.md': '# Claude fallback' })
    })
  })
})
