/**
 * UnieAI account gateway, browser half: provides the `unieaiAccount` service
 * that `ui-unieai-account` renders, filled from the sign-in gate's
 * `/auth/account` route.
 *
 * This is the Provider role of the account seam; `ui-unieai-account` owns the
 * Service Definition and is its only Consumer. The split is real: the section
 * must render in a build that has no UnieAI gate at all, and this package must
 * be replaceable by any other supplier of the same service.
 *
 * Composition order matters here and nothing enforces it. The section reads
 * the gateway once, with `ctx.get`, while its own body runs, so a build that
 * activates this row after the section leaves the section permanently
 * unavailable. The bundle roster therefore lists this row ahead of it.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the account seam's own declarations, and the value pinned below.
// Cross-plugin collaboration goes through services, never a value import
// (client bundle purity gate).
import type * as AccountContract from '@deepseek-ai/dsh-client-ui-unieai-account/client'
// Type-only: pulls the locale plugin's Context and Events merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the startup answer's contract, plus its Context merge.
import type * as BootstrapContract from '@deepseek-ai/dsh-client-unieai-bootstrap/client'
import { AccountGateway } from './gateway.ts'

/**
 * The service name the section looks the gateway up under.
 *
 * Spelled out rather than imported: a value import would put another plugin's
 * bundle in this one's synchronous module graph for one string. The annotation
 * is the safeguard — it is the type of the contract's own
 * `ACCOUNT_GATEWAY_SERVICE`, so a rename there fails this build.
 */
const GATEWAY_SERVICE: typeof AccountContract.ACCOUNT_GATEWAY_SERVICE = 'unieaiAccount'

/**
 * The service name the desktop's startup answer is published under.
 *
 * Spelled out for the same reason as {@link GATEWAY_SERVICE}, and pinned to
 * the same kind of annotation: a rename in the startup contract fails this
 * build rather than silently leaving this gateway reading the host itself.
 */
const BOOTSTRAP_SERVICE: typeof BootstrapContract.BOOTSTRAP_SERVICE = 'unieaiBootstrap'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The account seam's Provider, when a build composes one. */
    unieaiAccount: AccountContract.UnieAiAccountGateway
  }
}

/**
 * Required services.
 *
 * `locale` is a hard dependency because every allowance name and failure line
 * this gateway publishes is already-localized text, and the active locale
 * decides which words those are.
 *
 * `unieaiBootstrap` is a hard dependency because it is an ORDERING one, and
 * inject is the only thing in Cordis that orders activation. The startup
 * answer's supplier is still reading while its consumers' bodies run, and a
 * service is not readable with `ctx.get` until its fiber is active — so a
 * gateway that merely looked for it would find nothing, read `/auth/account`
 * itself, and leave the gathered account unused. Waiting is also what makes
 * this gateway's first published state the settled one.
 *
 * The two rows therefore ship together. Dropping the startup row from a
 * composition that keeps this one leaves this fiber pending, which the boot
 * page reports by name.
 */
export const inject = ['locale', BOOTSTRAP_SERVICE]

/**
 * Provide the account gateway and start its first read.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const gateway = new AccountGateway({
    request: (path, init) => globalThis.fetch(path, init),
    navigate: (path) => { globalThis.location.assign(path) },
    reload: () => { globalThis.location.reload() },
  }, ctx.locale.getLocale().active)
  ctx.provide(GATEWAY_SERVICE, gateway)
  ctx.effect(() => () => { gateway.dispose() }, 'unieai-account-gateway: account gateway')

  // Relabelling, not re-reading: the figures are the product's and do not
  // change with the reader's language, but the words around them do.
  ctx.on('locale/change', (snapshot) => { gateway.setLocale(snapshot.active) })

  // The first account comes from the desktop's startup answer, which the host
  // gathered before this document mounted anything: the section opens on an
  // account instead of on a placeholder that fills in. The injection above
  // means it has already settled by the time this line runs, and following it
  // also picks up the one follow-up read a partial answer earns.
  //
  // Everything after that — a profile save, an invite, a retry — still reads
  // `/auth/account` directly, because that is what says what is true now. Both
  // gestures this gateway offers end in a new document — sign-in leaves for
  // the gate's page, sign-out reloads — so the account is read again exactly
  // when it can have changed, and a startup answer that says the host could
  // not be reached is the one case where this gateway reads it itself.
  gateway.followBootstrap(ctx.unieaiBootstrap)
}
