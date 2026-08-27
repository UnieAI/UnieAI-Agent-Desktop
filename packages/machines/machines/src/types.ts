/**
 * Public type vocabulary of the machine list.
 * @module @unieai/uad-machines/src/types
 */

/** One place work can happen. */
export interface MachineTarget {
  /** `local` for this computer, otherwise the OpenSSH alias. */
  id: string
  /** How a person sees it named. */
  label: string
  /** Which kind of target it is; a surface shows them differently. */
  kind: 'local' | 'ssh'
  /** Absolute path of the configuration file that declared an ssh target. */
  source?: string
}
