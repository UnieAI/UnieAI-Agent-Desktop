/**
 * Panel viewing state: whether the modal settings panel is open, which
 * section it opened on, and which anchor inside that section the opener
 * asked for.
 *
 * It is a controller created in `apply` rather than a slot-declared store,
 * because three surfaces write it and one of them is in another package.
 * A declared store is instantiated by the render machinery, so `apply` — and
 * therefore the `settingsPanel` service this package provides — cannot reach
 * it. The same reasoning already put `SettingsDocumentStore` here: an
 * apply-level fact several registrations read is an apply-level object, read
 * through the `hooks` compartment and written through injected callbacks.
 *
 * Nothing here persists: a settings panel left open across a reload is a
 * surprise, not a restored place.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Whether the modal panel is open, and where it opened. */
export interface SettingsPanelState {
  open: boolean
  /** Requested section id; `null` lets the panel fall back to its first row. */
  sectionId: string | null
  /** Anchor inside that section; `null` when the opener named none. */
  anchorId: string | null
}

/** Open state shared by the panel, the Plugins nav row, and the account menu. */
export class SettingsPanelController {
  /** uSES-safe state source; the shell binds it as `usePanel`. */
  readonly store: SnapshotStore<SettingsPanelState> = createSnapshotStore<SettingsPanelState>({
    open: false, sectionId: null, anchorId: null,
  })

  /**
   * Open the panel, optionally on a section and an anchor inside it.
   * @param sectionId - section to select, or undefined for the first row.
   * @param anchorId - anchor within that section, or undefined for none.
   */
  open(sectionId?: string, anchorId?: string): void {
    this.store.update((state) => {
      state.open = true
      state.sectionId = sectionId ?? null
      state.anchorId = anchorId ?? null
    })
  }

  /**
   * Move the selection without leaving the panel. Selecting by hand drops the
   * anchor: the request that carried it has been superseded by a navigation.
   * @param sectionId - the section now selected.
   */
  select(sectionId: string): void {
    this.store.update((state) => {
      state.sectionId = sectionId
      state.anchorId = null
    })
  }

  /** Close the panel and forget where it had been. */
  close(): void {
    this.store.update((state) => {
      state.open = false
      state.sectionId = null
      state.anchorId = null
    })
  }
}
