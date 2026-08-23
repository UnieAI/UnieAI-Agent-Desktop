/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @unieai/uad-subagent
 */

import { HarnessError } from '@unieai/uad-llm'

/** Typed failure for the subagent seam. */
export class SubagentError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SubagentError'
  }
}
