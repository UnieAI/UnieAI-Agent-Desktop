import type { ObservableSnapshot, SessionId } from '@unieai/uad-client-runtime/client'
import { Button, Modal } from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry).
import type {} from '@unieai/uad-client-ui-layout/client'
import type { SessionLogDownloadState } from './controller.ts'
import { NS } from './locales.ts'

/** Browser state and dismissal injected into the frame-wide dialog contribution. */
export interface SessionLogDownloadOverlayInjected {
  hooks: { sessionLogDownload: ObservableSnapshot<SessionLogDownloadState> }
  dismiss: (sessionId: SessionId) => void
}

/**
 * Full overlay props: the frame's empty owner share plus the bound controller
 * state, dismissal, and localized copy.
 */
export type SessionLogDownloadOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<SessionLogDownloadOverlayInjected>

/** One Session's dialog share, composed by the overlay from its own props. */
export type SessionLogDownloadDialogProps =
  Pick<SessionLogDownloadOverlayProps, 'useSessionLogDownload' | 'dismiss' | 't'>
  & {
    /** Session whose download entry this dialog reports. */
    sessionId: SessionId
  }

/**
 * Modal reporting one Session's download outcome.
 * @param props - Session id, bound controller state, dismissal, and localized copy.
 * @returns the modal portal contribution.
 */
export function SessionLogDownloadDialog({
  sessionId, useSessionLogDownload, dismiss, t,
}: SessionLogDownloadDialogProps) {
  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])

  const status = entry?.status
  const open = entry?.open === true
  const error = status === 'error' ? entry?.error || t('dialog.commandFailed') : null
  const title = status === 'downloading'
    ? t('dialog.preparingTitle')
    : status === 'success' ? t('dialog.successTitle') : t('dialog.errorTitle')
  const description = status === 'downloading'
    ? t('dialog.preparingDescription')
    : status === 'success' ? t('dialog.successDescription') : error ?? t('dialog.commandFailed')

  return (
    <Modal
      open={open}
      onClose={() => { dismiss(sessionId) }}
      title={title}
      description={description}
      closeLabel={t('dialog.close')}
      footer={<Button variant="primary" onClick={() => { dismiss(sessionId) }}>{t('dialog.close')}</Button>}
    />
  )
}

/**
 * Frame-wide seat for every Session's download dialog.
 *
 * The dialog cannot live where the gesture starts: the sidebar row's menu row
 * unmounts the moment the menu closes, and `/export` runs with no Session
 * surface open at all. `shell.overlay` outlives both, so one entry reports
 * whichever Sessions currently have an open dialog.
 * @param props - bound controller state, dismissal, and localized copy.
 * @returns one dialog per Session with an open download entry.
 */
export function SessionLogDownloadOverlay(props: SessionLogDownloadOverlayProps) {
  const bySession = props.useSessionLogDownload(state => state.bySession)
  return (
    <>
      {Object.entries(bySession)
        .filter(([, entry]) => entry?.open === true)
        .map(([sessionId]) => (
          <SessionLogDownloadDialog
            key={sessionId}
            sessionId={sessionId as SessionId}
            useSessionLogDownload={props.useSessionLogDownload}
            dismiss={props.dismiss}
            t={props.t}
          />
        ))}
    </>
  )
}
