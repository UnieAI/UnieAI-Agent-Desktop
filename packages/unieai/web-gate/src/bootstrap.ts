/**
 * The startup warm-up behind `/auth/bootstrap`: everything a freshly loaded
 * desktop needs about its account, gathered once on this host and answered in
 * one body.
 *
 * Why the gathering happens here rather than in the browser. This host already
 * holds the two things the reads need — the session and the desktop API key —
 * and it holds them before any client bundle exists. A browser doing the same
 * work would issue four same-origin requests, each of which this host would
 * turn into one or more product calls anyway, and it could not start any of
 * them until its bundles had loaded. Gathering here means the fan-out starts at
 * the moment the device grant lands, runs in parallel, and is usually already
 * finished by the time the application asks.
 *
 * Nothing here interprets a part. Each reader returns the exact body that
 * part's own `/auth/*` route answers, so a page reads one endpoint and applies
 * the readers it already has. A part that cannot be gathered is simply absent
 * from the answer, which is a different fact from a part whose read reached the
 * product and failed — that one arrives as the route's own failure body.
 *
 * The cache exists for the seconds between a sign-in and the application's
 * first frame, not as a data store: it is keyed by account, dropped when the
 * account changes, and never consulted for a request without a live session,
 * because the route resolves the session before it asks this object anything.
 */

/** The parts of one startup answer, in the order they are gathered. */
export const BOOTSTRAP_PARTS = ['account', 'providers', 'models', 'mcp'] as const

/** One part of the startup answer. */
export type BootstrapPart = typeof BOOTSTRAP_PARTS[number]

/**
 * Read one part on the account's behalf.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the read when the upstream ceiling elapses.
 * @returns the body that part's own route answers for a signed-in session.
 */
export type BootstrapPartReader = (apiKey: string, signal: AbortSignal) => Promise<unknown>

/** What one startup read established. */
export interface BootstrapAnswer {
  /** `ready` when every part is present, `partial` when at least one is not. */
  status: 'ready' | 'partial'
  /** Each gathered part, under the same body its own route would answer. */
  parts: Partial<Record<BootstrapPart, unknown>>
  /**
   * Parts that had not settled when the answer was written. They are still
   * being gathered, so a caller that wants them either asks again or reads the
   * part's own route.
   */
  pending: BootstrapPart[]
}

/** The account one gather runs for. */
export interface BootstrapAccount {
  /** The product's own account id; a change to it drops the cache. */
  userId: string
  /** The desktop API key the readers spend. Never leaves this process. */
  apiKey: string
}

/** How one warm-up behaves. */
export interface BootstrapWarmupOptions {
  /** One reader per part; each answers that part's own route body. */
  readers: Readonly<Record<BootstrapPart, BootstrapPartReader>>
  /** How long a completed gather is answered from memory. */
  ttlMs: number
  /**
   * Ceiling on one gather's upstream reads. It is not the caller's deadline —
   * {@link BootstrapWarmup.read} has its own — but the point at which a socket
   * that never answers stops being held open on this host's behalf.
   */
  upstreamTimeoutMs: number
  /** Clock, so a suite can age the cache without waiting. */
  now?: () => number
}

/** One gather in flight. */
interface Gather {
  userId: string
  parts: Map<BootstrapPart, unknown>
  completion: Promise<void>
  abort: AbortController
}

/** The last completed gather, kept for the seconds after a sign-in. */
interface Settled {
  userId: string
  parts: Map<BootstrapPart, unknown>
  at: number
}

/**
 * Sleep that does not hold the process open, and can be cancelled.
 * @param ms - how long to wait.
 * @returns the promise and its canceller.
 */
function deadline(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
    // Node's handle only; this module never runs in a browser. An unref'd
    // timer is how a warm-up that nobody is waiting for stops holding the
    // process open.
    timer.unref()
  })
  return { promise, cancel: () => { if (timer !== undefined) clearTimeout(timer) } }
}

/**
 * Gathers the startup parts for the signed-in account and hands out whatever
 * has landed.
 */
export class BootstrapWarmup {
  private settled: Settled | undefined
  private inflight: Gather | undefined
  private disposed = false

  /** @param options - readers, cache lifetime, and upstream ceiling. */
  constructor(private readonly options: BootstrapWarmupOptions) {}

  /**
   * Start gathering for an account without waiting for the result.
   *
   * Called when a sign-in lands, which is the whole point of the warm-up: the
   * browser is on its way from the gate's page to the application, and the
   * gather runs during that navigation instead of after it.
   * @param account - the account that just signed in.
   */
  warm(account: BootstrapAccount): void {
    if (this.disposed) return
    this.begin(account)
  }

  /**
   * Answer with everything gathered for an account, waiting no longer than the
   * given deadline.
   *
   * A cache within its lifetime answers immediately. A stale one also answers
   * immediately, from the previous gather, while a fresh gather runs behind it
   * — the alternative is making a reader wait for a refresh of data it already
   * has. Only a cold start waits, and only until the deadline.
   * @param account - the account asking.
   * @param deadlineMs - the longest this call may take.
   * @returns the parts that had landed, and the names of those that had not.
   */
  async read(account: BootstrapAccount, deadlineMs: number): Promise<BootstrapAnswer> {
    const previous = this.freshOrStale(account)
    const gather = this.begin(account)
    if (previous !== undefined) return answer(previous.parts)
    const timer = deadline(deadlineMs)
    try {
      await Promise.race([gather.completion, timer.promise])
    } finally {
      timer.cancel()
    }
    return answer(gather.parts)
  }

  /**
   * Drop what was gathered and cancel what is being gathered.
   *
   * The sign-out path calls this: the parts describe one account, and the next
   * account to sign in must not be shown them.
   */
  forget(): void {
    this.inflight?.abort.abort()
    this.inflight = undefined
    this.settled = undefined
  }

  /** Stop gathering; a read already in flight lands on a closed warm-up. */
  dispose(): void {
    this.disposed = true
    this.forget()
  }

  /**
   * The standing cache for an account, or undefined when there is none to
   * answer from. A cache belonging to another account is dropped on the way
   * past, which is what makes a second account's sign-in start cold.
   * @param account - the account asking.
   * @returns the settled gather to answer from, or undefined.
   */
  private freshOrStale(account: BootstrapAccount): Settled | undefined {
    const standing = this.settled
    if (standing === undefined) return undefined
    if (standing.userId === account.userId) return standing
    this.forget()
    return undefined
  }

  /**
   * Ensure a gather is running or recent for this account.
   * @param account - the account to gather for.
   * @returns the gather to await, joining one already in flight.
   */
  private begin(account: BootstrapAccount): Gather {
    const inflight = this.inflight
    if (inflight !== undefined && inflight.userId === account.userId) return inflight
    const standing = this.settled
    const fresh = standing !== undefined
      && standing.userId === account.userId
      && this.clock() - standing.at <= this.options.ttlMs
    if (fresh && inflight === undefined) {
      // Nothing to start: the answer is already in memory. The caller reads it
      // through freshOrStale; this object stays a promise for symmetry.
      return { userId: account.userId, parts: standing.parts, completion: Promise.resolve(), abort: new AbortController() }
    }
    if (inflight !== undefined) inflight.abort.abort()
    return this.start(account)
  }

  /**
   * Start one gather: every part at once, each isolated from the others.
   * @param account - the account to gather for.
   * @returns the started gather.
   */
  private start(account: BootstrapAccount): Gather {
    const abort = new AbortController()
    const parts = new Map<BootstrapPart, unknown>()
    const ceiling = deadline(this.options.upstreamTimeoutMs)
    void ceiling.promise.then(() => { abort.abort() })
    const completion = Promise.all(BOOTSTRAP_PARTS.map(async (part) => {
      const body = await this.options.readers[part](account.apiKey, abort.signal)
        .catch(() => undefined)
      // Absent, not null: a part this gather could not produce is one the
      // caller must ask for itself, and a body of `null` would be an answer.
      if (body !== undefined) parts.set(part, body)
    })).then(() => {
      ceiling.cancel()
      this.finish(account.userId, parts, abort)
    })
    const gather: Gather = { userId: account.userId, parts, completion, abort }
    this.inflight = gather
    return gather
  }

  /**
   * Retain one completed gather, unless it was superseded or cancelled.
   * @param userId - the account it ran for.
   * @param parts - what it gathered.
   * @param abort - the gather's own controller, identifying it.
   */
  private finish(userId: string, parts: Map<BootstrapPart, unknown>, abort: AbortController): void {
    if (this.disposed || this.inflight?.abort !== abort) return
    this.inflight = undefined
    this.settled = { userId, parts, at: this.clock() }
  }

  /** The current instant, from the injected clock or this process's own. */
  private clock(): number {
    return this.options.now?.() ?? Date.now()
  }
}

/**
 * Describe one set of gathered parts.
 * @param parts - what has landed so far.
 * @returns the answer body, naming what has not.
 */
function answer(parts: ReadonlyMap<BootstrapPart, unknown>): BootstrapAnswer {
  const gathered: Partial<Record<BootstrapPart, unknown>> = {}
  const pending: BootstrapPart[] = []
  for (const part of BOOTSTRAP_PARTS) {
    if (parts.has(part)) gathered[part] = parts.get(part)
    else pending.push(part)
  }
  return { status: pending.length === 0 ? 'ready' : 'partial', parts: gathered, pending }
}
