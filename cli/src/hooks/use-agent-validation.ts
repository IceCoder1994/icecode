import { validateAgents } from '@codebuff/sdk'
import { useCallback, useState } from 'react'

import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'
import { filterNetworkErrors } from '../utils/validation-error-helpers'

export type ValidationError = {
  id: string
  message: string
}

export type ValidationCheckResult = {
  success: boolean
  errors: ValidationError[]
}

type UseAgentValidationResult = {
  validationErrors: ValidationError[]
  isValidating: boolean
  validate: () => Promise<ValidationCheckResult>
}

/**
 * Hook that provides agent validation functionality.
 * Call validate() manually to trigger validation (e.g., on message send).
 */
export const useAgentValidation = (): UseAgentValidationResult => {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  )
  const [isValidating, setIsValidating] = useState(false)

  // Validate agents and update state
  // Returns validation result with success status and any errors
  const validate = useCallback(async (): Promise<ValidationCheckResult> => {
    setIsValidating(true)

    try {
      const agentDefinitions = loadAgentDefinitions()

      const validationResult = await validateAgents(agentDefinitions, {
        remote: true,
      })

      if (validationResult.success) {
        setValidationErrors([])
        return { success: true, errors: [] }
      }

      const filteredValidationErrors = filterNetworkErrors(
        validationResult.validationErrors,
      )

      // If all errors were network errors, treat as success.
      // This prevents blocking message sending when the Codebuff backend is
      // unavailable — which is always the case when using custom models without
      // a Codebuff account.
      if (filteredValidationErrors.length === 0) {
        setValidationErrors([])
        return { success: true, errors: [] }
      }

      setValidationErrors(filteredValidationErrors)
      return { success: false, errors: filteredValidationErrors }
    } catch (error) {
      logger.warn({ error }, 'Agent validation failed with exception — allowing message send')
      // Don't update validation errors on exception — keep previous state.
      // Return success to not block message sending (e.g., when using custom
      // models or when the validation backend is temporarily unavailable).
      return { success: true, errors: [] }
    } finally {
      setIsValidating(false)
    }
  }, [])

  return {
    validationErrors,
    isValidating,
    validate,
  }
}
