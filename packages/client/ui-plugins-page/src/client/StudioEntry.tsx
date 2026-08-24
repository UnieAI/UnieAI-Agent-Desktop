/**
 * The UnieAI Studio entry: this product's own integration, stated at the top
 * of the plugin directory whether or not any catalogue answers.
 *
 * WHY IT IS DRAWN AT ALL, ON A PAGE THAT HARDCODES NOTHING ELSE. See
 * `studio-entry.ts`: the surrounding directory renders a wire and names no
 * plugin, and this one row is a fact about the product rather than a claim
 * about a catalogue. What it SHOWS is still read — the binding, the tool
 * names, and the account state all come from the one `/auth/mcp` reading that
 * `StudioMcpArea` renders further down, through the same source object.
 *
 * WHAT EACH STATE DRAWS, AND WHY THE ACTION IS NOT ALWAYS THERE. Binding needs
 * an account: it is a link between this product's account and a Studio
 * account, made on the product's own settings page. So the action appears for
 * exactly one reading — a settled list with no Studio server in it. A
 * signed-out desktop is told to sign in first, because pressing Bind would
 * land on a page that asks for a login instead of showing the card. A
 * deployment with no MCP route cannot observe the link at all and says so; a
 * failed read offers the retry, which is the one of these a retry can fix.
 *
 * THE BOUND STATE SHOWS WHAT THE LINK ACTUALLY GIVES. Not a checkmark alone:
 * the tools the account's own Studio server reports, by name, from the row the
 * product sent. An account whose server reported none says that rather than
 * drawing an empty strip, and no description is invented for a tool the host
 * described in one word (see `StudioMcpTool`).
 */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import type { StudioMcpSource } from './studio-mcp-source.ts'
import type { StudioBinding } from './studio-entry.ts'
import { STUDIO_BINDING_URL, STUDIO_ICON, readStudioBinding } from './studio-entry.ts'
import css from './StudioEntry.module.css'

/** Injected business face of the Studio entry (slot `inject`). */
export interface StudioEntryInjected {
  hooks: {
    /**
     * The same server list `StudioMcpArea` binds, bound here as useServers.
     * One source, so the entry and the area can never disagree about whether
     * the account holds a Studio link.
     */
    servers: StudioMcpSource
  }
  /** Re-read the list from the host. */
  refresh: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type StudioEntryComponentProps =
  PropsRuntime<'plugins.page.area'> & PropsLocale<'plugins'>
  & InjectFace<StudioEntryInjected>

/** The translate seat this entry and its rows share. */
type Translate = StudioEntryComponentProps['t']

/**
 * Render the Studio entry.
 * @param props - see {@link StudioEntryComponentProps}.
 * @returns the entry element tree.
 */
export function StudioEntry({ t, useServers, refresh }: StudioEntryComponentProps) {
  const binding = readStudioBinding(useServers(snapshot => snapshot))
  return (
    <section className={css.area} aria-label={t('studio.name')}>
      <div className={css.row}>
        <img className={css.mark} src={STUDIO_ICON} alt={t('studio.iconAlt')} />
        <span className={css.text}>
          <span className={css.nameLine}>
            <span className={css.name}>{t('studio.name')}</span>
            {binding.status === 'bound'
              ? <span className={css.connected}>{t('studio.bound')}</span>
              : null}
          </span>
          <span className={css.description}>{t('studio.description')}</span>
        </span>
        <Action binding={binding} t={t} refresh={refresh} />
      </div>
      <Detail binding={binding} t={t} />
    </section>
  )
}

/**
 * The entry's one control, drawn only for the readings that can honour it.
 *
 * The bind target is an anchor rather than a button because the destination is
 * another origin: the product performs the whole device grant, and this
 * desktop has no step in it. `target="_blank"` keeps the desktop standing
 * while the reader approves, which the grant requires — the binding card polls
 * on the product side and the reader comes back to a desktop that re-reads.
 * @param props - the binding, the translate seat, and the re-read gesture.
 * @returns the control, or null when this reading has none.
 */
function Action({ binding, t, refresh }: {
  binding: StudioBinding
  t: Translate
  refresh: () => void
}): ReactNode {
  if (binding.status === 'unbound') {
    return (
      <a
        className={css.bind}
        href={STUDIO_BINDING_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('studio.bind')}
      </a>
    )
  }
  if (binding.status === 'failed') {
    return (
      <button type="button" className={css.retry} onClick={refresh}>{t('mcp.retry')}</button>
    )
  }
  return null
}

/**
 * The line or list under the entry, which is the whole of what a reading says
 * beyond its one word.
 * @param props - the binding and the translate seat.
 * @returns the detail element.
 */
function Detail({ binding, t }: { binding: StudioBinding; t: Translate }): ReactNode {
  if (binding.status === 'loading') return <p className={css.note}>{t('studio.loading')}</p>
  if (binding.status === 'signed-out') return <p className={css.note}>{t('studio.signedOut')}</p>
  if (binding.status === 'unsupported') return <p className={css.note}>{t('studio.unsupported')}</p>
  if (binding.status === 'failed') return <p className={css.failure}>{t('studio.failed')}</p>
  if (binding.status === 'unbound') return <p className={css.note}>{t('studio.unbound')}</p>
  return (
    <div className={css.gives}>
      <p className={css.note}>{t('studio.boundBody')}</p>
      {binding.server.tools.length === 0
        ? <p className={css.note}>{t('mcp.toolsNone')}</p>
        : (
          <ul className={css.tools} aria-label={t('mcp.toolsTitle')}>
            {binding.server.tools.map(tool => (
              <li key={tool.name} className={css.tool}>{tool.name}</li>
            ))}
          </ul>
        )}
    </div>
  )
}
