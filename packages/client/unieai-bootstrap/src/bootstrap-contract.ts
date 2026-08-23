/**
 * The `unieaiBootstrap` service contract: the one place a desktop decides
 * whether it is signed in, and what it holds on that account's behalf.
 *
 * Every UnieAI surface used to answer that question for itself — the account
 * section read `/auth/account`, the providers section read `/auth/providers`,
 * the plugins page read `/auth/mcp` — so the application opened onto sections
 * that were each in a different state, and a signed-out desktop discovered
 * that fact several times over. This contract replaces those first reads with
 * one: the host gathers, the browser reads once before the interface mounts,
 * and each surface projects the part it owns.
 *
 * It replaces first reads only. A surface that refreshes itself — providers
 * after a create, the account after a profile save — keeps reading its own
 * route, because this snapshot describes the start of the document rather than
 * the current state of the product.
 *
 * **A consumer of this contract injects it.** The supplier is still reading
 * while every other plugin's body runs — the desktop's first frame waits on
 * that read — and Cordis does not hand out a service whose fiber is not yet
 * active. A surface that merely looked for this one with `ctx.get` would find
 * nothing and fall back to reading its own route, which is the behaviour this
 * contract exists to replace. Naming it in `inject` is also what guarantees
 * the snapshot a consumer's body reads is the settled one.
 *
 * The parts are `unknown` on purpose. Each is the body that part's own
 * `/auth/*` route answers, and every consumer already owns the reader that
 * narrows its own route's body; restating the four wire formats here would be
 * a second copy of them, in a package that reads none.
 */

/** The service name a supplier of this contract registers under. */
export const BOOTSTRAP_SERVICE = 'unieaiBootstrap'

/** The parts one startup answer can carry. */
export const BOOTSTRAP_PARTS = ['account', 'providers', 'models', 'mcp'] as const

/** One part of the startup answer, named after the route that owns it. */
export type UnieAiBootstrapPart = typeof BOOTSTRAP_PARTS[number]

/**
 * What a startup snapshot says about this desktop.
 *
 * - `pending` — the first read has not settled. It is the state the service is
 *   created in, and a consumer reading it should wait rather than draw: the
 *   application does not mount until the read settles.
 * - `signed-out` — this desktop holds no session. Nothing was gathered and
 *   nothing needs to be; the local agent works without the product.
 * - `ready` — every part was gathered. Whether a part reports success is the
 *   part's own business: a read that reached the product and failed is a
 *   gathered part carrying a failure.
 * - `partial` — at least one part had not landed when the host answered. Its
 *   consumer either waits for the follow-up read or asks its own route.
 * - `unavailable` — there is no startup answer to be had: no gate in this
 *   build, or the host did not answer in time. Every surface falls back to
 *   reading its own route, which is what it did before this service existed.
 */
export type UnieAiBootstrapStatus = 'pending' | 'signed-out' | 'ready' | 'partial' | 'unavailable'

/** One reading of the startup answer. */
export interface UnieAiBootstrapSnapshot {
  /** What this desktop is, as one word. */
  status: UnieAiBootstrapStatus
  /**
   * The gathered parts, each under the body its own `/auth/*` route answers.
   * A part that was not gathered is absent rather than null — absent means
   * "ask for it yourself", and null would be an answer.
   */
  parts: Readonly<Partial<Record<UnieAiBootstrapPart, unknown>>>
}

/** The observable startup answer every UnieAI surface reads its first state from. */
export interface UnieAiBootstrap {
  /**
   * Read the current snapshot.
   * @returns the standing snapshot; the same reference until a read settles.
   */
  getSnapshot: () => UnieAiBootstrapSnapshot
  /**
   * Subscribe to snapshot changes.
   * @param listener - called after every settled read.
   * @returns unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
  /**
   * Read the startup answer again.
   *
   * The boot path calls this once. A consumer normally has no reason to: the
   * routes behind the parts are the same ones it reads to refresh itself, and
   * reading them directly is what tells it the current state rather than the
   * state the document started in.
   * @returns a promise settling when the reading has been published.
   */
  refresh: () => Promise<void>
}
