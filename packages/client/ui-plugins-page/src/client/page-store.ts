/**
 * Whether the Plugins surface is open.
 *
 * A controller created in `apply` rather than a slot-declared store, because
 * two registrations in this package write it — the sidebar nav row toggles it,
 * the surface's own chrome closes it — and a declared store is instantiated by
 * the render machinery, which `apply` cannot reach. The same reasoning put the
 * settings shell's panel state in its own apply-level controller.
 *
 * Nothing here persists. A surface left open across a reload is a surprise
 * rather than a restored place, and the conversation is what this app is for.
 */
import { createSnapshotStore, type SnapshotStore } from '@unieai/uad-client-runtime/client'

/** The surface's whole state: it is open, or it is not. */
export interface PluginsPageState {
  /** Whether the surface covers the frame's main area. */
  open: boolean
}

/** Open state shared by the Plugins surface and the sidebar row that toggles it. */
export class PluginsPageController {
  /** uSES-safe state source; both registrations bind it as `usePage`. */
  readonly store: SnapshotStore<PluginsPageState> = createSnapshotStore<PluginsPageState>({ open: false })

  /** Open the surface. */
  open(): void {
    this.store.update((state) => { state.open = true })
  }

  /** Close the surface. */
  close(): void {
    this.store.update((state) => { state.open = false })
  }
}
