/**
 * The API Provider settings section: the account's OpenAI-compatible
 * providers, as the UnieAI Copilot web product's own "API Provider Settings"
 * page lists them, with the Add Provider control that puts a new one into that
 * same list and the per-row edit and delete that change one already in it.
 *
 * There is one list, not two. Every row here is a row in the web product's
 * store; the desktop keeps no copy, so nothing on this page can disagree with
 * that page, and a provider added, renamed or removed here is added, renamed
 * or removed there for the same reason.
 *
 * What a row offers is decided by the product's own rules, not by this page's
 * taste. A platform-managed row is labelled as Studio's and opens a card
 * carrying only the two things the product will accept for it — the enable
 * flag and the per-model selection — and no delete at all, because such a row
 * goes away by unbinding the Studio account. Rendering the full form for it
 * and letting the 409 arrive afterwards would tell the reader about the rule
 * only once they had already typed into it.
 *
 * The desktop's own local providers are NOT here. Those live in the Models
 * section over `settings.yaml`, they are a different store with different
 * credentials, and merging the two lists would tell the user that removing a
 * row in one place removes it in the other.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the settings slot declarations (the `settings.section` entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AddProviderForm } from './AddProviderForm.tsx'
import { EditProviderForm } from './EditProviderForm.tsx'
import type { EditResult } from './EditProviderForm.tsx'
import type {
  ProviderDraft, ProviderOutcome, ProviderPatch, ProviderRow, ProviderSource,
} from './provider-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.providers').
import type {} from './locales.ts'
import css from './ProvidersSection.module.css'

/** Injected business face of the API Provider section (slot `inject`). */
export interface ProvidersSectionInjected {
  hooks: {
    /** Provider list state, bound by the UI renderer as useProviders. */
    providers: ProviderSource
  }
  /** Re-read the list from the host. */
  refresh: () => void
  /** Submit one new provider to the web product. */
  create: (draft: ProviderDraft) => Promise<ProviderOutcome>
  /** Apply one edit to a provider the account already has. */
  update: (id: string, patch: ProviderPatch) => Promise<ProviderOutcome>
  /** Remove one provider, and with it every model it offered. */
  remove: (id: string) => Promise<ProviderOutcome>
}

/** Full component props: runtime share + locale seat + injected face. */
export type ProvidersSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.providers'>
  & InjectFace<ProvidersSectionInjected>

/** The translate seat this section and its card share. */
type Translate = ProvidersSectionComponentProps['t']

/** The line the section prints after a write landed, if any. */
type Notice = 'created' | 'saved' | 'deleted' | undefined

/**
 * Render the API Provider section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function ProvidersSection(
  { t, useProviders, refresh, create, update, remove }: ProvidersSectionComponentProps,
) {
  const state = useProviders(snapshot => snapshot)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<Notice>(undefined)

  const closeAdd = (added: boolean): void => {
    setAdding(false)
    setNotice(added ? 'created' : undefined)
  }

  const closeEdit = (result: EditResult): void => {
    setEditing(undefined)
    setNotice(result)
  }

  const openEdit = (id: string): void => {
    setAdding(false)
    setNotice(undefined)
    setEditing(id)
  }

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'signed-out' ? <p className={css.status}>{t('signedOut')}</p> : null}
      {state.status === 'failed'
        ? (
          <>
            <p className={css.failure}>{t('unreadable')}</p>
            <div className={css.actions}>
              <Button variant="outline" size="sm" onClick={refresh}>{t('retry')}</Button>
            </div>
          </>
        )
        : null}
      {state.status === 'ready'
        ? (
          <>
            {notice === undefined
              ? null
              : <p className={css.status} role="status" aria-live="polite">{t(notice)}</p>}
            {state.providers.length === 0
              ? (
                <div className={css.empty}>
                  <p className={css.emptyTitle}>{t('empty')}</p>
                  <p className={css.note}>{t('emptyHint')}</p>
                </div>
              )
              : (
                <ul className={css.rows}>
                  {state.providers.map(row => (
                    <li className={css.row} key={row.id}>
                      {row.id === editing
                        ? (
                          <EditProviderForm
                            t={t}
                            row={row}
                            onSave={patch => update(row.id, patch)}
                            onDelete={() => remove(row.id)}
                            onClose={closeEdit}
                          />
                        )
                        : <Row row={row} t={t} onEdit={() => { openEdit(row.id) }} />}
                    </li>
                  ))}
                </ul>
              )}
            {adding
              ? <AddProviderForm t={t} onCreate={create} onClose={closeAdd} />
              : (
                <div className={css.actions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setNotice(undefined); setEditing(undefined); setAdding(true) }}
                  >
                    {t('add')}
                  </Button>
                </div>
              )}
          </>
        )
        : null}
    </div>
  )
}

/**
 * One provider row: what it is called, how it is addressed, and how much of
 * its catalogue is switched on — the same facts the reference page's card
 * shows collapsed, plus the control that opens it.
 * @param props - the row, the section's translate seat, and the edit gesture.
 * @returns the row body.
 */
function Row({ row, t, onEdit }: { row: ProviderRow; t: Translate; onEdit: () => void }): ReactNode {
  return (
    <>
      <div className={css.rowHead}>
        <span className={css.rowName}>{row.displayName === '' ? t('unnamed') : row.displayName}</span>
        {row.prefix === '' ? null : <span className={css.prefix}>{row.prefix}</span>}
        {row.managed ? <span className={css.badge}>{t('managed')}</span> : null}
        {row.enabled ? null : <span className={css.badge}>{t('disabled')}</span>}
        <Button variant="outline" size="sm" className={css.rowAction} onClick={onEdit}>
          {t('edit')}
        </Button>
      </div>
      <div className={css.rowMeta}>
        <span className={css.url}>{row.apiUrl === '' ? t('urlUnset') : row.apiUrl}</span>
        <span>
          {t('models', {
            selected: String(row.selectedModels.length),
            total: String(row.models.length),
          })}
        </span>
      </div>
      {row.managed ? <p className={css.note}>{t('managedHint')}</p> : null}
    </>
  )
}
