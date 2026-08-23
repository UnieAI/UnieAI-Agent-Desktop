/**
 * "A task finished" as this app can actually observe it.
 *
 * There is no server-side job queue here: a turn runs in the local host and
 * the client already carries its state, because the sessions list publishes a
 * `running` bit per session and the sidebar reads it. A completion is therefore
 * the running→idle edge of one row, and everything this section announces is
 * derived from that edge — no new wire traffic, no host-side subscription.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/** The list-row facts a completion is derived from. */
export interface SessionCompletionRow {
  /** Whether the session's agent is mid-turn. */
  readonly running: boolean
  /** Human-facing label already resolved by the sessions service. */
  readonly displayTitle: string
}

/** The sessions-list snapshot shape this watcher reads (SessionListState satisfies it). */
export interface SessionCompletionList {
  /** Host-list order. */
  readonly ids: readonly SessionId[]
  /** Row map keyed by session id. */
  readonly byId: Readonly<Record<SessionId, SessionCompletionRow>>
  /** The session the user currently has open, if any. */
  readonly current: SessionId | undefined
}

/** One observed turn completion. */
export interface SessionCompletion {
  /** The session whose turn ended. */
  readonly sessionId: SessionId
  /** That session's display title at the moment it finished. */
  readonly title: string
  /**
   * Whether the user was already looking at this finish: the window is visible
   * AND this is the session on screen. An attended completion is announced by
   * the screen itself, so the section stays quiet for it.
   */
  readonly attended: boolean
}

/**
 * Shortest run that counts as a task. Opening a session briefly marks it
 * running before the host's first status frame settles it back, and a
 * reconnect replays the same flicker; both are far below any real turn.
 */
export const MIN_RUN_MS = 2000

/** Ambient facts the watcher needs but must not read directly (suites supply their own). */
export interface CompletionWatcherEnvironment {
  /**
   * Whether the app's window is currently on screen.
   * @returns true when the document is visible.
   */
  visible(): boolean
  /**
   * Current time.
   * @returns milliseconds since the epoch.
   */
  now(): number
}

/**
 * The browser's own environment.
 * @returns visibility from `document`, time from `Date`; a runtime without a
 * document (node e2e boot) counts as not visible, which is the safe side —
 * it announces rather than suppresses.
 */
export function browserCompletionEnvironment(): CompletionWatcherEnvironment {
  return {
    visible: () => typeof document !== 'undefined' && document.visibilityState === 'visible',
    now: () => Date.now(),
  }
}

/**
 * Watch a sessions list and report each turn completion once.
 *
 * The first snapshot only records running bits: sessions already idle at load
 * never finished while anyone was watching, and one already running has no
 * known start, so neither is announced.
 */
export class SessionCompletionWatcher {
  /** Last observed running bit per session; the true→false edge is the event. */
  private readonly running = new Map<SessionId, boolean>()
  /** When each currently running session was first seen running. */
  private readonly startedAt = new Map<SessionId, number>()

  /**
   * @param list - the sessions list snapshot source.
   * @param environment - visibility and clock.
   * @param announce - receives every completion the watcher accepts.
   * @param minRunMs - shortest run that counts (see {@link MIN_RUN_MS}).
   */
  constructor(
    private readonly list: ObservableSnapshot<SessionCompletionList>,
    private readonly environment: CompletionWatcherEnvironment,
    private readonly announce: (completion: SessionCompletion) => void,
    private readonly minRunMs: number = MIN_RUN_MS,
  ) {}

  /**
   * Subscribe to the list and begin reporting completions.
   * @returns the disposer; it also drops the retained per-session bits.
   */
  start(): () => void {
    this.observe()
    const off = this.list.subscribe(() => { this.observe() })
    return () => {
      off()
      this.running.clear()
      this.startedAt.clear()
    }
  }

  /** Reconcile one snapshot against the retained bits and emit what changed. */
  private observe(): void {
    const snapshot = this.list.getSnapshot()
    const now = this.environment.now()
    const visible = this.environment.visible()
    const seen = new Set<SessionId>()
    for (const id of snapshot.ids) {
      const row = snapshot.byId[id]
      if (row === undefined) continue
      seen.add(id)
      const previous = this.running.get(id)
      this.running.set(id, row.running)
      if (row.running) {
        // A run that was already in flight keeps its original start, so its
        // measured duration is the part this client actually observed.
        if (previous !== true) this.startedAt.set(id, now)
        continue
      }
      const startedAt = this.startedAt.get(id)
      this.startedAt.delete(id)
      if (previous !== true || startedAt === undefined) continue
      if (now - startedAt < this.minRunMs) continue
      this.announce({
        sessionId: id,
        title: row.displayTitle,
        attended: visible && snapshot.current === id,
      })
    }
    // A removed session did not finish; forget it rather than report it.
    for (const id of [...this.running.keys()]) {
      if (seen.has(id)) continue
      this.running.delete(id)
      this.startedAt.delete(id)
    }
  }
}
