/**
 * UnieAI startup initialization, browser half: provides the `unieaiBootstrap`
 * service and makes the one read the whole application starts from.
 *
 * **Where this sits in the boot sequence, and why it blocks there.** The web
 * kernel activates every client entry and only then mounts React
 * (`client/web/src/boot.ts`). This plugin's `apply` returns a promise, so its
 * fiber stays LOADING until the startup answer has settled, and the loader's
 * quiescence — which the mount waits on — includes it. That is the whole
 * feature: the interface opens onto an account it already knows about, rather
 * than onto sections that each fill in later.
 *
 * **What keeps that from stranding anyone.** The wait is bounded by the
 * reader's own timeout, not by the network. A host that does not answer ends
 * it with an `unavailable` snapshot, which is every surface's instruction to
 * read its own route, exactly as it did before this package existed. The
 * desktop opens either way — the local agent does not need the product.
 *
 * **Consumers inject this service; they cannot look it up.** Cordis hands out
 * a service only once its providing fiber is active, and this one is not
 * active while it is reading. That is the ordering guarantee the account
 * gateway relies on: by the time a consumer's body runs, the snapshot it
 * reads is the settled one.
 *
 * **Signed out costs nothing.** The host answers a browser with no session
 * without calling the product at all, so the signed-out path is one local
 * round trip and no waiting on calls that could only be refused.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
import type { UnieAiBootstrap } from '../bootstrap-contract.ts'
import { BOOTSTRAP_SERVICE } from '../bootstrap-contract.ts'
import { BootstrapReader } from './reader.ts'

export type {
  UnieAiBootstrap, UnieAiBootstrapPart, UnieAiBootstrapSnapshot, UnieAiBootstrapStatus,
} from '../bootstrap-contract.ts'
export { BOOTSTRAP_PARTS, BOOTSTRAP_SERVICE } from '../bootstrap-contract.ts'

declare module '@unieai/cordis' {
  interface Context {
    /** The startup answer, when a build composes a supplier of it. */
    unieaiBootstrap: UnieAiBootstrap
  }
}

/**
 * Required services: none. This plugin reads one same-origin route and
 * publishes what it says; it renders nothing, so it needs no locale, and it
 * must not wait on anything, because everything else waits on it.
 */
export const inject: string[] = []

/**
 * Provide the startup answer and make the read the application waits on.
 *
 * `async`, and that is load-bearing rather than stylistic. Cordis calls a
 * plugin body that has a prototype — every ordinary `function` declaration —
 * with `new`, and throws its return value away; only a body with no prototype
 * (an async function, or an arrow) is called plainly and has its promise
 * awaited by the fiber. Written as a plain `function` returning a promise,
 * this plugin would activate immediately and the mount would race the read,
 * silently, with every test still green.
 * @param ctx - client root context.
 * @returns a promise settling when the first read has been published, which
 * is what holds the mount back until the desktop knows what it has.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  const reader = new BootstrapReader({
    request: (path, init) => globalThis.fetch(path, init),
  })
  // Registered before the read, published to consumers when this fiber goes
  // active — which is after it. Consumers therefore inject this name rather
  // than looking it up; the subscription they then hold is for the one
  // follow-up read a partial answer earns.
  ctx.provide(BOOTSTRAP_SERVICE, reader)
  ctx.effect(() => () => { reader.dispose() }, 'unieai-bootstrap: startup reader')
  await reader.refresh()
}
