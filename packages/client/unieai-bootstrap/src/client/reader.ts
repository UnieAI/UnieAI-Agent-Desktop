/**
 * The `unieaiBootstrap` supplier: one read of the host gate's
 * `/auth/bootstrap` route, published as the startup snapshot.
 *
 * It owns no credential and holds no session. The gate's cookie is `HttpOnly`,
 * so this object cannot see whether one exists; the host answers that question
 * and this object publishes the answer. Everything it reads is same-origin,
 * and the API key the host spends on the product never crosses back.
 *
 * Two numbers decide what a bad network does to the desktop:
 *
 * - {@link DEFAULT_READ_TIMEOUT_MS} bounds the read. The application's first
 *   frame waits on it, so it must end — with an answer or without one. Without
 *   one the snapshot is `unavailable`, which is every surface's instruction to
 *   read its own route exactly as it did before this package existed. The
 *   desktop opens either way, because the local agent does not need the cloud.
 * - {@link DEFAULT_FOLLOW_UP_DELAY_MS} is how long a `partial` answer waits
 *   before being asked again, once. The host names the parts it is still
 *   gathering and keeps gathering them, so one later read usually completes
 *   the picture without anybody touching anything. Once, not repeatedly: this
 *   is a warm start, not a poll.
 */
import type {
  UnieAiBootstrap, UnieAiBootstrapPart, UnieAiBootstrapSnapshot,
} from '../bootstrap-contract.ts'
import { BOOTSTRAP_PARTS } from '../bootstrap-contract.ts'

/** Route the browser reads the startup answer from. */
const BOOTSTRAP_PATH = '/auth/bootstrap'

/**
 * How long one read may take before the desktop stops waiting for it.
 *
 * Above the host's own gathering deadline, because this bound covers the host
 * answering as well as the request reaching it; below what anyone would spend
 * looking at a boot screen.
 */
export const DEFAULT_READ_TIMEOUT_MS = 3000

/** How long a `partial` answer waits before its single follow-up read. */
export const DEFAULT_FOLLOW_UP_DELAY_MS = 1500

/** The snapshot the reader is created in: nothing read yet. */
const PENDING: UnieAiBootstrapSnapshot = Object.freeze({ status: 'pending' as const, parts: Object.freeze({}) })

/** The snapshot for a desktop with no startup answer to be had. */
const UNAVAILABLE: UnieAiBootstrapSnapshot = Object.freeze({ status: 'unavailable' as const, parts: Object.freeze({}) })

/** The snapshot for a desktop the host says holds no session. */
const SIGNED_OUT: UnieAiBootstrapSnapshot = Object.freeze({ status: 'signed-out' as const, parts: Object.freeze({}) })

/** The browser facilities the reader uses, named so a test can drive them. */
export interface BootstrapEnvironment {
  /**
   * Issue one same-origin request to the host gate.
   * @param path - an absolute path on this origin.
   * @param init - request options.
   * @returns the response.
   */
  request: (path: string, init?: RequestInit) => Promise<Response>
  /** Bound on one read; defaults to {@link DEFAULT_READ_TIMEOUT_MS}. */
  readTimeoutMs?: number
  /** Delay before the single follow-up; defaults to {@link DEFAULT_FOLLOW_UP_DELAY_MS}. */
  followUpDelayMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Narrow one `/auth/bootstrap` body.
 *
 * The parts are carried through untouched — this package reads none of them —
 * but the KEYS are not: only the four this build knows about are kept, so a
 * host one deploy ahead cannot put a part into the snapshot under a name no
 * consumer of this contract has heard of.
 * @param body - the parsed response body.
 * @returns the snapshot it describes, or undefined when it describes none.
 */
export function readBootstrapResponse(body: unknown): UnieAiBootstrapSnapshot | undefined {
  if (!isRecord(body)) return undefined
  const status = body['status']
  if (status === 'signed-out') return SIGNED_OUT
  if (status !== 'ready' && status !== 'partial') return undefined
  const reported = isRecord(body['parts']) ? body['parts'] : {}
  const parts: Partial<Record<UnieAiBootstrapPart, unknown>> = {}
  for (const part of BOOTSTRAP_PARTS) {
    const value = reported[part]
    if (value !== undefined) parts[part] = value
  }
  // The status is recomputed from what actually arrived rather than believed:
  // a host that called an answer `ready` while omitting a part would otherwise
  // leave that part's consumer waiting for a follow-up that never comes.
  const complete = BOOTSTRAP_PARTS.every(part => part in parts)
  return { status: complete ? 'ready' : 'partial', parts }
}

/** Reads the startup answer from the host gate and publishes it. */
export class BootstrapReader implements UnieAiBootstrap {
  private readonly listeners = new Set<() => void>()
  private snapshot: UnieAiBootstrapSnapshot = PENDING
  private followUp: ReturnType<typeof setTimeout> | undefined
  private inFlight: AbortController | undefined
  private disposed = false

  /** @param environment - the browser facilities to use. */
  constructor(private readonly environment: BootstrapEnvironment) {}

  /**
   * Read the current snapshot.
   * @returns the standing snapshot; the same reference until a read settles.
   */
  getSnapshot(): UnieAiBootstrapSnapshot {
    return this.snapshot
  }

  /**
   * Subscribe to snapshot changes.
   * @param listener - called after every settled read.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read the startup answer, scheduling one follow-up if it was partial.
   * @returns a promise settling when the reading has been published.
   */
  async refresh(): Promise<void> {
    await this.read(true)
  }

  /** Stop reading and publishing; a read in flight is cancelled. */
  dispose(): void {
    this.disposed = true
    if (this.followUp !== undefined) clearTimeout(this.followUp)
    this.followUp = undefined
    this.inFlight?.abort()
    this.inFlight = undefined
    this.listeners.clear()
  }

  /**
   * Perform one read and publish what it establishes.
   * @param mayFollowUp - whether a partial answer earns the single follow-up;
   * false for the follow-up itself, which is where the chain ends.
   */
  private async read(mayFollowUp: boolean): Promise<void> {
    const snapshot = await this.fetchOnce()
    if (this.disposed) return
    this.publish(snapshot)
    if (!mayFollowUp || snapshot.status !== 'partial') return
    const delay = this.environment.followUpDelayMs ?? DEFAULT_FOLLOW_UP_DELAY_MS
    this.followUp = setTimeout(() => {
      this.followUp = undefined
      void this.read(false)
    }, delay)
  }

  /**
   * Issue one bounded request.
   * @returns what the attempt established; `unavailable` for a host that did
   * not answer, answered late, or answered a body this build cannot read.
   */
  private async fetchOnce(): Promise<UnieAiBootstrapSnapshot> {
    const controller = new AbortController()
    this.inFlight = controller
    const timer = setTimeout(() => { controller.abort() }, this.environment.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS)
    try {
      const response = await this.environment.request(BOOTSTRAP_PATH, { signal: controller.signal })
        .catch(() => undefined)
      if (response === undefined || !response.ok) return UNAVAILABLE
      const body = await response.json().catch(() => undefined) as unknown
      return readBootstrapResponse(body) ?? UNAVAILABLE
    } finally {
      clearTimeout(timer)
      if (this.inFlight === controller) this.inFlight = undefined
    }
  }

  /**
   * Stand on a new snapshot and notify.
   * @param snapshot - the reading to publish.
   */
  private publish(snapshot: UnieAiBootstrapSnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}
