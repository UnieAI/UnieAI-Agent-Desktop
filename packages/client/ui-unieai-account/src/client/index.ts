/**
 * UnieAI account settings plugin, browser half: registers THREE settings pages
 * over one account state — Account (identity, profile editing, token
 * activity, the session), Regular usage limits, and Invite friends — as the
 * first pages of the settings panel, plus the account row at the sidebar's
 * foot, which is where the same identity appears while the panel is closed.
 *
 * Three pages rather than one page with three anchors: usage and invites are
 * each a topic a reader opens the panel for on its own, and the panel's nav is
 * the only thing that can say so. Every page renders in every account state —
 * a page that vanished when the session did would move the nav rows under the
 * reader's aim and would leave the account menu's row opening whichever page
 * happened to be first.
 *
 * The data comes from a desktop BFF, reached through whatever plugin provides
 * the `unieaiAccount` gateway service (see `src/account-contract.ts`). Until
 * one does, the section renders its not-connected card: this package calls no
 * endpoint and ships no sample account.
 *
 * Appearance and language are deliberately absent — `ui-theme` and `locale`
 * already own those rows in the General section.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the settings slot declarations plus the ctx.settingsScope merge.
// Cross-plugin collaboration goes through slots and services, never a value
// import (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-settings/client'
// Type-only: the sidebar's `sidebar.account` declaration, same rule.
import type {} from '@unieai/uad-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
// Type-only: pulls ctx.theme (appearance row) into this program.
import type {} from '@unieai/uad-client-ui-theme/client'
// Type-only namespace: the settings-panel service name is written as a
// literal below and pinned to the settings base layer's constant, so a rename
// there fails this build without a value import.
import type * as SettingsContract from '@unieai/uad-client-ui-settings/client'
import type { HostObservable } from '@unieai/uad-client-ui-slots'
import type { UnieAiAccountGateway } from '../account-contract.ts'
import { ACCOUNT_GATEWAY_SERVICE } from '../account-contract.ts'
import { AccountSource } from './account-source.ts'
import { AccountSection } from './AccountSection.tsx'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignInGate } from './SignInGate.tsx'
import type { SignInGateInjected } from './SignInGate.tsx'
import { UsageSection } from './UsageSection.tsx'
import type { UsageSectionInjected } from './UsageSection.tsx'
import { InviteSection } from './InviteSection.tsx'
import type { InviteSectionInjected } from './InviteSection.tsx'
import { SidebarAccountRow } from './SidebarAccountRow.tsx'
import type { AccountLocaleState, SidebarAccountRowInjected } from './SidebarAccountRow.tsx'
import { ACCOUNT_SECTION_ID, INVITE_SECTION_ID, USAGE_SECTION_ID } from './AccountMenu.tsx'
import { en, ja, zh, zhTW } from './locales.ts'

export type {
  UnieAiAccount, UnieAiAccountGateway, UnieAiAccountIdentity, UnieAiAccountPlan,
  UnieAiAccountState, UnieAiActivity, UnieAiActivityDay, UnieAiActivityStatId,
  UnieAiActivityStats, UnieAiAvatarUpload, UnieAiInviteRefusal, UnieAiInviteResult,
  UnieAiInvites, UnieAiProfilePatch, UnieAiProfileSaveReason, UnieAiProfileSaveResult,
  UnieAiSentInvite, UnieAiUsageQuota,
} from '../account-contract.ts'
export {
  ACCOUNT_GATEWAY_SERVICE, ACTIVITY_STAT_IDS, PROFILE_SAVE_REASONS,
} from '../account-contract.ts'
export type { AccountSectionComponentProps, AccountSectionInjected } from './AccountSection.tsx'
export type { UsageSectionComponentProps, UsageSectionInjected } from './UsageSection.tsx'
export type { InviteSectionComponentProps, InviteSectionInjected } from './InviteSection.tsx'
export type {
  AccountLocaleState, SidebarAccountRowComponentProps, SidebarAccountRowInjected,
} from './SidebarAccountRow.tsx'
export type { AccountKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.account'

/**
 * Nav positions: the three account pages open the panel, ahead of General (0),
 * and keep the order the account menu lists them in — Account, then usage,
 * then invites. They are adjacent numbers so nothing can slot between them.
 */
const ACCOUNT_ORDER = -10
const USAGE_ORDER = -9
const INVITE_ORDER = -8

/** The settings shell's panel service, when a composition provides one. */
const PANEL_SERVICE: typeof SettingsContract.SETTINGS_PANEL_SERVICE = 'settingsPanel'

/**
 * Required services (cordis fiber inject). `settings.section` is declared by
 * ui-settings-general's apply, whose activation order relative to this one is
 * NOT constrained; the registration waits on the declaration through
 * `slots.inject()`. The account gateway is deliberately not injected: its
 * absence is a state this section renders, not a reason to stay pending.
 */
export const inject = ['slots', 'locale']

/**
 * Register the Account section over whatever account gateway this composition
 * provides, and the section's dictionaries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // All four locales complete. The product's own published wording is still
  // what the keys it publishes carry — `partialZhTW` and `partialJa` hold
  // those lines and the full dictionaries are built over them — but the keys
  // the product has no page for are this package's own words, and translating
  // OUR copy is not inventing the product's. Leaving them out sent a
  // Traditional Chinese or Japanese reader a page half in English.
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-unieai-account: dictionaries',
  )

  // A composition that ships no gateway leaves the source `unavailable`, which
  // is exactly what the not-connected card reports.
  const gateway = ctx.get(ACCOUNT_GATEWAY_SERVICE) as UnieAiAccountGateway | undefined
  const source = new AccountSource(gateway)
  ctx.effect(() => () => { source.dispose() }, 'ui-unieai-account: account source')

  // Reading the store once is not enough: activation order across packages is
  // not constrained, so a gateway registered by another plugin can land after
  // this apply. Without this the section reports "no sign-in in this build"
  // while a live gateway sits beside it, already holding the account.
  ctx.effect(() => ctx.on('internal/service', () => {
    const late = ctx.get(ACCOUNT_GATEWAY_SERVICE) as UnieAiAccountGateway | undefined
    if (late !== undefined) source.attach(late)
  }), 'ui-unieai-account: adopt a late gateway')

  // Registration-time text (the nav label thunk) and the inject face share one
  // bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS)
  // The section's own locale seat translates its copy; this observable carries
  // the locale ID itself, which the heatmap's month ruler needs because twelve
  // month names per language belong in locale data rather than in a section
  // dictionary. A primitive snapshot, so uSES identity holds without caching.
  const activeLocale: HostObservable<string> = {
    getSnapshot: () => ctx.locale.getLocale().active,
    subscribe: listener => ctx.locale.subscribe(listener),
  }
  const accountInjected = (): AccountSectionInjected => ({
    hooks: { account: source, activeLocale },
    signIn: () => { source.signIn() },
    signOut: () => { source.signOut() },
    saveProfile: patch => source.saveProfile(patch),
  })
  const gateInjected = (): SignInGateInjected => ({
    hooks: { account: source },
    signIn: () => { source.signIn() },
  })
  const usageInjected = (): UsageSectionInjected => ({
    hooks: { account: source },
    signIn: () => { source.signIn() },
  })
  const inviteInjected = (): InviteSectionInjected => ({
    hooks: { account: source },
    signIn: () => { source.signIn() },
    // Bound to the source rather than to a gateway read here: this face is
    // built once per entry, and a gateway can activate after it.
    sendInvite: email => source.sendInvite(email),
  })

  // The sign-in gate takes the whole surface while nobody is signed in. It is
  // a shell overlay rather than a settings step because it is not a step: it
  // is the state of the application, and the ordinary interface behind it can
  // answer nothing without an account.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'sign-in-gate',
    // Above every other overlay: a surface that opens over the gate would be a
    // second thing to dismiss before the one that has to happen first.
    order: 1000,
    locale: NS,
    inject: gateInjected,
  }, SignInGate))

  // One generator, so the three pages install and roll back together: a
  // composition holding two of them is a nav that lies about what it has.
  ctx.slots.inject('settings.section', function* () {
    yield ctx.slots.register({
      name: 'settings.section',
      id: ACCOUNT_SECTION_ID,
      order: ACCOUNT_ORDER,
      label: () => t('nav'),
      locale: NS,
      inject: accountInjected,
    }, AccountSection)
    yield ctx.slots.register({
      name: 'settings.section',
      id: USAGE_SECTION_ID,
      order: USAGE_ORDER,
      // The nav row and the account-menu row that opens it say the same thing,
      // from the same key: one page named two ways reads as two pages.
      label: () => t('menu.usage'),
      locale: NS,
      inject: usageInjected,
    }, UsageSection)
    yield ctx.slots.register({
      name: 'settings.section',
      id: INVITE_SECTION_ID,
      order: INVITE_ORDER,
      label: () => t('menu.invite'),
      locale: NS,
      inject: inviteInjected,
    }, InviteSection)
  })

  // The sidebar foot reads the same source: one account state, two views of
  // it. The row is a menu trigger, and every row in that menu is wired to a
  // capability this composition actually composes — a service that is absent
  // takes its rows with it rather than leaving something that does nothing.
  //
  // Neither optional service is snapshotted here. Cordis activation order is
  // unconstrained, so a service read once at apply is a coin toss: the panel
  // and the theme both activate independently of this plugin, and reading
  // them early is how the three personal rows silently went missing. Presence
  // is a live fact instead, republished on every service change, so a row
  // appears the moment what it opens does.
  const serviceChanges = (listener: () => void): (() => void) => ctx.on('internal/service', listener)
  // Primitive snapshots, so uSES identity holds without caching.
  const colorScheme: HostObservable<'light' | 'dark' | null> = {
    getSnapshot: () => ctx.get('theme')?.getTheme().active.colorScheme ?? null,
    subscribe: (listener) => {
      const offTheme = ctx.on('theme/change', listener)
      const offService = serviceChanges(listener)
      return () => {
        offTheme()
        offService()
      }
    },
  }
  const settingsPanel: HostObservable<boolean> = {
    getSnapshot: () => ctx.get(PANEL_SERVICE) !== undefined,
    subscribe: serviceChanges,
  }
  // The locale snapshot is frozen and replaced per change, so the projection
  // is cached against its revision to keep one reference between changes.
  let localeRevision = -1
  let localeState: AccountLocaleState = { active: '', locales: [] }
  const localeSource: HostObservable<AccountLocaleState> = {
    getSnapshot: () => {
      const snapshot = ctx.locale.getSnapshot()
      if (snapshot.revision !== localeRevision) {
        localeRevision = snapshot.revision
        localeState = {
          active: snapshot.active,
          locales: snapshot.locales.map(locale => ({ id: locale.id, label: locale.label })),
        }
      }
      return localeState
    },
    subscribe: listener => ctx.locale.subscribe(listener),
  }
  const rowInjected = (): SidebarAccountRowInjected => ({
    hooks: { account: source, colorScheme, localeState: localeSource, settingsPanel },
    signIn: () => { source.signIn() },
    signOut: () => { source.signOut() },
    // Profile / Usage / Invite friends are three settings pages, exactly as
    // they are three tabs in the reference's own settings dialog.
    openAccountSettings: (sectionId: string) => { ctx.get(PANEL_SERVICE)?.open(sectionId) },
    setColorScheme: (next: 'light' | 'dark') => { ctx.get('theme')?.setTheme(next) },
    setLocale: (locale: string) => { ctx.locale.setLocale(locale) },
  })
  ctx.slots.inject('sidebar.account', () => ctx.slots.register({
    name: 'sidebar.account',
    locale: NS,
    inject: rowInjected,
  }, SidebarAccountRow))
}
