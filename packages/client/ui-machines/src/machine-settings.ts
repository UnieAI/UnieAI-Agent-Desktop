/**
 * The durable machine section, as this plugin's two halves name it.
 *
 * The section itself is OWNED by the host `machines` service
 * (`@unieai/uad-machines` registers the namespace and its schema); this module
 * only spells the names the browser half needs to bind and write it. The host
 * package is a node package, so importing it here would pull a host module
 * into a client bundle — `constants-agree.spec.ts` imports both and asserts
 * they still match, which is the drift guard the import would have been.
 */

/** This computer's machine id, as the host service names it. */
export const LOCAL_MACHINE = 'local'

/** Settings namespace registered by the host machines service. */
export const MACHINES_SETTINGS_NAMESPACE = 'machines'

/** Field holding the workspace each machine was last working in. */
export const WORKSPACE_BY_MACHINE_FIELD = 'workspaceByMachine'

/** The part of the section this plugin reads and writes. */
export interface MachineWorkspaceMemory {
  /** Workspace id last used on each machine, keyed by machine id. */
  workspaceByMachine?: Record<string, string>
}
