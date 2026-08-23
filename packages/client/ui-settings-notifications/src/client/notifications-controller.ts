/**
 * The section's state and the completion announcement, in one owner.
 *
 * Both blocks of the section are per-device facts the host never sees: what
 * the browser will do with a notification request, and which cue this machine
 * plays. The same object receives completions from the watcher, so the
 * settings the user is looking at and the behavior they describe cannot drift.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionCompletion } from './completion-watcher.ts'
import type { NotificationAccess, NotificationPort } from './notification-port.ts'
import {
  isNotifySoundId, readNotifySoundId, writeNotifySoundId,
  type NotifySoundPlayer, type NotifySoundStorage,
} from './notify-sounds.ts'

/** What the section renders. */
export interface NotificationsSettingsState {
  /** Current browser permission state for this origin. */
  readonly access: NotificationAccess
  /** The cue selected on this device. */
  readonly soundId: string
  /** Whether a permission prompt is open (the Enable button is disabled meanwhile). */
  readonly requesting: boolean
}

/** Copy the completion announcement needs, read at announce time so a locale switch lands. */
export interface CompletionCopy {
  /**
   * Notification title line.
   * @returns the localized "Task complete" heading.
   */
  heading(): string
  /**
   * Body line for one finished session.
   * @param title - the session's display title.
   * @returns the localized body.
   */
  body(title: string): string
}

/** Collaborators the controller drives. */
export interface NotificationsControllerOptions {
  /** The browser notification capability. */
  readonly port: NotificationPort
  /** Cue playback. */
  readonly player: NotifySoundPlayer
  /** Per-device preference cell; absent means the choice lives for this page only. */
  readonly storage: NotifySoundStorage | undefined
  /** Announcement copy. */
  readonly copy: CompletionCopy
  /**
   * Bring the finished session on screen — invoked when the user activates the
   * notification, which is the only reason to raise one.
   * @param sessionId - the session that finished.
   */
  readonly openSession: (sessionId: SessionId) => void
  /** Raise the app's own window; the notification click focuses the page first. */
  readonly focusWindow: () => void
}

/** Section state owner and the announcement sink the watcher feeds. */
export class NotificationsSettingsController {
  private readonly store: SnapshotStore<NotificationsSettingsState>

  /** @param options - the collaborators this controller drives. */
  constructor(private readonly options: NotificationsControllerOptions) {
    this.store = createSnapshotStore<NotificationsSettingsState>({
      access: options.port.access(),
      soundId: readNotifySoundId(options.storage),
      requesting: false,
    })
  }

  /**
   * Read the current section state.
   * @returns the snapshot.
   */
  getSnapshot(): NotificationsSettingsState {
    return this.store.getSnapshot()
  }

  /**
   * Observe section state.
   * @param listener - change callback.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /**
   * Ask the browser for notification permission.
   *
   * MUST be reached from the Enable button's click and nothing else: a prompt
   * raised without a user gesture is refused, and Chrome counts the refusal
   * against the origin permanently.
   * @returns completion once the user has answered.
   */
  async enable(): Promise<void> {
    if (this.store.getSnapshot().requesting) return
    this.store.set({ ...this.store.getSnapshot(), requesting: true })
    try {
      const access = await this.options.port.request()
      this.store.set({ ...this.store.getSnapshot(), access })
    } finally {
      this.store.set({ ...this.store.getSnapshot(), requesting: false })
    }
  }

  /**
   * Select a cue and preview it. Selecting is what plays it — the picker has no
   * separate preview control, so the click both stores and demonstrates the choice.
   * @param id - catalog id; an unknown id is ignored.
   */
  chooseSound(id: string): void {
    if (!isNotifySoundId(id)) return
    writeNotifySoundId(this.options.storage, id)
    this.store.set({ ...this.store.getSnapshot(), soundId: id })
    this.options.player.play(id)
  }

  /**
   * Announce one finished turn.
   *
   * A completion the user watched happen needs no announcement, so an attended
   * one is dropped. Everything else plays the cue, and additionally raises a
   * desktop notification once permission has been granted — the cue is the part
   * that works without asking the browser for anything.
   * @param completion - the observed completion.
   */
  announce(completion: SessionCompletion): void {
    if (completion.attended) return
    const { soundId } = this.store.getSnapshot()
    this.options.player.play(soundId)
    const title = completion.title.trim()
    this.options.port.show({
      title: this.options.copy.heading(),
      body: this.options.copy.body(title),
      tag: `dsh-session-complete:${completion.sessionId}`,
      onActivate: () => {
        this.options.focusWindow()
        this.options.openSession(completion.sessionId)
      },
    })
  }

  /**
   * Re-read the browser permission value.
   *
   * A permission revoked in site settings does not notify the page, so the
   * section refreshes whenever it comes back on screen.
   */
  refreshAccess(): void {
    const access = this.options.port.access()
    if (access === this.store.getSnapshot().access) return
    this.store.set({ ...this.store.getSnapshot(), access })
  }
}
