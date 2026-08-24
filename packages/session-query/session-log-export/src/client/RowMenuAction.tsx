import type { ReactNode } from 'react'
import { IconDownloadOutline16, MenuItemButton } from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import type { SessionId } from '@unieai/uad-client-runtime/client'
// Type-only: pulls ui-workspace's SlotMap merge (the session-row menu hole).
import type {} from '@unieai/uad-client-ui-workspace/client'
import { NS } from './locales.ts'

/** Browser operation injected into the sidebar session-row menu contribution. */
export interface SessionLogDownloadRowActionInjected {
  request: (sessionId: SessionId) => Promise<void>
}

/** Full row props: the row's session and menu control, the request, and localized copy. */
export type SessionLogDownloadRowActionProps =
  PropsRuntime<'sidebar.workspaces.session.menu.action'>
  & PropsLocale<typeof NS>
  & InjectFace<SessionLogDownloadRowActionInjected>

/**
 * Render the Session-log download row of a sidebar session row's overflow menu.
 *
 * The download targets the owner-supplied `sessionId` — the row the menu
 * belongs to, which is the open Session only by coincidence. The menu closes
 * first because the row unmounts with it; the dialog reporting the outcome is
 * the package's `shell.overlay` entry.
 * @param props - the row's session, menu control, download request, and copy.
 * @returns the menu row.
 */
export function SessionLogDownloadRowAction({
  sessionId, closeMenu, request, t,
}: SessionLogDownloadRowActionProps): ReactNode {
  return (
    <MenuItemButton
      icon={<IconDownloadOutline16 />}
      label={t('menu.download')}
      onClick={() => {
        closeMenu()
        void request(sessionId)
      }}
    />
  )
}
