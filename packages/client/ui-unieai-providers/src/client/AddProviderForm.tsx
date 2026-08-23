/**
 * The Add Provider card: the four fields the UnieAI web product's own create
 * dialog asks for, in its order — display name, prefix, API URL, API Key.
 *
 * The card validates only what it can answer alone: a field left blank, and a
 * prefix that is not four alphanumeric characters. Whether a prefix is already
 * taken and whether the plan allows another provider are the product's
 * answers, and the card renders the refusal it sends back rather than guessing
 * at either — a desktop cannot see the other prefixes on the account, and a
 * local guess would be wrong the moment another client took one.
 *
 * The API Key field is write-only. It is submitted and then the card closes;
 * nothing ever reads a stored provider credential back, so there is no reveal
 * control here of the kind the web dialog has.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderFailure, ProviderDraft } from './provider-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.providers').
import type {} from './locales.ts'
import css from './ProvidersSection.module.css'

/** The prefix rule the product enforces, restated so the card can say so first. */
const PREFIX_PATTERN = /^[A-Z0-9]{4}$/

/** Props of {@link AddProviderForm}. */
export interface AddProviderFormProps {
  /** Section copy. */
  t: TranslateNS<'settings.providers'>
  /** Submit the draft; resolves with what the product decided. */
  onCreate: (draft: ProviderDraft) => Promise<{ ok: true } | { ok: false; reason: ProviderFailure }>
  /** Close the card; `created` reports whether a provider was actually added. */
  onClose: (created: boolean) => void
}

/** What the card can refuse on its own, before spending a request. */
function localFailure(draft: ProviderDraft): ProviderFailure | undefined {
  if (draft.displayName === '') return 'error.name'
  if (draft.prefix === '') return 'error.prefixRequired'
  if (!PREFIX_PATTERN.test(draft.prefix)) return 'error.prefixFormat'
  if (draft.apiUrl === '' || draft.apiKey === '') return 'error.fields'
  return undefined
}

/**
 * Render the Add Provider card.
 * @param props - copy plus the submit and close callbacks.
 * @returns the card.
 */
export function AddProviderForm({ t, onCreate, onClose }: AddProviderFormProps): ReactNode {
  const [displayName, setDisplayName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ProviderFailure | undefined>(undefined)

  const draft = (): ProviderDraft => ({
    displayName: displayName.trim(),
    prefix: prefix.trim().toUpperCase(),
    apiUrl: apiUrl.trim(),
    apiKey: apiKey.trim(),
  })

  const submit = (): void => {
    const next = draft()
    const local = localFailure(next)
    if (local !== undefined) {
      setFailure(local)
      return
    }
    setFailure(undefined)
    setBusy(true)
    void onCreate(next)
      .then((outcome) => {
        if (outcome.ok) {
          onClose(true)
          return
        }
        setFailure(outcome.reason)
      })
      // A transport failure rejects rather than answering; without this the
      // card would stay busy forever with nothing said.
      .catch(() => { setFailure('error.failed') })
      .finally(() => { setBusy(false) })
  }

  return (
    <div className={css.card}>
      <h3 className={css.cardTitle}>{t('add')}</h3>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.name')}</span>
        <input
          className={css.input}
          type="text"
          autoComplete="off"
          value={displayName}
          placeholder={t('form.namePlaceholder')}
          disabled={busy}
          onChange={(event) => { setDisplayName(event.target.value) }}
        />
      </label>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.prefix')}</span>
        <input
          className={clsx(css.input, css.prefixInput)}
          type="text"
          autoComplete="off"
          maxLength={4}
          value={prefix}
          placeholder={t('form.prefixPlaceholder')}
          disabled={busy}
          onChange={(event) => { setPrefix(event.target.value.toUpperCase()) }}
        />
      </label>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.url')}</span>
        <input
          className={css.input}
          type="text"
          autoComplete="off"
          value={apiUrl}
          placeholder={t('form.urlPlaceholder')}
          disabled={busy}
          onChange={(event) => { setApiUrl(event.target.value) }}
        />
      </label>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.key')}</span>
        <input
          className={css.input}
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={t('form.keyPlaceholder')}
          disabled={busy}
          onChange={(event) => { setApiKey(event.target.value) }}
        />
      </label>
      {failure === undefined ? null : <p className={css.failure}>{t(failure)}</p>}
      <div className={css.actions}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { onClose(false) }}>
          {t('form.cancel')}
        </Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
          {busy ? t('form.submitting') : t('form.submit')}
        </Button>
      </div>
    </div>
  )
}
