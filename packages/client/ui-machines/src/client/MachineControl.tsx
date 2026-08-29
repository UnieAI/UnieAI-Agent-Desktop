/**
 * The machine a conversation's work happens on, shown where the work is
 * started.
 *
 * It sits at the end of the composer's tool row, in the icon cluster beside
 * send, because where work runs is a standing fact about the composer rather
 * than something to read on the way into a turn. The seat is a resident one
 * rather than the session-scoped row, so the control is there from cold start
 * — which folders a person can even pick depends on this answer.
 *
 * A remote machine is visibly different from this computer without opening
 * anything: the trigger is a bare icon on this computer and grows the
 * machine's name the moment work is leaving it. That is not decoration —
 * work leaving someone's own machine is not a detail to discover in a menu,
 * and an icon alone cannot say which machine.
 *
 * ADDING AND REMOVING ARE DIALOGS, not rows that grow inside the menu. Both
 * write to the person's own SSH configuration, which is a different kind of
 * act from picking where the next command runs: a five-field form unfolding
 * inside a list of machines pushes the machines it is about off the bottom,
 * and a confirmation rendered as one more row can be dismissed by the same
 * outside click that dismisses the menu. The dialog closes the menu, states
 * what it will write, and has one way out.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconChevronDownOutline14, IconTrashOutline16, Input, Modal } from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: the composer seat is declared by the conversation package.
import type {} from '@unieai/uad-client-ui-conversation/client'
import type { MachineDraft, MachineState, MachineView } from './machine-view.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge.
import type {} from './locales.ts'
import css from './MachineControl.module.css'

/** What the control needs, bound at registration. */
export interface MachineControlInjected {
  hooks: {
    /** The live machine list and current choice. */
    machines: MachineView
  }
  /** Read the machine list; called when the menu opens. */
  refresh: () => Promise<void>
  /** Work on another machine. */
  select: (machine: string) => Promise<void>
  /** Write one into the person's own configuration; false when it was refused. */
  add: (draft: MachineDraft) => Promise<boolean>
  /** Remove one from it. */
  remove: (machine: string) => Promise<void>
  /** Ask whether one answers right now. */
  probe: (machine: string) => Promise<void>
  /** Open the SSH configuration file in the person's own editor, when the host can. */
  openConfig?: (() => Promise<void>) | undefined
}

/** Full component props: composer seat + locale + injected face. */
export type MachineControlProps =
  PropsRuntime<'conversation.input.chrome.end'> & PropsLocale<'conversation.machine'>
  & InjectFace<MachineControlInjected>

/** A laptop, at the row's icon size. Local work: this computer. */
function GlyphHere({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3" width="11" height="7.5" rx="1.2" />
      <path d="M1.2 13h13.6" />
    </svg>
  )
}

/** Two stacked bays: a machine that is not this one. */
function GlyphThere({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="4.5" rx="1.2" />
      <rect x="2" y="9" width="12" height="4.5" rx="1.2" />
      <path d="M4.4 4.75h.01M4.4 11.25h.01" />
    </svg>
  )
}

/** A network address. */
function GlyphAddress({ size = 15 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
      <path d="M1.9 8h12.2" />
    </svg>
  )
}

/** An account on the far machine. */
function GlyphAccount({ size = 15 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="5.4" r="2.9" />
      <path d="M2.6 13.6c.9-2.6 2.9-3.9 5.4-3.9s4.5 1.3 5.4 3.9" />
    </svg>
  )
}

/** A key file. */
function GlyphKey({ size = 15 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.3" cy="5.7" r="3.3" />
      <path d="M8 8l-6 6v1.4h2.4v-1.6h1.6v-1.6h1.6" />
    </svg>
  )
}

/** A port on a connection. */
function GlyphPort({ size = 15 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 9.4 4 12a2.3 2.3 0 1 0 3.2 3.2" />
      <path d="M9.4 6.6 12 4a2.3 2.3 0 1 0-3.2-3.2" />
      <path d="M6 10l4-4" />
    </svg>
  )
}

/**
 * The picture at the top of the add dialog: this computer, a connection, and
 * the machine being added.
 *
 * It is here because the words below it assume a person already knows what
 * adding a machine MEANS. Two boxes and a line say it before the first field
 * is read, and a person who does know loses nothing to it.
 * @param props.t - locale reader for the two captions.
 * @returns the illustration.
 */
function AddIllustration({ t }: { t: MachineControlProps['t'] }): ReactNode {
  return (
    <div className={css['pic']}>
      <div className={css['picNode']}>
        <div className={css['picBox']}><GlyphHere size={22} /></div>
        <span>{t('addHere')}</span>
      </div>
      <div className={css['picWire']} aria-hidden="true"><i className={css['picPulse']} /></div>
      <div className={css['picNode']}>
        <div className={css['picBox']}><GlyphThere size={22} /></div>
        <span>{t('addThere')}</span>
      </div>
    </div>
  )
}

/**
 * The configuration lines a draft would append, exactly as `addHost` writes
 * them.
 *
 * Only filled fields produce a line — the rule the writer already follows,
 * because an option written with its default reads as a decision and the next
 * person to open the file cannot tell it from one. That rule was invisible
 * until it was drawn.
 * @param draft - the machine being written down.
 * @returns the lines, alias first.
 */
export function previewLines(draft: MachineDraft): readonly string[] {
  const alias = draft.alias.trim()
  if (alias === '') return []
  // One token: a name with spaces would read as several Host patterns.
  const lines = [`Host ${alias.replace(/\s+/gu, '-')}`]
  const push = (key: string, value: string | undefined): void => {
    const text = value?.trim() ?? ''
    if (text !== '') lines.push(`  ${key} ${text}`)
  }
  push('HostName', draft.hostName)
  push('User', draft.user)
  push('Port', draft.port === undefined ? undefined : String(draft.port))
  push('IdentityFile', draft.identityFile)
  return lines
}

/**
 * Render the machine control.
 * @param props - composed slot props.
 * @returns the chip, its menu while open, and whichever dialog is showing.
 */
export function MachineControl(props: MachineControlProps): ReactNode {
  const { t, useMachines, refresh, select, add, remove, probe, openConfig } = props
  const state: MachineState = useMachines(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<MachineDraft>({ alias: '' })
  const [confirming, setConfirming] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const current = state.machines.find(machine => machine.id === state.current)
  const remote = state.current !== 'local'
  const name = current?.label ?? (remote ? state.current : t('local'))
  const target = state.machines.find(machine => machine.id === confirming)

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      // Read on open, not on mount: the list comes from a file the person
      // edits outside Rabi, so this is the moment it can be stale.
      if (!wasOpen) void refresh()
      return !wasOpen
    })
  }, [refresh])

  // A dialog owns the screen, so the menu behind it closes; the dialogs
  // render from this component either way, portalled out of the menu.
  const openAdd = useCallback(() => { setOpen(false); setAdding(true) }, [])
  const openRemove = useCallback((machine: string) => { setOpen(false); setConfirming(machine) }, [])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const lines = previewLines(draft)

  const field = (
    key: 'addAlias' | 'addHostName' | 'addUser' | 'addPort' | 'addKey',
    hint: 'addAliasHint' | 'addHostNameHint' | 'addUserHint' | 'addPortHint' | 'addKeyHint',
    icon: ReactNode,
    value: string,
    onChange: (next: string) => void,
    options: { optional?: boolean; numeric?: boolean; autoFocus?: boolean } = {},
  ): ReactNode => (
    <label className={css['field']}>
      <span className={css['fieldLabel']}>
        {t(key)}
        {options.optional === true && <span className={css['fieldOptional']}>{t('optional')}</span>}
      </span>
      <Input
        icon={icon}
        className={css['fieldInput'] as string}
        value={value}
        aria-label={t(key)}
        {...options.numeric === true ? { inputMode: 'numeric' as const } : {}}
        {...options.autoFocus === true ? { autoFocus: true } : {}}
        onChange={(event) => { onChange(event.target.value) }}
      />
      <span className={css['fieldHint']}>{t(hint)}</span>
    </label>
  )

  return (
    <div className={css['control']} ref={box}>
      <button
        type="button"
        className={css['chip']}
        data-remote={remote}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('label')}: ${name}`}
        onClick={toggle}
      >
        {remote ? <GlyphThere /> : <GlyphHere />}
        {(remote || state.busy) && <span className={css['name']}>{state.busy ? t('busy') : name}</span>}
      </button>
      {open && (
        <div className={css['menu']} role="menu">
          <div className={css['list']}>
            {state.machines.map(machine => (
              <div key={machine.id} className={css['row']}>
                <button
                  type="button"
                  role="menuitem"
                  className={css['item']}
                  aria-pressed={machine.id === state.current}
                  onClick={() => {
                    setOpen(false)
                    void select(machine.id)
                  }}
                >
                  <span className={css['itemGlyph']}>
                    {machine.kind === 'local' ? <GlyphHere size={14} /> : <GlyphThere size={14} />}
                  </span>
                  <span className={css['itemName']}>{machine.id === 'local' ? t('local') : machine.label}</span>
                  {state.reachable[machine.id] !== undefined && (
                    <span className={css['itemKind']} data-ok={state.reachable[machine.id]?.ok === true}>
                      {state.reachable[machine.id]?.ok === true ? t('reachable') : t('unreachable')}
                    </span>
                  )}
                </button>
                {machine.kind === 'ssh' && (
                  <>
                    <button
                      type="button"
                      className={css['rowAction']}
                      aria-label={`${t('test')} ${machine.label}`}
                      onClick={() => { void probe(machine.id) }}
                    >
                      {t('test')}
                    </button>
                    <button
                      type="button"
                      className={css['rowAction']}
                      aria-label={`${t('remove')} ${machine.label}`}
                      onClick={() => { openRemove(machine.id) }}
                    >
                      {t('remove')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {state.machines.filter(machine => machine.kind === 'ssh').length === 0 && (
            <div className={css['footer']}>{t('none')}</div>
          )}
          {state.error !== '' && <div className={css['error']}>{state.error}</div>}
          <button type="button" role="menuitem" className={css['item']} onClick={openAdd}>
            <span className={css['itemGlyph']}><GlyphThere size={14} /></span>
            <span className={css['itemName']}>{t('add')}</span>
          </button>
          {openConfig !== undefined && (
            <button type="button" role="menuitem" className={css['item']} onClick={() => { void openConfig() }}>
              <span className={css['itemName']}>{t('openConfig')}</span>
            </button>
          )}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => { setAdding(false) }}
        title={t('addTitle')}
        closeLabel={t('close')}
        className={css['addDialog'] as string}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setAdding(false) }}>{t('addCancel')}</Button>
            <Button
              variant="primary"
              disabled={draft.alias.trim() === '' || state.busy}
              onClick={() => {
                void add(draft).then((accepted) => {
                  // A refused draft stays on screen: it is still the person's
                  // work, and clearing it would make them retype everything
                  // to fix one field.
                  if (!accepted) return
                  setAdding(false)
                  setDraft({ alias: '' })
                })
              }}
            >
              {t('addSubmit')}
            </Button>
          </>
        )}
      >
        <AddIllustration t={t} />
        <p className={css['dialogIntro']}>{t('addIntro')}</p>
        <div className={css['fields']}>
          {field('addAlias', 'addAliasHint', <GlyphThere size={15} />, draft.alias,
            (next) => { setDraft({ ...draft, alias: next }) }, { autoFocus: true })}
          {field('addHostName', 'addHostNameHint', <GlyphAddress />, draft.hostName ?? '',
            (next) => { setDraft({ ...draft, hostName: next }) })}
          {field('addUser', 'addUserHint', <GlyphAccount />, draft.user ?? '',
            (next) => { setDraft({ ...draft, user: next }) }, { optional: true })}

          <details className={css['advanced']}>
            <summary className={css['advancedSummary']}>
              <span className={css['chevron']} aria-hidden="true">
                <IconChevronDownOutline14 />
              </span>
              {t('addAdvanced')}
            </summary>
            <div className={css['advancedBody']}>
              {field('addPort', 'addPortHint', <GlyphPort />, draft.port === undefined ? '' : String(draft.port),
                (next) => {
                  const port = Number.parseInt(next, 10)
                  // A cleared field means "no port", which is not the same as
                  // port zero: the option is left unwritten.
                  const { port: _dropped, ...rest } = draft
                  setDraft(Number.isFinite(port) ? { ...rest, port } : rest)
                }, { optional: true, numeric: true })}
              {field('addKey', 'addKeyHint', <GlyphKey />, draft.identityFile ?? '',
                (next) => { setDraft({ ...draft, identityFile: next }) }, { optional: true })}
              <div className={css['preview']}>
                <div className={css['previewHead']}>{t('addPreview')}</div>
                <pre className={css['previewBody']} aria-live="polite">
                  {lines.length === 0 ? t('addPreviewEmpty') : lines.join('\n')}
                </pre>
              </div>
            </div>
          </details>
        </div>
        {state.error !== '' && <div className={css['dialogError']}>{state.error}</div>}
      </Modal>

      <Modal
        open={confirming !== ''}
        onClose={() => { setConfirming('') }}
        title={t('removeTitle')}
        closeLabel={t('close')}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setConfirming('') }}>{t('addCancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                const machine = confirming
                setConfirming('')
                void remove(machine)
              }}
            >
              {t('removeSubmit')}
            </Button>
          </>
        )}
      >
        <div className={css['warnPic']} aria-hidden="true">
          <span className={css['warnBadge']}><IconTrashOutline16 size={22} /></span>
        </div>
        <p className={css['dialogIntro']}>{t('removeIntro', { machine: target?.label ?? confirming })}</p>
        <div className={css['target']}>
          {target?.label ?? confirming}
          {target?.source !== undefined && <span>{t('removeSource', { path: target.source })}</span>}
        </div>
        <p className={css['fieldHint']}>{t('removeDetail')}</p>
      </Modal>
    </div>
  )
}
