/**
 * The change-avatar dialog, in the reference form's own two steps: pick a
 * file, then look at exactly the square that will be kept and confirm it.
 *
 * The preview is the crop, not a thumbnail of the original. That is the whole
 * reason the step exists — a cropper that does not show its crop leaves the
 * user to discover on save that their head was cut off — so the square is
 * drawn at the kept region with a hairline circle over it marking how an
 * avatar will mask it. An animated GIF has no crop to show and is drawn whole.
 */
import { useRef, useState, type ChangeEvent } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UnieAiAvatarUpload } from '../account-contract.ts'
import {
  ACCEPTED_EXTENSIONS, FORMATS_HINT, centerCropSquare, describeUpload, extensionOf, isAcceptedImage,
} from './avatar.ts'
import type { AccountKey } from './locales.ts'
import css from './AvatarEditorDialog.module.css'

/** One picked file, held until the user confirms or discards it. */
interface Preview {
  /** The file as a data URL. */
  src: string
  /** Whether it is an animated format that must not be re-encoded. */
  animated: boolean
}

/** Props of the change-avatar dialog. */
export interface AvatarEditorDialogProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Whether a profile save is in flight, which freezes both actions. */
  saving: boolean
  /** Section copy. */
  t: Translate<AccountKey>
  /** Close without choosing anything. */
  onClose: () => void
  /**
   * A new avatar was confirmed.
   * @param upload - the image to store.
   * @param animated - whether it was passed through rather than cropped, which
   * the caller reports in different words.
   */
  onPicked: (upload: UnieAiAvatarUpload, animated: boolean) => void
  /**
   * The pick could not be used.
   * @param message - localized text explaining why.
   */
  onFailed: (message: string) => void
}

/**
 * Render the change-avatar dialog.
 * @param props - visibility, copy, and the three outcomes.
 * @returns the dialog element tree; nothing while closed.
 */
export function AvatarEditorDialog({ open, saving, t, onClose, onPicked, onFailed }: AvatarEditorDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const discard = (): void => { setPreview(null) }

  const close = (): void => {
    discard()
    onClose()
  }

  const pick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // Clearing the input is what lets the same file be picked twice in a row;
    // without it the second pick fires no change event.
    event.target.value = ''
    if (file === undefined) return
    if (!isAcceptedImage(file.name, file.type)) {
      onFailed(t('profile.unsupportedImage'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => { onFailed(t('profile.readImageFailed')) }
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : ''
      if (src === '') {
        onFailed(t('profile.readImageFailed'))
        return
      }
      setPreview({
        src,
        animated: file.type.toLowerCase() === 'image/gif' || extensionOf(file.name) === '.gif',
      })
    }
    reader.readAsDataURL(file)
  }

  const confirm = async (): Promise<void> => {
    /* v8 ignore next -- Confirm is only rendered once a preview exists; the guard is what narrows the type */
    if (preview === null) return
    if (preview.animated) {
      onPicked(describeUpload(preview.src), true)
      discard()
      return
    }
    const cropped = await centerCropSquare(preview.src).catch(() => undefined)
    if (cropped === undefined) {
      onFailed(t('profile.saveAvatarFailed'))
      return
    }
    onPicked(describeUpload(cropped), false)
    discard()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('profile.changeAvatar')}
      // Distinct from Cancel on purpose: Cancel returns to the picker, the ×
      // leaves the dialog entirely, and two controls in one dialog must not
      // answer to the same name.
      closeLabel={t('profile.close')}
      footer={preview === null
        ? undefined
        : (
          <div className={css.dialogActions}>
            <Button variant="outline" disabled={saving} onClick={discard}>{t('profile.cancel')}</Button>
            <Button variant="primary" disabled={saving} onClick={() => { void confirm() }}>
              {saving ? t('profile.saving') : t('profile.confirm')}
            </Button>
          </div>
        )}
    >
      {preview === null
        ? (
          <div className={css.dropZone}>
            <input
              ref={picker}
              className={css.picker}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              aria-label={t('profile.selectAvatar')}
              onChange={pick}
            />
            <Button variant="primary" disabled={saving} onClick={() => { picker.current?.click() }}>
              {t('profile.selectAvatar')}
            </Button>
            <p className={css.formats}>{FORMATS_HINT}</p>
          </div>
        )
        : preview.animated
          ? (
            <div className={css.animatedPreview}>
              <img className={css.animatedImage} src={preview.src} alt={t('profile.changeAvatar')} />
            </div>
          )
          : (
            <div className={css.cropPreview}>
              <img className={css.cropImage} src={preview.src} alt={t('profile.changeAvatar')} />
              <span className={css.cropMask} aria-hidden />
            </div>
          )}
    </Modal>
  )
}
