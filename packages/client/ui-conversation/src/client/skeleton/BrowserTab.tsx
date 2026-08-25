/**
 * The browser panel: a real Chrome on the Host, seen through a screencast.
 *
 * There is no iframe here and there cannot be one. The point of this tab is to
 * reach pages the reader is already signed in to on this machine — and every
 * such page sets `X-Frame-Options` or a frame-ancestors CSP precisely to stop
 * a document from embedding it. What Chrome refuses to frame it will happily
 * stream, so the Host drives a browser over CDP and sends its repaints; this
 * component paints them and sends gestures back.
 *
 * That inversion is also why the picture is 1:1. The Host is told the surface's
 * own pixel size, so a click at (x, y) here is a click at (x, y) there; a
 * scaled picture would need every gesture rescaled with it, and would be wrong
 * for the one frame between a resize and the repaint that answers it.
 *
 * Like the terminal beside it, the browser lives on the Host and outlives this
 * component: closing the tab ends it, unmounting it does not.
 */

import { useEffect, useRef, useState } from 'react'
import type { BrowserView } from '@unieai/uad-api-remotes/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import css from './BrowserTab.module.css'

/** Browser capabilities the panel is handed. */
export type PanelBrowsers = DetailsSlotProps['browsers']

/** Where a browser starts when the tab opens one. */
const HOME = 'https://www.google.com'

/** What this component needs. */
export interface BrowserTabProps {
  /**
   * Report which browser this tab drives, so closing the tab can end it.
   * @param browserId - the browser now attached, or undefined once detached.
   */
  onAttached: (browserId: string | undefined) => void
  /**
   * Report the page's own title, so the tab strip carries the page rather than
   * the word "Browser" — the icon already says which kind of tab this is.
   */
  onNamed: (title: string) => void
  /** The workspace the browser belongs to. */
  workspaceId: string
  /** The browser seam, injected so this stays a presenter. */
  browsers: PanelBrowsers
  /** Feature copy. */
  t: DetailsSlotProps['t']
}

/**
 * CDP's modifier bitmask.
 *
 * Alt=1, Ctrl=2, Meta=4, Shift=8 — the page needs these to tell `a` from
 * `Ctrl-A`, and a keystroke that arrives without them is a different keystroke.
 * @param event - the keyboard or mouse event.
 * @returns the mask CDP expects.
 */
function modifiersOf(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
}

/**
 * The text a key press inserts, or undefined when it inserts nothing.
 *
 * A printable key is one character long; everything else — `Enter`, `Tab`, the
 * arrows, the F-keys — is a name. Sending a name as text would type the word
 * "Enter" into the page.
 * @param key - the DOM `key` value.
 * @returns the text to insert, if any.
 */
function textOf(key: string): string | undefined {
  // One CODE POINT, not one UTF-16 unit: an astral character (an emoji from a
  // picker, a rarer CJK ideograph) arrives as a two-unit surrogate pair and is
  // still a single printable key. `.` under `u` matches the whole pair.
  return /^.$/u.test(key) ? key : undefined
}

/**
 * What the person meant by what they typed in the address bar.
 *
 * A bare host is a URL missing its scheme, and anything with a space in it is
 * a search. Guessing here rather than on the Host keeps the Host's fence
 * simple: it takes http(s) URLs and refuses everything else, and never has to
 * decide what a half-typed string was supposed to be.
 * @param typed - exactly what is in the box.
 * @returns an absolute http(s) URL.
 */
function addressOf(typed: string): string {
  const trimmed = typed.trim()
  if (/^https?:\/\//iu.test(trimmed)) return trimmed
  if (trimmed.includes(' ') || !trimmed.includes('.')) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }
  return `https://${trimmed}`
}

/**
 * Show one browser, opening it on first mount.
 * @param props - workspace, seam, and copy.
 * @returns the browser surface.
 */
export function BrowserTab({ workspaceId, browsers, onNamed, onAttached, t }: BrowserTabProps) {
  const mount = useRef<HTMLDivElement | null>(null)
  const image = useRef<HTMLImageElement | null>(null)
  // Same stabilisation as the terminal: the seam and both callbacks are rebuilt
  // every render and one of them sets state, so naming them as dependencies
  // would tear the browser down and open a new one on the render its own
  // callback caused. The effect keys on the workspace alone.
  const latest = useRef({ browsers, onNamed, onAttached })
  latest.current = { browsers, onNamed, onAttached }
  const attached = useRef<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [view, setView] = useState<BrowserView | undefined>(undefined)
  const [typed, setTyped] = useState('')
  // The box the last resize reported. Gestures are sent in page coordinates,
  // and the page's coordinates are this box's — but only once the Host has been
  // told; before that the page is still its old size and a click would miss.
  const measured = useRef({ width: 0, height: 0 })

  useEffect(() => {
    const host = mount.current
    if (host === null) return
    const live = { current: true }
    let subscription: (() => void) | undefined
    const { browsers: seam, onNamed: named, onAttached: report } = latest.current

    const paint = (data: string): void => {
      const target = image.current
      if (target !== null) target.src = `data:image/jpeg;base64,${data}`
    }

    const observer = new ResizeObserver(() => {
      const browserId = attached.current
      const width = Math.trunc(host.clientWidth)
      const height = Math.trunc(host.clientHeight)
      // A hidden panel measures zero. Telling the page it is 0x0 makes Chrome
      // stop producing frames entirely, and nothing brings them back but
      // another resize — so a measurement of zero is ignored, not forwarded.
      if (browserId === undefined || width === 0 || height === 0) return
      if (measured.current.width === width && measured.current.height === height) return
      measured.current = { width, height }
      void seam.resize(browserId, width, height).catch(() => {})
    })
    observer.observe(host)

    void (async () => {
      try {
        // Reattach before opening, for the terminal's reason and one more: an
        // orphaned browser is a real Chrome process holding a profile
        // directory, not just a shell.
        const existing = seam.adopt(workspaceId)
        const width = Math.max(1, Math.trunc(host.clientWidth))
        const height = Math.max(1, Math.trunc(host.clientHeight))
        const opened = existing === undefined
          ? await seam.open(workspaceId, HOME, width, height)
          : await seam.replay(existing)
        if (!live.current) {
          if (existing === undefined) await seam.close(opened.browser.browserId)
          return
        }
        const browserId = opened.browser.browserId
        attached.current = browserId
        measured.current = { width: opened.browser.width, height: opened.browser.height }
        setView(opened.browser)
        setTyped(opened.browser.url)
        named(opened.browser.title === '' ? opened.browser.url : opened.browser.title)
        report(browserId)
        // The Host's retained frame, so a reopened panel shows the page it left
        // rather than an empty rectangle until something happens to repaint.
        const known = opened.frame ?? seam.lastFrame(browserId)
        if (known !== undefined) paint(known)
        // Re-measure now that the browser is attached. The panel is still
        // laying out when this effect starts — the tab strip and the address
        // bar are above the surface and settle after it — so the size the open
        // used is usually a little short, and the ResizeObserver's own first
        // callback fired before there was a browser to tell. Without this the
        // page keeps the stale viewport and the panel letterboxes a page that
        // is in fact filling it.
        const settled = { width: Math.trunc(host.clientWidth), height: Math.trunc(host.clientHeight) }
        if (settled.width > 0 && settled.height > 0
          && (settled.width !== opened.browser.width || settled.height !== opened.browser.height)) {
          measured.current = settled
          await seam.resize(browserId, settled.width, settled.height)
        }
        subscription = seam.subscribe(browserId, {
          frame: paint,
          // A link click navigates without anyone typing, so the address bar
          // and the tab's name follow the PAGE, not the last thing typed.
          changed: (next) => {
            setView(next)
            setTyped(next.url)
            named(next.title === '' ? next.url : next.title)
          },
        })
      } catch (error: unknown) {
        if (live.current) setFailure(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => {
      live.current = false
      subscription?.()
      observer.disconnect()
    }
  }, [workspaceId])

  const browserId = view?.browserId

  /**
   * Send a pointer gesture in the page's own coordinates.
   * @param event - the React mouse event.
   * @param type - which CDP gesture this is.
   */
  const pointer = (event: React.MouseEvent<HTMLElement>, type: 'mousePressed' | 'mouseReleased' | 'mouseMoved'): void => {
    if (browserId === undefined) return
    const box = event.currentTarget.getBoundingClientRect()
    void browsers.pointer(browserId, {
      type,
      x: Math.round(event.clientX - box.left),
      y: Math.round(event.clientY - box.top),
      clickCount: type === 'mouseMoved' ? 0 : 1,
    }).catch(() => {})
  }

  return (
    <div className={css.root}>
      {failure === undefined ? null : <div className={css.failure}>{failure}</div>}
      <div className={css.bar}>
        <input
          className={css.address}
          value={typed}
          spellCheck={false}
          aria-label={t('browser.address')}
          onChange={(event) => { setTyped(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || browserId === undefined) return
            event.preventDefault()
            void browsers.navigate(browserId, addressOf(typed))
              .catch((error: unknown) => {
                setFailure(error instanceof Error ? error.message : String(error))
              })
          }}
        />
        <button
          type="button" className={css.go}
          onClick={() => {
            if (browserId === undefined) return
            void browsers.navigate(browserId, addressOf(typed))
              .catch((error: unknown) => {
                setFailure(error instanceof Error ? error.message : String(error))
              })
          }}
        >
          {t('browser.go')}
        </button>
      </div>
      <div
        className={css.surface}
        ref={mount}
        tabIndex={0}
        role="application"
        aria-label={t('panel.browser')}
        onMouseDown={(event) => {
          event.currentTarget.focus()
          pointer(event, 'mousePressed')
        }}
        onMouseUp={(event) => { pointer(event, 'mouseReleased') }}
        onMouseMove={(event) => { pointer(event, 'mouseMoved') }}
        onWheel={(event) => {
          if (browserId === undefined) return
          const box = event.currentTarget.getBoundingClientRect()
          void browsers.pointer(browserId, {
            type: 'mouseWheel',
            x: Math.round(event.clientX - box.left),
            y: Math.round(event.clientY - box.top),
            deltaX: Math.round(event.deltaX),
            deltaY: Math.round(event.deltaY),
          }).catch(() => {})
        }}
        onKeyDown={(event) => {
          if (browserId === undefined) return
          // The surface swallows the key rather than letting the app act on
          // it: the page is what has focus as far as the reader is concerned,
          // and Tab or `/` reaching the shell behind it would be a surprise.
          event.preventDefault()
          const text = textOf(event.key)
          void browsers.key(browserId, {
            type: text === undefined ? 'keyDown' : 'char',
            key: event.key,
            code: event.code,
            modifiers: modifiersOf(event),
            ...text === undefined ? {} : { text },
          }).catch(() => {})
        }}
        onKeyUp={(event) => {
          if (browserId === undefined || textOf(event.key) !== undefined) return
          event.preventDefault()
          void browsers.key(browserId, {
            type: 'keyUp',
            key: event.key,
            code: event.code,
            modifiers: modifiersOf(event),
          }).catch(() => {})
        }}
      >
        {view === undefined
          ? <div className={css.pending}>{t('browser.opening')}</div>
          : <img className={css.frame} ref={image} alt={view.title === '' ? view.url : view.title} />}
      </div>
      {view !== undefined && !view.live && (
        <div className={css.footer}>{t('browser.closed')}</div>
      )}
    </div>
  )
}
