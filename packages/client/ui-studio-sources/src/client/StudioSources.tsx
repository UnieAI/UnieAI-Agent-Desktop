/**
 * The citations under a Studio knowledge-base result.
 *
 * Rows, not a link list: the desktop cannot open a Studio document, so a row
 * that looked like a link would promise a destination that does not exist
 * here. What it shows is what a person needs to check an answer — which
 * document, which page, and how strongly the search matched.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls the details hole's declaration from the panel that owns it.
import type {} from '@unieai/uad-client-ui-conversation/client'
import { sourcesFor } from './sources.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge.
import type {} from './locales.ts'
import css from './StudioSources.module.css'

/** Full props: the owner's per-call share plus this package's dictionary. */
export type StudioSourcesProps =
  PropsRuntime<'conversation.details.tool.annotation'> & PropsLocale<'conversation.studioSources'>

/**
 * Render the cited passages, or nothing at all.
 *
 * Nothing is the common case — this occupant sees every tool call the person
 * opens, and only Studio's knowledge-base tools carry citations.
 * @param props - composed slot props.
 * @returns the citations block, or null.
 */
export function StudioSources(props: StudioSourcesProps): ReactNode {
  const { t, name, block } = props
  const sources = sourcesFor(name, block)
  if (sources.length === 0) return null

  return (
    <div className={css['block']}>
      <div className={css['label']}>{t('title')}</div>
      <ul className={css['list']}>
        {sources.map((source, index) => (
          // The chunk id is the identity when there is one; a tool that
          // reports none still gets stable rows for this frozen result.
          <li key={source.chunkId === '' ? String(index) : source.chunkId} className={css['row']}>
            <span className={css['name']}>{source.docName === '' ? t('unnamed') : source.docName}</span>
            {source.section !== '' && <span className={css['section']}>{source.section}</span>}
            {source.page !== null && <span className={css['meta']}>{t('page', { page: source.page })}</span>}
            {source.score !== null && (
              <span className={css['meta']}>{t('match', { percent: Math.round(source.score * 100) })}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
