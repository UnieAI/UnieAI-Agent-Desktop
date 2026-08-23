/**
 * The identity header of the Account section, and the place the profile is
 * EDITED. There is no separate profile card any more: the 64px mark the page
 * opens with is the change-avatar trigger, and the display name beside it
 * turns into a field in place.
 *
 * Why an explicit edit control rather than a click-anywhere-on-the-name
 * gesture: a header that silently accepts a click teaches nobody it does, and
 * a touch reader never discovers it at all — the same reason the mark carries
 * a persistent pencil chip instead of a hover overlay. So the name keeps a
 * small pencil beside it, and pressing it swaps the line for the field.
 *
 * The form opens for BOTH edits. Staging a photo opens the field too, because
 * a staged photo still needs the one Save that stores it, and a Save button
 * standing alone over a header would be attached to nothing the reader can
 * see. Closing it — Cancel, or a save the supplier accepted — drops every
 * local edit, so the header falls straight back to the stored account.
 *
 * The component keeps no copy of the stored profile: the field and the mark
 * fall back to the identity it was handed and are overridden only by an edit
 * actually made, so a save that lands anywhere is adopted the moment the
 * snapshot moves.
 */
import { useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconEditOutline16, IconUserOutline16, Input, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  UnieAiAccountIdentity, UnieAiAvatarUpload, UnieAiProfilePatch, UnieAiProfileSaveReason,
  UnieAiProfileSaveResult,
} from '../account-contract.ts'
import { AvatarEditorDialog } from './AvatarEditorDialog.tsx'
import type { AccountKey } from './locales.ts'
import { monogram } from './monogram.ts'
import css from './AccountSection.module.css'

/**
 * The line each refusal prints.
 *
 * The supplier says WHICH refusal happened; the words are this section's own,
 * in every locale it already ships, and each one is the line the UnieAI web
 * product's own profile form prints for that refusal. A refusal the supplier
 * did not identify falls back to the general failure line, which is what every
 * refusal used to get.
 */
const FAILURE_COPY: Readonly<Record<UnieAiProfileSaveReason, AccountKey>> = {
  'name-required': 'profile.displayNameRequired',
  'avatar-format': 'profile.unsupportedImage',
  'avatar-payload': 'profile.saveAvatarFailed',
}

/** Props of the editable identity header. */
export interface ProfileHeaderProps {
  /** The stored identity this header draws and edits. */
  identity: UnieAiAccountIdentity
  /** The plan line under the name; absent where the supplier reported none. */
  planLabel: string | undefined
  /** Section copy. */
  t: Translate<AccountKey>
  /**
   * Store the change.
   * @param patch - the display name, and an avatar only when one was picked.
   * @returns whether the supplier stored it.
   */
  saveProfile: (patch: UnieAiProfilePatch) => Promise<UnieAiProfileSaveResult>
}

/**
 * Render the identity header with its in-place editor.
 * @param props - the stored identity, the plan line, section copy, and the save.
 * @returns the header element tree.
 */
export function ProfileHeader({ identity, planLabel, t, saveProfile }: ProfileHeaderProps) {
  const [draftName, setDraftName] = useState<string | null>(null)
  const [pendingAvatar, setPendingAvatar] = useState<UnieAiAvatarUpload | null>(null)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null)
  const noticeSeq = useRef(0)

  const name = draftName ?? identity.displayName
  const avatarUrl = pendingAvatar?.dataUrl ?? identity.avatarUrl
  const initial = monogram(identity)
  const blank = name.trim() === ''

  const announce = (text: string): void => {
    noticeSeq.current += 1
    setNotice({ seq: noticeSeq.current, text })
  }

  const close = (): void => {
    setEditing(false)
    setDraftName(null)
    setPendingAvatar(null)
  }

  const submit = async (): Promise<void> => {
    if (blank) {
      announce(t('profile.displayNameRequired'))
      return
    }
    setSaving(true)
    const result = await saveProfile({
      displayName: name.trim(),
      // Absent, not null: a name-only save must leave the stored photo alone.
      ...(pendingAvatar === null ? {} : { avatar: pendingAvatar }),
    })
    setSaving(false)
    if (result.status !== 'saved') {
      announce(result.reason === undefined ? t('profile.updateFailed') : t(FAILURE_COPY[result.reason]))
      return
    }
    // The snapshot now carries what was stored, so the local edits are dropped
    // rather than left standing beside it.
    close()
    announce(t('profile.updated'))
  }

  return (
    <form
      className={css.overview}
      onSubmit={(event) => { event.preventDefault(); void submit() }}
    >
      <div className={css.mark}>
        {/* The mark IS the change-avatar affordance, so it keeps a visible
            target: a hairline ring and a persistent pencil chip, rather than a
            hover-only overlay that no touch user ever sees. */}
        <button
          type="button"
          className={clsx(css.overviewMark, css.markButton)}
          disabled={saving}
          aria-label={t('profile.changeAvatar')}
          onClick={() => { setPicking(true) }}
        >
          {avatarUrl !== undefined
            ? <img className={css.avatarImage} src={avatarUrl} alt="" />
            : initial !== ''
              ? initial
              : <IconUserOutline16 className={css.overviewGlyph} size={26} />}
        </button>
        <span className={css.markChip} aria-hidden><IconEditOutline16 size={12} /></span>
      </div>

      <div className={clsx(css.overviewText, editing && css.overviewTextEditing)}>
        {editing
          ? (
            <>
              <Input
                className={clsx(css.nameInput)}
                value={name}
                aria-label={t('profile.displayName')}
                placeholder={t('profile.displayName')}
                disabled={saving}
                onChange={(event) => { setDraftName(event.target.value) }}
              />
              <div className={css.nameActions}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={saving || blank}
                  onClick={() => { void submit() }}
                >
                  {saving ? t('profile.saving') : t('profile.save')}
                </Button>
                <Button variant="outline" size="sm" disabled={saving} onClick={close}>
                  {t('profile.cancel')}
                </Button>
              </div>
            </>
          )
          : (
            <>
              <span className={css.nameRow}>
                <span className={css.overviewName}>{identity.displayName}</span>
                <button
                  type="button"
                  className={css.nameEdit}
                  aria-label={t('profile.editName')}
                  onClick={() => { setEditing(true) }}
                >
                  <IconEditOutline16 size={14} />
                </button>
              </span>
              {planLabel !== undefined && planLabel !== ''
                && <span className={css.overviewMeta}>{planLabel}</span>}
            </>
          )}
      </div>

      <AvatarEditorDialog
        open={picking}
        saving={saving}
        t={t}
        onClose={() => { setPicking(false) }}
        onPicked={(upload, animated) => {
          setPendingAvatar(upload)
          setPicking(false)
          // The staged photo needs the same Save the name does, so it opens the
          // field rather than leaving that button attached to nothing.
          setEditing(true)
          // The reference says the same thing here: the avatar is staged, and
          // Save is still what stores it.
          announce(animated ? t('profile.avatarUpdatedGif') : t('profile.avatarUpdated'))
        }}
        onFailed={announce}
      />
      {notice !== null && (
        <Toast key={notice.seq} text={notice.text} onDone={() => { setNotice(null) }} />
      )}
    </form>
  )
}
