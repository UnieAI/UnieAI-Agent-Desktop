/**
 * The picture beside each connector's name.
 *
 * A person who does not know what OAuth is still knows the Google logo, and a
 * row of identical grey shapes would make them read every label to find the
 * one they came for. So each connector gets a mark rather than an icon.
 *
 * TWO KINDS, DELIBERATELY. Google and Microsoft publish their marks as small
 * flat shapes and ask that they appear on the control that connects an
 * account, so those are drawn as the vendors draw them. Every other connector
 * gets a monogram tile in its own colour: an approximate redrawing of a logo
 * from memory is worse than no logo — it is recognisably wrong, and it is a
 * misuse of the mark. A tile is a design decision, and it stays correct when
 * a connector this fork has never heard of is registered by a plugin.
 */
import type { ReactElement } from 'react'
import css from './ConnectorsSection.module.css'

/** A monogram tile's colour, keyed by connector id. */
const TILE: Readonly<Record<string, string>> = {
  notion: '#111111',
  linear: '#5E6AD2',
  sanity: '#F03E2F',
}

/** Fill for a connector nothing has been declared for. */
const TILE_FALLBACK = '#6B7280'

/** Google's four-colour G, as Google publishes it. */
function GoogleMark(): ReactElement {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  )
}

/** Microsoft's four-square mark, as Microsoft publishes it. */
function MicrosoftMark(): ReactElement {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

/**
 * A connector's mark, or a monogram tile when this fork ships no drawing of it.
 * @param props.id - the connector id, which selects the drawing.
 * @param props.label - the connector's name, whose first letter fills a tile.
 * @returns the mark element.
 */
export function ConnectorMark({ id, label }: { id: string; label: string }): ReactElement {
  if (id === 'google') return <span className={css.mark}><GoogleMark /></span>
  if (id === 'microsoft') return <span className={css.mark}><MicrosoftMark /></span>
  return (
    <span
      className={css.mark}
      data-tile="true"
      style={{ background: TILE[id] ?? TILE_FALLBACK }}
    >
      {/* An id with no label still needs a glyph, and its own first letter is
          the only thing left that identifies it. */}
      {(label === '' ? id : label).slice(0, 1).toUpperCase()}
    </span>
  )
}
