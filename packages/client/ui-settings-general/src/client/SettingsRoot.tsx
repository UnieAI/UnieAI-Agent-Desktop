/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel with its header band and section nav column. The panel reproduces the
 * UnieAI Copilot settings dialog: a band across the full width carrying the
 * heading and its one-line summary, and under it a centred column pair — the
 * 176px nav sticking to the top of the scroll while the section beside it
 * scrolls. The shell is a composition face for everything a registrant owns —
 * the trigger label, panel title, close label, and every section's text
 * arrive through slots; only the nav's group headings and the band's summary
 * line are shell copy, because no registrant owns an arrangement of other
 * registrants. Accessible names resolve to slot content (trigger: its own
 * text; dialog: aria-labelledby the band's heading; close: visually-hidden
 * slot text). Modal open state and the active section id live in the shared
 * panel store, so the Plugins nav row can open this panel at a named section;
 * the onboarding coordinator mounts exactly one ordered registrant while the
 * sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
 * to the step, so a mounted-but-deciding step paints nothing here.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconAgentPresetOutline16, IconApiOutline14, IconBlocksOutline16, IconCloseOutline16,
  IconDataOutline16, IconLinkOutline16, IconPersonalizationOutline16,
  IconSettingsOutline16, IconThinkOutline16, IconUserOutline16,
} from '@unieai/uad-client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import type { SettingsKey } from './locales.ts'
import css from './SettingsRoot.module.css'

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  // The account rows take the same glyphs the account MENU gives them, so one
  // destination keeps one mark whichever way it was reached.
  if (id === 'unieai-account') return <IconUserOutline16 className={css.navIcon} size={16} />
  if (id === 'unieai-usage') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'unieai-invite') return <IconLinkOutline16 className={css.navIcon} size={16} />
  if (id === 'general') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  // API Providers ships a 14-viewBox glyph; `size` scales it to the 16 the
  // other rows use, so the run stays optically even.
  if (id === 'unieai-providers') return <IconApiOutline14 className={css.navIcon} size={16} />
  // Usage already holds the data glyph, and the two rows sat one group apart
  // wearing the same mark; a model is the thing that thinks, not a figure.
  if (id === 'models') return <IconThinkOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconBlocksOutline16 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

/**
 * Nav groups, in the order the UnieAI web product's settings page presents
 * them. Membership is by section id because the ledger carries no group: a
 * feature package registers `settings.section` with an id, an order, and a
 * label, and adding a group option would make every registrant restate an
 * arrangement that belongs to this navigation. A section this map does not
 * name still lists — after the groups, under no heading.
 */
const NAV_GROUPS: readonly { key: string; label: SettingsKey; ids: readonly string[] }[] = [
  { key: 'personal', label: 'nav.group.personal', ids: ['unieai-account', 'unieai-usage', 'unieai-invite', 'general'] },
  { key: 'chat', label: 'nav.group.chat', ids: ['models', 'unieai-providers', 'agent-presets', 'plugins'] },
]

/** One rendered nav run: a heading key (or none) and the rows under it. */
interface NavGroup {
  key: string
  label: string | undefined
  rows: readonly SettingsSectionRow[]
}

/**
 * Arrange the ledger rows into the page's groups.
 * @param rows - the projected section rows, already ordered.
 * @param t - shell copy (group headings).
 * @returns the non-empty groups, ungrouped rows last.
 */
function navGroups(rows: readonly SettingsSectionRow[], t: SettingsRootComponentProps['t']): NavGroup[] {
  const named = new Set(NAV_GROUPS.flatMap(group => [...group.ids]))
  const groups: NavGroup[] = NAV_GROUPS
    .map(group => ({
      key: group.key,
      label: t(group.label),
      rows: rows.filter(row => group.ids.includes(row.id)),
    }))
    .filter(group => group.rows.length > 0)
  const rest = rows.filter(row => !named.has(row.id))
  if (rest.length > 0) groups.push({ key: 'other', label: undefined, rows: rest })
  return groups
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  t: SettingsRootComponentProps['t']
  activeId: string | undefined
  /** Anchor the opener named inside the active section, forwarded verbatim. */
  anchorId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * The modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, t, activeId, anchorId, onSelect, onClose }: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {/* Header band: full panel width, hairline under it, its own content
            held to the reading measure and centred over the columns below.
            The heading is the dialog's accessible name directly — the shell
            owns this dialog element, so there is nothing here to label it
            through a second, visually-hidden copy of the same words. */}
        <div className={css.band}>
          <div className={css.bandInner}>
            <div className={css.bandText}>
              <h1 className={css.title} id={titleId}>{renderSlot('settings.header', {})}</h1>
              <p className={css.subtitle}>{t('subtitle')}</p>
            </div>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
          </div>
        </div>
        <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
          <IconCloseOutline16 size={14} />
          <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
        </button>
        <div className={css.body}>
          <div className={css.bodyInner}>
            <div className={css.columns}>
              <nav className={css.nav}>
                {navGroups(rows, t).map(group => (
                  <div className={css.navGroup} key={group.key}>
                    {group.label !== undefined && <span className={css.navGroupLabel}>{group.label}</span>}
                    <div className={css.navGroupRows}>
                      {group.rows.map(row => (
                        <button
                          key={row.id}
                          type="button"
                          className={clsx(css.navCell, row.id === active && css.active)}
                          aria-current={row.id === active ? 'true' : undefined}
                          onClick={() => { onSelect(row.id) }}
                        >
                          {navIcon(row.id)}
                          <span className={css.navLabel}>{row.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
              <div className={css.content}>
                {active !== undefined && renderSlot(
                  'settings.section',
                  // The anchor only means anything to the section that was asked
                  // for; a fallback selection must not inherit someone else's.
                  { close: onClose, anchor: active === activeId ? anchorId : undefined },
                  { only: active },
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props: SettingsRootComponentProps) {
  const {
    wide, t, useSections, useOnboardingSteps, useSessions, usePanel,
    openPanel, selectSection, closePanel, renderSlot,
  } = props
  // Open state lives in the apply-level panel controller: the Plugins nav row
  // and the sidebar account menu open this same panel from surfaces this
  // component does not render.
  const open = usePanel(s => s.open)
  const activeId = usePanel(s => s.sectionId) ?? undefined
  const anchorId = usePanel(s => s.anchorId) ?? undefined
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const close = useCallback(() => { closePanel() }, [closePanel])
  const openSection = useCallback((id: string) => { openPanel(id) }, [openPanel])

  // The ledger tick keeps the nav rows fresh: registrants re-register with
  // freshly localized text on locale change, and the trigger/header/close
  // seats re-render through their own outlets' subscriptions.
  const rows = useSections(s => s)
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  return (
    <>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.rail)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { openPanel() }}
      >
        {renderSlot('settings.trigger', { wide })}
      </button>
      {open && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          t={t}
          activeId={activeId}
          anchorId={anchorId}
          onSelect={selectSection}
          onClose={close}
        />
      )}
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}
