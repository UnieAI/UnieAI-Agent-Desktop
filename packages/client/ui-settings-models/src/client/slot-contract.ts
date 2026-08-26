/**
 * The `settings.models.account` slot — provider lists this desktop does NOT
 * own, rendered above its own rows on the Models page.
 *
 * One page, two kinds of provider, because the difference is not cosmetic: a
 * row on this page keeps its key on this machine and calls the endpoint
 * directly, while an account row keeps its key on the product's server, is
 * metered there, and follows the person to every other client signed into the
 * same account. Two separate pages made those look like two ways to do one
 * thing, and nothing on either said which one a message would be billed
 * through.
 *
 * A list slot rather than a keyed one: the page dispatches once and stacks
 * whatever registered, so a deployment with no account plugin renders its own
 * rows alone and nothing here has to know that happened.
 *
 * TYPE HOME RATIONALE: the Models page declares this slot at runtime, and a
 * plugin registering into it already depends on this package for the
 * declaration. The type therefore lives with its declarer.
 */
declare module '@unieai/uad-client-ui-slots' {
  interface SlotMap {
    /** An account-owned provider list inside the Models page (see module JSDoc). */
    'settings.models.account': { kind: 'list'; scope: 'root'; owner: ModelsAccountOwnerProps }
  }
}

/** Owner share of an account provider list: the page supplies nothing. */
export interface ModelsAccountOwnerProps {
  /** Marker field: the owner share is intentionally empty. */
  children?: never
}
