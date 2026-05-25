import path from 'path'

/**
 * The primary/default knowledge file name.
 * Used when creating new knowledge files.
 */
export const PRIMARY_KNOWLEDGE_FILE_NAME = 'AGENTS.md'

/**
 * Knowledge file names in priority order (highest priority first).
 * Used for both project knowledge files and home directory user knowledge files.
 */
export const KNOWLEDGE_FILE_NAMES = [
  PRIMARY_KNOWLEDGE_FILE_NAME,
  'CLAUDE.md',
] as const

/**
 * Pre-computed lowercase knowledge file names for efficient matching.
 */
export const KNOWLEDGE_FILE_NAMES_LOWERCASE = KNOWLEDGE_FILE_NAMES.map((name) =>
  name.toLowerCase(),
)

/**
 * Checks if a file path is a knowledge file.
 * Matches exact file names: AGENTS.md and CLAUDE.md (case-insensitive).
 */
export function isKnowledgeFile(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase()
  return KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(fileName)
}
