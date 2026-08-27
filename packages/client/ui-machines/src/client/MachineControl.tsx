/**
 * The machine a conversation's work happens on, shown where the work is
 * started.
 *
 * It sits in the composer's tool row beside the workspace chip, because the
 * machine belongs to the same question as the working directory: where does
 * what I am about to ask actually run. The seat is the resident one rather
 * than the session-scoped row, so the control is there from cold start —
 * which folders a person can even pick depends on this answer.
 *
 * A remote machine is visibly different from this computer without opening
 * anything: work leaving someone's own machine is not a detail to discover
 * in a menu.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
  PropsRuntime<'conversation.input.chrome'> & PropsLocale<'conversation.machine'>
  & InjectFace<MachineControlInjected>

/**
 * Render the machine control.
 * @param props - composed slot props.
 * @returns the chip, and its menu while open.
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

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      // Read on open, not on mount: the list comes from a file the person
      // edits outside Rabi, so this is the moment it can be stale.
      if (!wasOpen) void refresh()
      // A menu that reopened mid-edit would show a form nobody asked for.
      if (wasOpen) { setAdding(false); setConfirming('') }
      return !wasOpen
    })
  }, [refresh])

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
        <span className={css['dot']} aria-hidden="true" />
        <span className={css['name']}>{state.busy ? t('busy') : name}</span>
      </button>
      {open && (
        <div className={css['menu']} role="menu">
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
                <span>{machine.id === 'local' ? t('local') : machine.label}</span>
                {machine.kind === 'ssh' && <span className={css['itemKind']}>ssh</span>}
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
                    onClick={() => { setConfirming(machine.id) }}
                  >
                    {t('remove')}
                  </button>
                </>
              )}
            </div>
          ))}
          {state.machines.filter(machine => machine.kind === 'ssh').length === 0 && !adding && (
            <div className={css['footer']}>{t('none')}</div>
          )}
          {confirming !== '' && (
            <div className={css['confirm']}>
              <span>{t('removeConfirm', { machine: confirming })}</span>
              <button
                type="button"
                className={css['rowAction']}
                onClick={() => {
                  const machine = confirming
                  setConfirming('')
                  void remove(machine)
                }}
              >
                {t('remove')}
              </button>
              <button type="button" className={css['rowAction']} onClick={() => { setConfirming('') }}>
                {t('addCancel')}
              </button>
            </div>
          )}
          {state.error !== '' && <div className={css['error']}>{state.error}</div>}
          {adding
            ? (
              <form
                className={css['form']}
                onSubmit={(event) => {
                  event.preventDefault()
                  void add(draft).then((accepted) => {
                    // A refused draft stays on screen: it is still the
                    // person's work, and clearing it would make them retype
                    // everything to fix one field.
                    if (!accepted) return
                    setAdding(false)
                    setDraft({ alias: '' })
                  })
                }}
              >
                <input
                  className={css['field']}
                  placeholder={t('addAlias')}
                  aria-label={t('addAlias')}
                  value={draft.alias}
                  autoFocus
                  onChange={(event) => { setDraft({ ...draft, alias: event.target.value }) }}
                />
                <input
                  className={css['field']}
                  placeholder={t('addHostName')}
                  aria-label={t('addHostName')}
                  value={draft.hostName ?? ''}
                  onChange={(event) => { setDraft({ ...draft, hostName: event.target.value }) }}
                />
                <div className={css['fieldRow']}>
                  <input
                    className={css['field']}
                    placeholder={t('addUser')}
                    aria-label={t('addUser')}
                    value={draft.user ?? ''}
                    onChange={(event) => { setDraft({ ...draft, user: event.target.value }) }}
                  />
                  <input
                    className={css['field']}
                    placeholder={t('addPort')}
                    aria-label={t('addPort')}
                    inputMode="numeric"
                    value={draft.port === undefined ? '' : String(draft.port)}
                    onChange={(event) => {
                      const port = Number.parseInt(event.target.value, 10)
                      // A cleared field means "no port", which is not the
                      // same as port zero: the option is left unwritten.
                      const { port: _dropped, ...rest } = draft
                      setDraft(Number.isFinite(port) ? { ...rest, port } : rest)
                    }}
                  />
                </div>
                <input
                  className={css['field']}
                  placeholder={t('addKey')}
                  aria-label={t('addKey')}
                  value={draft.identityFile ?? ''}
                  onChange={(event) => { setDraft({ ...draft, identityFile: event.target.value }) }}
                />
                <div className={css['footer']}>{t('addHint')}</div>
                <div className={css['fieldRow']}>
                  <button type="submit" className={css['rowAction']} disabled={draft.alias.trim() === ''}>
                    {t('addSubmit')}
                  </button>
                  <button type="button" className={css['rowAction']} onClick={() => { setAdding(false) }}>
                    {t('addCancel')}
                  </button>
                </div>
              </form>
            )
            : (
              <button type="button" role="menuitem" className={css['item']} onClick={() => { setAdding(true) }}>
                {t('add')}
              </button>
            )}
          <div className={css['footer']}>{t('configHint')}</div>
          {openConfig !== undefined && (
            <button type="button" role="menuitem" className={css['item']} onClick={() => { void openConfig() }}>
              {t('openConfig')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
