/**
 * The Studio MCP area: the MCP servers the signed-in UnieAI account has, as
 * the account's own Studio lists them.
 *
 * IT LISTS. IT DOES NOT CONNECT, AND IT OFFERS NO CONTROL THAT WOULD IMPLY IT
 * COULD. The servers belong to the account and are changed on Studio; the
 * browser is handed a name, an origin, and a tool catalogue, and is handed no
 * endpoint and no credential to dial one with. An install or connect button
 * here would fail on press, every time, and a control that cannot work must
 * not be drawn.
 *
 * WHAT IT DRAWS INSTEAD IS WHICH ANSWER IT GOT. Four of the five states carry
 * no list, and each says a different sentence: still reading, no session, a
 * deployment older than the MCP route, and a read that failed — only the last
 * of which is worth a Retry. An account with nothing connected is the fifth,
 * and it says so in its own words rather than by drawing nothing.
 *
 * THE TOOL IS THE UNIT, AND THE SERVER IS THE CATEGORY. What a reader came
 * here to find out is which tools they have; the server is the answer to
 * "where did this one come from". So a server is a heading with its origin
 * beside it — not a box — and under it every tool gets a card of its own, in a
 * grid that reflows from one column to as many as the frame fits.
 *
 * The server is the category BECAUSE IT IS THE ONLY GROUPING THAT IS REAL. The
 * wire reports a label and an origin per server and nothing whatsoever per
 * tool beyond a name. A finer grouping would have to be cut out of the names —
 * `studio_kb_*` against `studio_sql_*` — and that is a convention one server
 * happens to follow, not data: the same rule turns Notion's `search` and
 * `fetch` into two categories of one, or into an "other" bucket that swallows
 * the whole catalogue. Segmentation dressed as taxonomy reads as fact, and
 * this one would be a guess.
 */
import type { ReactNode } from 'react'
import { Button } from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import type { StudioMcpRow, StudioMcpSource, StudioMcpTool } from './studio-mcp-source.ts'
import css from './StudioMcpArea.module.css'

/** Injected business face of the Studio MCP area (slot `inject`). */
export interface StudioMcpAreaInjected {
  hooks: {
    /** Server list state, bound by the UI renderer as useServers. */
    servers: StudioMcpSource
  }
  /** Re-read the list from the host. */
  refresh: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type StudioMcpAreaComponentProps =
  PropsRuntime<'plugins.page.area'> & PropsLocale<'plugins'>
  & InjectFace<StudioMcpAreaInjected>

/** The translate seat this area and its rows share. */
type Translate = StudioMcpAreaComponentProps['t']


/**
 * Render the Studio MCP area.
 * @param props - composed slot props.
 * @returns the area element tree.
 */
export function StudioMcpArea({ t, useServers, refresh }: StudioMcpAreaComponentProps) {
  const state = useServers(snapshot => snapshot)
  return (
    <section className={css.area} aria-label={t('mcp.title')}>
      <h2 className={css.title}>{t('mcp.title')}</h2>
      <p className={css.intro}>{t('mcp.intro')}</p>
      {state.status === 'loading' ? <p className={css.status}>{t('mcp.loading')}</p> : null}
      {state.status === 'signed-out' ? <p className={css.status}>{t('mcp.signedOut')}</p> : null}
      {state.status === 'unsupported'
        ? (
          <div className={css.notice}>
            <p className={css.noticeTitle}>{t('mcp.unsupported')}</p>
            <p className={css.note}>{t('mcp.unsupportedBody')}</p>
          </div>
        )
        : null}
      {state.status === 'failed'
        ? (
          <>
            <p className={css.failure}>{t('mcp.unreadable')}</p>
            <div className={css.actions}>
              <Button variant="outline" size="sm" onClick={refresh}>{t('mcp.retry')}</Button>
            </div>
          </>
        )
        : null}
      {state.status === 'ready'
        ? (
          <>
            {state.servers.length === 0
              ? (
                <div className={css.notice}>
                  <p className={css.noticeTitle}>{t('mcp.empty')}</p>
                  <p className={css.note}>{t('mcp.emptyBody')}</p>
                </div>
              )
              : (
                <div className={css.groups}>
                  {state.servers.map(row => <ServerGroup key={row.id} row={row} t={t} />)}
                </div>
              )}
            <p className={css.note}>{t('mcp.readOnly')}</p>
          </>
        )
        : null}
    </section>
  )
}

/**
 * One server, drawn as a category: a heading naming it, its origin beside the
 * heading, and its catalogue as a card each. No endpoint, no credential and no
 * expiry appear, because the row it is built from carries none of the three.
 *
 * The catalogue is named for a screen reader rather than captioned on screen.
 * A visible "Tools" label above a grid of tool cards restates what the grid
 * already is; a reader who cannot see the grid still needs to be told.
 * @param props - the server row and the area's translate seat.
 * @returns the group element.
 */
function ServerGroup({ row, t }: { row: StudioMcpRow; t: Translate }): ReactNode {
  return (
    <section className={css.group}>
      <div className={css.groupHead}>
        <h3 className={css.groupName}>{row.label === '' ? t('mcp.unnamed') : row.label}</h3>
        <span className={css.origin}>{row.origin === '' ? t('mcp.originUnset') : row.origin}</span>
      </div>
      {row.tools.length === 0
        ? <p className={css.note}>{t('mcp.toolsNone')}</p>
        : (
          <ul className={css.grid} aria-label={t('mcp.toolsTitle')}>
            {row.tools.map(tool => <ToolCard key={tool.name} tool={tool} />)}
          </ul>
        )}
    </section>
  )
}

/**
 * One tool.
 *
 * The name is set in the code face because it is an identifier, not a title —
 * the reader may have to type it. The sentence under it is the host's own and
 * is drawn only when the host sent one; there is no placeholder line, because
 * a card that says "no description" says less than a card that stops.
 * @param props - the tool to draw.
 * @returns the card list item.
 */
function ToolCard({ tool }: { tool: StudioMcpTool }): ReactNode {
  return (
    <li className={css.card}>
      <span className={css.cardName}>{tool.name}</span>
      {tool.description === '' ? null : <p className={css.cardBody}>{tool.description}</p>}
    </li>
  )
}
