/**
 * The Edit Provider card: what the UnieAI web product's own provider card lets
 * a person change, drawn with this app's tokens.
 *
 * The card renders exactly what the product will accept, decided from one
 * flag. A BYO row offers the four create fields plus the enable switch, the
 * per-model selection, and Delete. A Studio-managed row offers ONLY the enable
 * switch and the per-model selection: its credential, endpoint and catalogue
 * belong to the Studio binding, and it is removed by unbinding that account
 * rather than by deleting the row. Drawing the wider form for a managed row
 * and letting the product answer 409 would be worse than not drawing it — the
 * refusal would arrive after the typing, not before it.
 *
 * The API Key field is write-only in both directions of the word: nothing can
 * read the stored credential back, so the field starts blank and a blank field
 * omits `apiKey` from the patch entirely. An empty string would reach the
 * product as an instruction to erase the key, and a rename would silently
 * break the provider.
 *
 * Deleting is confirmed in place rather than optimistically: a provider going
 * away takes every model it offered with it, which the confirmation says.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button } from '@unieai/uad-client-ui-primitives'
import type { TranslateNS } from '@unieai/uad-client-ui-slots'
import type { ProviderFailure, ProviderOutcome, ProviderPatch, ProviderRow } from './provider-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.providers').
import type {} from './locales.ts'
import css from './ProvidersSection.module.css'

/** The prefix rule the product enforces, restated so the card can say so first. */
const PREFIX_PATTERN = /^[A-Z0-9]{4}$/

/** What one closed card leaves behind on the section. */
export type EditResult = 'saved' | 'deleted' | undefined

/** Props of {@link EditProviderForm}. */
export interface EditProviderFormProps {
  /** Section copy. */
  t: TranslateNS<'settings.providers'>
  /** The provider being edited, as the product last reported it. */
  row: ProviderRow
  /** Apply the patch; resolves with what the product decided. */
  onSave: (patch: ProviderPatch) => Promise<ProviderOutcome>
  /** Remove the provider; resolves with what the product decided. */
  onDelete: () => Promise<ProviderOutcome>
  /** Close the card, naming what it changed. */
  onClose: (result: EditResult) => void
}

/** What the card can refuse on its own, before spending a request. */
function localFailure(patch: ProviderPatch): ProviderFailure | undefined {
  if (patch.displayName === '') return 'error.name'
  if (patch.prefix === '') return 'error.prefixRequired'
  if (patch.prefix !== undefined && !PREFIX_PATTERN.test(patch.prefix)) return 'error.prefixFormat'
  if (patch.apiUrl === '') return 'error.fields'
  return undefined
}

/**
 * Render the Edit Provider card.
 * @param props - the row, the section's copy, and the three callbacks.
 * @returns the card.
 */
export function EditProviderForm({ t, row, onSave, onDelete, onClose }: EditProviderFormProps): ReactNode {
  const [displayName, setDisplayName] = useState(row.displayName)
  const [prefix, setPrefix] = useState(row.prefix)
  const [apiUrl, setApiUrl] = useState(row.apiUrl)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(row.enabled)
  const [selected, setSelected] = useState<readonly string[]>(row.selectedModels)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'saving' | 'deleting' | undefined>(undefined)
  const [failure, setFailure] = useState<ProviderFailure | undefined>(undefined)

  const name = row.displayName === '' ? row.prefix : row.displayName
  const working = busy !== undefined

  const toggleModel = (id: string): void => {
    setSelected(prev => prev.includes(id) ? prev.filter(one => one !== id) : [...prev, id])
  }

  /** The patch this card submits: the managed subset, or the whole row. */
  const patch = (): ProviderPatch => {
    const typedKey = apiKey.trim()
    // A managed row's other fields are the Studio binding's; sending them
    // would earn the product's 409 for a value this card never showed.
    if (row.managed) return { enabled, selectedModels: [...selected] }
    return {
      displayName: displayName.trim(),
      prefix: prefix.trim().toUpperCase(),
      apiUrl: apiUrl.trim(),
      enabled,
      selectedModels: [...selected],
      ...(typedKey === '' ? {} : { apiKey: typedKey }),
    }
  }

  const save = (): void => {
    const next = patch()
    const local = localFailure(next)
    if (local !== undefined) {
      setFailure(local)
      return
    }
    setFailure(undefined)
    setBusy('saving')
    void onSave(next)
      .then((outcome) => {
        if (outcome.ok) {
          onClose('saved')
          return
        }
        setFailure(outcome.reason)
      })
      // A transport failure rejects rather than answering; without this the
      // card would stay busy forever with nothing said.
      .catch(() => { setFailure('error.failed') })
      .finally(() => { setBusy(undefined) })
  }

  const remove = (): void => {
    setFailure(undefined)
    setBusy('deleting')
    void onDelete()
      .then((outcome) => {
        if (outcome.ok) {
          onClose('deleted')
          return
        }
        setFailure(outcome.reason)
        setConfirming(false)
      })
      .catch(() => { setFailure('error.deleteFailed'); setConfirming(false) })
      .finally(() => { setBusy(undefined) })
  }

  return (
    <div className={css.card}>
      <h3 className={css.cardTitle}>{t('edit')}: {name}</h3>
      {row.managed
        ? <p className={css.note}>{t('managedEditable')}</p>
        : (
          <>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('form.name')}</span>
              <input
                className={css.input}
                type="text"
                autoComplete="off"
                value={displayName}
                placeholder={t('form.namePlaceholder')}
                disabled={working}
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
                disabled={working}
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
                disabled={working}
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
                placeholder={t('form.keyKeep')}
                disabled={working}
                onChange={(event) => { setApiKey(event.target.value) }}
              />
            </label>
          </>
        )}
      <label className={css.switch}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={working}
          onChange={(event) => { setEnabled(event.target.checked) }}
        />
        <span className={css.fieldLabel}>{t('form.enabled')}</span>
      </label>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          {t('form.models', { selected: String(selected.length), total: String(row.models.length) })}
        </span>
        {row.models.length === 0
          ? <p className={css.note}>{t('form.noModels')}</p>
          : (
            <>
              <div className={css.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => { setSelected([...row.models]) }}
                >
                  {t('form.selectAll')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => { setSelected([]) }}
                >
                  {t('form.clearAll')}
                </Button>
              </div>
              <ul className={css.models}>
                {row.models.map(id => (
                  <li key={id}>
                    <label className={css.switch}>
                      <input
                        type="checkbox"
                        checked={selected.includes(id)}
                        disabled={working}
                        onChange={() => { toggleModel(id) }}
                      />
                      <span className={css.modelId}>{id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
      {failure === undefined ? null : <p className={css.failure}>{t(failure)}</p>}
      {/* A managed row is removed by unbinding the Studio account. Offering
          delete here would only invite a click the product has to refuse. */}
      {row.managed ? <p className={css.note}>{t('managedNoDelete')}</p> : null}
      {confirming
        ? (
          <div className={css.confirm} role="alertdialog" aria-label={t('delete')}>
            <p className={css.confirmTitle}>{t('confirmDelete', { name })}</p>
            <p className={css.note}>{t('deleteWarning')}</p>
            <div className={css.actions}>
              <Button
                variant="outline"
                size="sm"
                disabled={working}
                onClick={() => { setConfirming(false) }}
              >
                {t('form.cancel')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={css.danger}
                disabled={working}
                onClick={remove}
              >
                {busy === 'deleting' ? t('deleting') : t('delete')}
              </Button>
            </div>
          </div>
        )
        : (
          <div className={css.actions}>
            <Button variant="outline" size="sm" disabled={working} onClick={() => { onClose(undefined) }}>
              {t('form.cancel')}
            </Button>
            <Button variant="primary" size="sm" disabled={working} onClick={save}>
              {busy === 'saving' ? t('saving') : t('save')}
            </Button>
            {row.managed
              ? null
              : (
                <Button
                  variant="ghost"
                  size="sm"
                  className={css.danger}
                  disabled={working}
                  onClick={() => { setFailure(undefined); setConfirming(true) }}
                >
                  {t('delete')}
                </Button>
              )}
          </div>
        )}
    </div>
  )
}
