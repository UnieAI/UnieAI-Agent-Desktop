/**
 * The account menu: the popup the sidebar's identity row opens, and the same
 * menu the UnieAI web product's own sidebar foot opens.
 *
 * Every row here is wired to something dsh already has. Nothing is drawn for
 * a capability this build lacks: the header prints only what the account
 * source actually reports, and Sign out exists only while a session does —
 * a menu row that would do nothing is worse than an absent one.
 *
 * Platform administration is absent for the reason it is absent in the
 * reference: that row is already conditional on `isAdmin` there, and this is
 * the personal edition, so the condition is never true and the branch does
 * not exist. Nothing was removed.
 */
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  IconCheckOutline16, IconChevronRightOutline14, IconDataOutline16, IconGlobeOutline14,
  IconLightOutline16, IconLinkOutline16, IconPersonalizationOutline16,
  IconRightUpOutline16, IconUserOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountKey } from './locales.ts'
import css from './AccountMenu.module.css'

/**
 * The three settings sections the personal rows open. Each row opens a page of
 * its own rather than scrolling one page to a position in it: the panel's nav
 * is the tab strip here, so a row that landed mid-page would leave the nav
 * pointing at a heading the reader is no longer looking at.
 */
export const ACCOUNT_SECTION_ID = 'unieai-account'
export const USAGE_SECTION_ID = 'unieai-usage'
export const INVITE_SECTION_ID = 'unieai-invite'

/** Menu row ids. Ids are the menu's own vocabulary, not a slot contract. */
export const MENU_IDS = {
  profile: 'account.profile',
  usage: 'account.usage',
  invite: 'account.invite',
  appearance: 'account.appearance',
  language: 'account.language',
  signOut: 'account.signOut',
  signIn: 'account.signIn',
} as const

/** Prefix marking a language submenu row; the suffix is the locale id. */
export const LANGUAGE_PREFIX = 'account.language.'

/** One locale the menu can switch to. */
export interface MenuLocale {
  id: string
  label: string
}

/** Everything the menu needs to decide what it contains. */
export interface AccountMenuModel {
  /** Current account state; decides the header and whether Sign out exists. */
  state: UnieAiAccountState
  /** Whether a settings panel is composed to open (the three personal rows). */
  canOpenSettings: boolean
  /** Whether the theme service is composed (the appearance row). */
  canSwitchTheme: boolean
  /** True while the resolved theme is dark, so the row offers the other one. */
  isDark: boolean
  /** Locales the language submenu offers; empty hides the row. */
  locales: readonly MenuLocale[]
  /** Active locale id, shown as the submenu's selection. */
  activeLocale: string
}

/**
 * Build the menu's entries for one model, in the reference's own order:
 * header, Profile, Usage, Invite friends, appearance, Language, then the
 * separator and Sign out.
 *
 * @param model - what this composition can actually do.
 * @param t - section copy.
 * @returns the ordered entries, header first.
 */
export function accountMenuEntries(model: AccountMenuModel, t: Translate<AccountKey>): MenuEntry[] {
  const entries: MenuEntry[] = []

  // Header: the address the session belongs to, then the plan. Both come from
  // the account, so an account that reports neither contributes no header.
  // The other states head the menu with the gesture they actually offer,
  // which is how the sidebar keeps a way in to sign-in now that the row
  // itself opens a menu instead of starting one.
  if (model.state.status === 'signed-in') {
    const { identity, plan } = model.state.account
    // The address, not a handle: the product reports none, and deriving one
    // from the address would only print the address with a decoration.
    const who = identity.email
    // One label carrying both, so the plan reads as the reference's bordered
    // badge beside the address rather than as a second nameless line.
    if (who !== '') {
      entries.push({
        type: 'label',
        id: 'account.who',
        text: (
          <>
            <span className={css.address}>{who}</span>
            {plan.label !== '' && <span className={css.plan}>{plan.label}</span>}
          </>
        ),
      })
    }
  } else if (model.state.status === 'signed-out' || model.state.status === 'failed') {
    entries.push(
      {
        id: MENU_IDS.signIn,
        label: model.state.status === 'failed' ? t('connect.retry') : t('connect.action'),
        icon: <IconUserOutline16 />,
      },
      // An action, not a header: the rule keeps it out of the personal group.
      { type: 'separator', id: 'account.signInRule' },
    )
  }

  if (model.canOpenSettings) {
    entries.push(
      { id: MENU_IDS.profile, label: t('menu.profile'), icon: <IconPersonalizationOutline16 /> },
      { id: MENU_IDS.usage, label: t('menu.usage'), icon: <IconDataOutline16 /> },
      { id: MENU_IDS.invite, label: t('menu.invite'), icon: <IconLinkOutline16 /> },
    )
  }

  if (model.canSwitchTheme) {
    entries.push({
      id: MENU_IDS.appearance,
      // The row names the mode it switches TO, the way the reference does.
      label: model.isDark ? t('menu.lightMode') : t('menu.darkMode'),
      icon: <IconLightOutline16 />,
    })
  }

  if (model.locales.length > 0) {
    entries.push({
      id: MENU_IDS.language,
      // The primitive draws no affordance on a submenu parent, so the row
      // carries the reference's own indicator inside its label.
      label: (
        <span className={css.rowLabel}>
          <span className={css.rowText}>{t('menu.language')}</span>
          <IconChevronRightOutline14 className={css.chevron} />
        </span>
      ),
      icon: <IconGlobeOutline14 />,
      submenu: model.locales.map(locale => ({
        id: `${LANGUAGE_PREFIX}${locale.id}`,
        // The primitive's selection check reaches top-level rows only, and
        // "which language am I on?" is exactly what this submenu answers.
        label: (
          <span className={css.rowLabel}>
            <span className={css.rowText}>{locale.label}</span>
            {locale.id === model.activeLocale && <IconCheckOutline16 className={css.check} />}
          </span>
        ),
      })),
    })
  }

  // Sign out exists only while a session does. With no gateway composed there
  // is nothing to sign out of, and the row would be a lie.
  if (model.state.status === 'signed-in') {
    entries.push(
      { type: 'separator', id: 'account.signOutRule' },
      { id: MENU_IDS.signOut, label: t('menu.signOut'), icon: <IconRightUpOutline16 />, danger: true },
    )
  }
  return entries
}

/**
 * The submenu selection the menu shows: the active locale's row.
 * @param activeLocale - the active locale id.
 * @returns the selected entry id.
 */
export function selectedLanguageId(activeLocale: string): string {
  return `${LANGUAGE_PREFIX}${activeLocale}`
}

/** What a selected row asks the row component to do. */
export type AccountMenuAction =
  | { kind: 'openSettings'; section: string }
  | { kind: 'toggleTheme' }
  | { kind: 'setLocale'; locale: string }
  | { kind: 'signOut' }
  | { kind: 'signIn' }
  | { kind: 'none' }

/**
 * Resolve a selected row id into the gesture it stands for.
 * @param id - the selected entry id.
 * @returns the action, or `none` for a row that only opens a submenu.
 */
export function accountMenuAction(id: string): AccountMenuAction {
  if (id === MENU_IDS.profile) return { kind: 'openSettings', section: ACCOUNT_SECTION_ID }
  if (id === MENU_IDS.usage) return { kind: 'openSettings', section: USAGE_SECTION_ID }
  if (id === MENU_IDS.invite) return { kind: 'openSettings', section: INVITE_SECTION_ID }
  if (id === MENU_IDS.appearance) return { kind: 'toggleTheme' }
  if (id === MENU_IDS.signOut) return { kind: 'signOut' }
  if (id === MENU_IDS.signIn) return { kind: 'signIn' }
  if (id.startsWith(LANGUAGE_PREFIX)) return { kind: 'setLocale', locale: id.slice(LANGUAGE_PREFIX.length) }
  return { kind: 'none' }
}
