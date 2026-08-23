/**
 * The sidebar's account occupant — the left of the column's last row, and the
 * one place the person using UnieAI Agent appears. It shares that row box with
 * the settings glyph, so the box belongs to the sidebar foot's identity seat
 * and this component contributes the mark, the name, and the menu they open.
 *
 * The row is a MENU trigger, the way the UnieAI web product's own sidebar foot
 * is: pressing it opens the account menu upward. The settings glyph beside it
 * is a separate control and is not part of this trigger.
 *
 * What the menu contains is decided by the state and by what this composition
 * actually composes — never by the layout. No name, avatar, address, or plan
 * is invented for the empty states, and a row with nothing behind it is not
 * drawn at all (see AccountMenu).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import clsx from 'clsx'
import { IconUserOutline16, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the sidebar's slot declarations (the `sidebar.account` entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
import type { AccountKey } from './locales.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import { monogram } from './monogram.ts'
import type { MenuLocale } from './AccountMenu.tsx'
import { accountMenuAction, accountMenuEntries, selectedLanguageId } from './AccountMenu.tsx'
import css from './SidebarAccountRow.module.css'

/** Active locale plus the locales this build ships. */
export interface AccountLocaleState {
  active: string
  locales: readonly MenuLocale[]
}

/** Injected business face of the account row (slot `inject`). */
export interface SidebarAccountRowInjected {
  hooks: {
    /** Account state, bound by the UI renderer as useAccount. */
    account: AccountSource
    /** Resolved colour scheme, bound as useColorScheme; null with no theme service. */
    colorScheme: HostObservable<'light' | 'dark' | null>
    /** Locale state, bound as useLocaleState. */
    localeState: HostObservable<AccountLocaleState>
    /**
     * Whether a settings panel is composed to open, bound as
     * useSettingsPanel. A live fact rather than an apply-time snapshot:
     * cordis activation order is unconstrained, so the panel may arrive
     * after this row does.
     */
    settingsPanel: HostObservable<boolean>
  }
  /** Start or retry the device-code sign-in. */
  signIn: () => void
  /** Drop the local session (the gateway posts the logout and reloads). */
  signOut: () => void
  /** Open the settings panel on one of this package's three account sections. */
  openAccountSettings: (sectionId: string) => void
  /** Switch the theme preference. */
  setColorScheme: (scheme: 'light' | 'dark') => void
  /** Switch the active locale. */
  setLocale: (locale: string) => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type SidebarAccountRowComponentProps =
  PropsRuntime<'sidebar.account'> & PropsLocale<'settings.account'>
  & InjectFace<SidebarAccountRowInjected>

/** What one account state puts in the row. */
interface RowView {
  /** The row's single line of text. */
  label: string
  /** The longer truth behind that line, shown as the row's tooltip. */
  hint: string
  /** Absolute avatar URL, when the account has one. */
  avatarUrl?: string | undefined
  /** Monogram character, when there is an identity but no avatar. */
  initial?: string | undefined
  /** Whether the label names a person rather than a state. */
  identified: boolean
}

/**
 * Project one account state onto the row.
 * @param state - the current account state.
 * @param t - section copy.
 * @returns what the row draws for that state.
 */
function view(state: UnieAiAccountState, t: Translate<AccountKey>): RowView {
  switch (state.status) {
    case 'signed-in': {
      const { identity } = state.account
      const label = identity.displayName.trim() === '' ? identity.email : identity.displayName
      return {
        label,
        hint: identity.email,
        avatarUrl: identity.avatarUrl,
        initial: monogram(identity),
        identified: true,
      }
    }
    case 'signed-out':
      return { label: t('connect.action'), hint: t('connect.body'), identified: false }
    case 'failed':
      return { label: t('connect.retry'), hint: state.message, identified: false }
    // No gateway in this build: the row is honest about that, and its menu
    // carries only what this composition can actually do.
    default:
      return { label: t('row.signedOut'), hint: t('connect.unavailable'), identified: false }
  }
}

/** Selector for menu items inside one portalled list. */
const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])'

/**
 * Render the sidebar account row and its menu.
 * @param props - composed slot props.
 * @returns the trigger element wrapped in the menu and its tooltip.
 */
export function SidebarAccountRow(props: SidebarAccountRowComponentProps) {
  const {
    wide, t, useAccount, useColorScheme, useLocaleState, useSettingsPanel,
    signIn, signOut, openAccountSettings, setColorScheme, setLocale,
  } = props
  const state: UnieAiAccountState = useAccount(snapshot => snapshot)
  const scheme = useColorScheme(snapshot => snapshot)
  const locales = useLocaleState(snapshot => snapshot)
  const canOpenSettings = useSettingsPanel(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const row = view(state, t)

  const entries = accountMenuEntries({
    state,
    canOpenSettings,
    canSwitchTheme: scheme !== null,
    isDark: scheme === 'dark',
    locales: locales.locales,
    activeLocale: locales.active,
  }, t)

  // Focus return: closing by Escape, by selection, or by an outside click that
  // landed on nothing focusable must not strand focus in a detached list.
  const closeAndRefocus = useCallback(() => {
    const inMenu = document.activeElement?.closest('[role="menu"]') != null
    setOpen(false)
    if (inMenu) trigger.current?.focus()
  }, [])

  // Opening with the keyboard lands on the first row. The primitive portals
  // its list to the body, so the list is found there once it has painted.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const lists = document.body.querySelectorAll<HTMLElement>(':scope > [role="menu"]')
      const list = lists[lists.length - 1]
      list?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus()
    })
    return () => { cancelAnimationFrame(frame) }
  }, [open])

  // Arrow-key roving. React routes events from a portal through the REACT
  // tree, so a keydown in the portalled list bubbles to this wrapper — which
  // is also how the list is identified without guessing at the document.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!open) return
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const target = event.target as HTMLElement
    const list = target.closest('[role="menu"]')
    if (list === null) return
    const items = [...list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)]
    if (items.length === 0) return
    const current = items.indexOf(target.closest<HTMLElement>('[role="menuitem"]') ?? target)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length
    event.preventDefault()
    items[next]?.focus()
  }

  const select = (id: string): void => {
    const action = accountMenuAction(id)
    if (action.kind === 'none') return
    // Appearance is the one row that does not dismiss: the reference calls
    // `preventDefault()` on its select so the menu stays open and the switch
    // can be seen taking effect, and undone without reopening.
    if (action.kind === 'toggleTheme') {
      setColorScheme(scheme === 'dark' ? 'light' : 'dark')
      return
    }
    setOpen(false)
    trigger.current?.focus()
    if (action.kind === 'openSettings') openAccountSettings(action.section)
    else if (action.kind === 'setLocale') setLocale(action.locale)
    else if (action.kind === 'signOut') signOut()
    else signIn()
  }

  const anchor = (
    <Tooltip label={row.hint} side="right" delayMs={500} maxWidth={260} disabled={open}>
      <button
        ref={trigger}
        type="button"
        className={clsx(css.row, !wide && css.rail)}
        aria-label={row.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={clsx(css.avatar, row.avatarUrl !== undefined && css.photo)} aria-hidden>
          {row.avatarUrl !== undefined
            ? <img className={css.avatarImage} src={row.avatarUrl} alt="" />
            : row.initial !== undefined && row.initial !== ''
              ? row.initial
              : <IconUserOutline16 className={css.glyph} size={15} />}
        </span>
        {wide && <span className={clsx(css.name, !row.identified && css.absent)}>{row.label}</span>}
      </button>
    </Tooltip>
  )

  return (
    <div className={clsx(css.menuRoot, !wide && css.rail)} onKeyDown={onKeyDown}>
      <Menu
        open={open}
        anchor={anchor}
        items={entries}
        selectedId={selectedLanguageId(locales.active)}
        onSelect={select}
        onClose={closeAndRefocus}
        side="top"
        align="start"
        portal
        // The reference lifts its menu 8px off the trigger; the primitive's
        // own gap is 4, so the rect it places against is raised by the other
        // 4 rather than the primitive being changed for one caller.
        getAnchorRect={() => {
          const rect = trigger.current?.getBoundingClientRect()
          if (rect === undefined) return null
          return new DOMRect(rect.x, rect.y - 4, rect.width, rect.height)
        }}
      />
    </div>
  )
}
