/**
 * Browser plugin owning Session export download state, its sidebar row menu
 * entry, and the frame-wide modal both that entry and `/export` report through.
 */

import type { ClientContext, SessionId } from '@unieai/uad-client-runtime/client'
import type {} from '@unieai/uad-client-locale/client'
import type {} from '@unieai/uad-client-ui-commands/client'
import { SessionLogDownloadController } from './controller.ts'
import type { SessionLogDownloadOverlayInjected } from './Dialog.tsx'
import { SessionLogDownloadOverlay } from './Dialog.tsx'
import type { SessionLogDownloadRowActionInjected } from './RowMenuAction.tsx'
import { SessionLogDownloadRowAction } from './RowMenuAction.tsx'
import { en, ja, NS, zh, zhTW, type SessionLogDownloadKey } from './locales.ts'

declare module '@unieai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale']

/**
 * Provide the download controller, add its row to every sidebar session row's
 * overflow menu, and mount the result modal on the frame-wide overlay.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new SessionLogDownloadController()
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }), 'session-log-download: browser dictionaries')
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName === 'export' && result.kind === 'success') void controller.download(sessionId)
  })
  // The row acts on the session its menu belongs to, which the owner share
  // carries; the browsing region never claims it is the open one.
  ctx.slots.inject('sidebar.workspaces.session.menu.action', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.action',
    id: 'session-log-download',
    locale: NS,
    inject: (): SessionLogDownloadRowActionInjected => ({
      request: (sessionId: SessionId) => controller.download(sessionId),
    }),
  }, SessionLogDownloadRowAction))
  // The dialog outlives both entry paths: the menu row unmounts with its menu,
  // and `/export` can run with no Session surface open.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'session-log-download',
    locale: NS,
    inject: (): SessionLogDownloadOverlayInjected => ({
      hooks: { sessionLogDownload: controller.store },
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
    }),
  }, SessionLogDownloadOverlay))
}

export type {
  SessionLogDownloadDialogProps, SessionLogDownloadOverlayInjected, SessionLogDownloadOverlayProps,
} from './Dialog.tsx'
export type { SessionLogDownloadRowActionInjected, SessionLogDownloadRowActionProps } from './RowMenuAction.tsx'
