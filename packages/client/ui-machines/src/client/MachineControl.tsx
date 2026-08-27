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
import type { MachineState, MachineView } from './machine-view.ts'
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
  const { t, useMachines, refresh, select, openConfig } = props
  const state: MachineState = useMachines(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const current = state.machines.find(machine => machine.id === state.current)
  const remote = state.current !== 'local'
  const name = current?.label ?? (remote ? state.current : t('local'))

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      // Read on open, not on mount: the list comes from a file the person
      // edits outside Rabi, so this is the moment it can be stale.
      if (!wasOpen) void refresh()
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
            <button
              key={machine.id}
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
            </button>
          ))}
          {state.machines.filter(machine => machine.kind === 'ssh').length === 0 && (
            <div className={css['footer']}>{t('none')}</div>
          )}
          {state.error !== '' && <div className={css['error']}>{state.error}</div>}
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
