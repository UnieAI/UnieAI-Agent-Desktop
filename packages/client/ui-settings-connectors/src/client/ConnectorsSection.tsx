/**
 * The Connections settings page: which outside services this app has been let
 * into, and the two buttons that change that.
 *
 * One row per connector, and the row is the whole interaction — mark, name,
 * what is true about it right now, and the single control that acts on it.
 * There is no card grid and no per-service detail page, because every
 * connector answers the same two questions and a person scanning for one name
 * should not have to open anything.
 *
 * While an approval is open the row is replaced by a waiting notice, because
 * the thing the person has to do next is in another window and the page's job
 * is to say so.
 */
import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Button, IconWarningOutline16 } from '@unieai/uad-client-ui-primitives'
import type { ConnectorView } from '@unieai/uad-api-remotes/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import { ConnectorMark } from './ConnectorMark.tsx'
import type { ConnectorsState } from './connector-view.ts'
import css from './ConnectorsSection.module.css'

/** Registration-side business face for the section. */
export interface ConnectorsSectionInjected {
  hooks: {
    /** The connector list and whatever is in flight over it. */
    connectors: HostObservable<ConnectorsState>
  }
  /** Re-read the list; the page calls this when it mounts. */
  refresh: () => void
  /**
   * The active locale tag, read at render so a language switch reformats the
   * dates with everything else. Not a prop: the slot kit carries no locale
   * tag, only the translate seat.
   */
  locale: () => string
  /**
   * Approve one connector, which opens the provider's page in a browser.
   * @param connector - the provider id.
   */
  connect: (connector: string) => void
  /** Stop waiting for the approval that is open. */
  cancel: () => void
  /**
   * Forget one connector's grant.
   * @param connector - the provider id.
   */
  disconnect: (connector: string) => void
  /** Dismiss the current failure. */
  dismissError: () => void
}

/** Props the renderer binds for the section. */
export type ConnectorsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.connectors'>
  & InjectFace<ConnectorsSectionInjected>

/**
 * The day an access token stops working, in the reader's own locale.
 *
 * Only the day: the hour is true but useless — nobody plans around 14:37, and
 * a timestamp reads as a system detail rather than as a thing to remember.
 * @param iso - the instant the host reported.
 * @param locale - the active locale tag.
 * @returns the formatted day, or the raw value when it is not a date.
 */
export function expiryDay(iso: string, locale: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Render the Connections page.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function ConnectorsSection({
  t, locale, refresh, useConnectors, connect, cancel, disconnect, dismissError,
}: ConnectorsSectionProps) {
  const localeTag = locale()
  const connectors = useConnectors(state => state.connectors)
  const loading = useConnectors(state => state.loading)
  const connecting = useConnectors(state => state.connecting)
  const disconnecting = useConnectors(state => state.disconnecting)
  const error = useConnectors(state => state.error)

  // The list is read when the page opens rather than kept live: a grant
  // changes only when someone presses a button here or withdraws access at
  // the provider, and neither of those is something the host pushes.
  const read = useRef(false)
  useEffect(() => {
    if (read.current) return
    read.current = true
    refresh()
  }, [refresh])

  const waiting = connectors.find(entry => entry.id === connecting)

  /** The one sentence under a connector's name. */
  const state = (entry: ConnectorView): string => {
    if (!entry.connected) {
      return entry.requiresClientId ? t('state.needsSetup') : t('state.disconnected')
    }
    // A connection that cannot renew really does end, and the date is the
    // only part of that a person can act on.
    if (!entry.renewable && entry.expiresAt !== undefined) {
      return t('state.expires', { date: expiryDay(entry.expiresAt, localeTag) })
    }
    return entry.account === undefined ? t('state.connected') : t('state.connectedAs', { account: entry.account })
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {error === '' ? null : (
        <div className={css.error} role="alert">
          <IconWarningOutline16 className={css.errorGlyph} size={16} />
          <div className={css.errorText}>
            <strong className={css.errorTitle}>{t('error.title')}</strong>
            <span className={css.errorBody}>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={dismissError}>{t('action.dismiss')}</Button>
        </div>
      )}

      {waiting !== undefined ? (
        <div className={css.waiting} role="status">
          <span className={css.waitingSpinner} aria-hidden="true" />
          <div className={css.waitingText}>
            <strong className={css.waitingTitle}>{t('waiting.title')}</strong>
            <span className={css.waitingBody}>{t('waiting.body', { label: waiting.label })}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={cancel}>{t('action.cancel')}</Button>
        </div>
      ) : null}

      {loading ? <p className={css.quiet}>{t('loading')}</p>
        : connectors.length === 0 ? (
          <div className={css.empty}>
            <strong className={css.emptyTitle}>{t('empty.title')}</strong>
            <span className={css.quiet}>{t('empty.body')}</span>
          </div>
        ) : (
          <ul className={css.rows}>
            {connectors.map((entry) => {
              const busy = entry.id === connecting || entry.id === disconnecting
              return (
                <li key={entry.id} className={css.row}>
                  <ConnectorMark id={entry.id} label={entry.label} />
                  <div className={css.rowText}>
                    <span className={css.rowName}>{entry.label}</span>
                    <span
                      className={clsx(css.rowState, entry.connected && css.rowStateOn)}
                      data-needs-setup={entry.requiresClientId && !entry.connected ? 'true' : undefined}
                    >
                      {state(entry)}
                    </span>
                    {entry.requiresClientId && !entry.connected ? (
                      <details className={css.setup}>
                        <summary className={css.setupSummary}>{t('setup.title')}</summary>
                        <p className={css.setupBody}>{t('setup.body', { label: entry.label })}</p>
                      </details>
                    ) : null}
                  </div>
                  {entry.connected ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => { disconnect(entry.id) }}>
                      {t('action.disconnect')}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      // A connector waiting for an application to be registered
                      // cannot be connected from here, and a button that can
                      // only fail is worse than one that is plainly unavailable.
                      disabled={busy || connecting !== '' || entry.requiresClientId}
                      onClick={() => { connect(entry.id) }}
                    >
                      {t('action.connect')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}
