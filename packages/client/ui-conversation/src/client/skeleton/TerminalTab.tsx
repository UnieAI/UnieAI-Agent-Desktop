/**
 * The terminal panel: xterm.js over one Host-owned shell.
 *
 * The renderer is xterm.js because a terminal is not a text box — a shell and
 * the full-screen programs it runs address the cursor, repaint regions, swap
 * to an alternate screen and colour by escape sequence, and anything less than
 * a real emulator turns `vim`, `htop` and even a coloured prompt into rubbish
 * on screen.
 *
 * The shell lives on the Host, not here. This component mounts a view of one,
 * and unmounting it does not end it: closing the tab and reopening it repaints
 * from what the Host retained, which is the behaviour that makes it safe to
 * put a long-running command in here.
 *
 * xterm's own stylesheet is NOT imported here. It is a global sheet whose
 * class names xterm writes into the DOM itself, so CSS modules would rename it
 * out from under the renderer; and this package is built by tsdown, which does
 * not resolve a bare package specifier for CSS. The app shell loads it — see
 * `apps/web/src/main.ts`, which vite builds and which is where third-party
 * global CSS belongs.
 */

import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { TerminalView } from '@unieai/uad-api-remotes/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import css from './TerminalTab.module.css'

/** Terminal capabilities the panel is handed. */
export type PanelTerminals = DetailsSlotProps['terminals']

/** What this component needs. */
export interface TerminalTabProps {
  /**
   * Report which terminal this tab drives, so closing the tab can end it.
   * @param terminalId - the terminal now attached, or undefined once detached.
   */
  onAttached: (terminalId: string | undefined) => void
  /**
   * Report the terminal's own name, so the tab strip can carry `user@host`
   * instead of the word "Terminal" — the icon already says which kind of tab
   * this is, and only the name says which machine the shell is on.
   */
  onNamed: (title: string) => void
  /** The workspace whose directory the shell starts in. */
  workspaceId: string
  /** Absolute path of that workspace. */
  cwd: string
  /** The terminal seam, injected so this stays a presenter. */
  terminals: PanelTerminals
  /** Feature copy. */
  t: DetailsSlotProps['t']
}

/**
 * The palette xterm paints with.
 *
 * Read from the page's own CSS variables rather than hard-coded, so the
 * terminal follows the light/dark switch with everything else. xterm needs
 * concrete colours — it paints to a canvas and cannot resolve a `var()`.
 * @param host - an element inside the themed tree.
 * @returns the theme xterm accepts.
 */
function paletteOf(host: HTMLElement): Record<string, string> {
  const style = getComputedStyle(host)
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim()
    return value === '' ? fallback : value
  }
  return {
    background: read('--dsw-specific-sidebar-fill', '#181818'),
    foreground: read('--dsw-text-1', '#e6e6e6'),
    cursor: read('--dsw-text-1', '#e6e6e6'),
    selectionBackground: read('--dsw-fill-3', '#3a3a3a'),
  }
}

/**
 * Show one terminal, opening it on first mount.
 * @param props - workspace, seam, and copy.
 * @returns the terminal surface.
 */
export function TerminalTab({ workspaceId, cwd, terminals, onNamed, onAttached, t }: TerminalTabProps) {
  const mount = useRef<HTMLDivElement | null>(null)
  // The seam and the two callbacks are rebuilt on every render — the seam by
  // the slot's inject, the callbacks because they are written inline — and one
  // of them calls setState. Naming them as effect dependencies made the effect
  // re-run on the render its own callback caused: every pass tore down the
  // renderer and attached a new one, so keystrokes landed in xterm instances
  // that were already being disposed. Only the LAST character of a typed line
  // survived. They live in a ref instead, and the effect keys on the workspace
  // alone, which is the only thing that actually changes which shell this is.
  const latest = useRef({ terminals, onNamed, onAttached, t })
  latest.current = { terminals, onNamed, onAttached, t }
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [view, setView] = useState<TerminalView | undefined>(undefined)

  useEffect(() => {
    const host = mount.current
    if (host === null) return
    // Every disposable this mount creates, torn down in one place: an effect
    // that opened a terminal and then lost the race with unmount must still
    // release the renderer and the subscription.
    // A box rather than a plain `let`: the async open below reads it AFTER
    // awaiting, and a boolean local reads to the type checker as still false
    // there — the mutation happens in the cleanup, which it cannot see.
    const live = { current: true }
    let subscription: (() => void) | undefined
    const { terminals: seam, onNamed: named, onAttached: attached, t: translate } = latest.current
    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: paletteOf(host),
      // Scrollback here is the RENDERER's, independent of what the Host
      // retains for a repaint; a person scrolling back in a live terminal is
      // reading this one.
      scrollback: 5_000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const observer = new ResizeObserver(() => {
      // A hidden panel measures zero; fit() throws on that rather than
      // returning, so the guard is here and not only on the Host side.
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
    })
    observer.observe(host)

    void (async () => {
      try {
        // Reattach before opening: a terminal outlives its panel on purpose,
        // so the tab reopening must find the shell that is still running
        // rather than start a second one beside it.
        const existing = seam.adopt(workspaceId)
        const adopted = existing !== undefined
        const opened = adopted
          ? await seam.replay(existing)
          : await seam.open(workspaceId, cwd, term.cols, term.rows)
        if (!live.current) {
          // The panel closed while the Host was starting a shell. A shell this
          // mount started and nothing will ever read is closed; one it merely
          // reattached to belongs to the panel that opened it.
          if (!adopted) await seam.close(opened.terminal.terminalId)
          return
        }
        setView(opened.terminal)
        named(opened.terminal.title)
        attached(opened.terminal.terminalId)
        if (opened.replay !== '') term.write(opened.replay)
        subscription = seam.subscribe(opened.terminal.terminalId, {
          output: (chunk) => { term.write(chunk) },
          exited: (exitCode) => {
            setView(current => current === undefined
              ? current
              : { ...current, live: false, ...exitCode === undefined ? {} : { exitCode } })
            term.write(`\r\n\x1b[2m[${translate('terminal.ended')}]\x1b[0m\r\n`)
          },
        })
        term.onData((data) => { void seam.write(opened.terminal.terminalId, data) })
        term.onResize(({ cols, rows }) => {
          void seam.resize(opened.terminal.terminalId, cols, rows)
        })
        term.focus()
      } catch (error: unknown) {
        if (live.current) setFailure(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => {
      live.current = false
      subscription?.()
      observer.disconnect()
      term.dispose()
    }
  }, [workspaceId, cwd])

  return (
    <div className={css.root}>
      {failure === undefined
        ? null
        : <div className={css.failure}>{failure}</div>}
      <div className={css.surface} ref={mount} />
      {view !== undefined && !view.live && (
        <div className={css.footer}>
          {t('terminal.ended')}
          {view.exitCode === undefined ? '' : ` (${String(view.exitCode)})`}
        </div>
      )}
    </div>
  )
}
