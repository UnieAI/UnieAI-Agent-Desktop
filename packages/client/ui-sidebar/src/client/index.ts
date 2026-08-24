/** Registers the sidebar shell into the layout-owned slot. */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import type { SidebarRootInjected } from './contract/slots.ts'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, ja, zh, zhTW, type SidebarKey } from './locales.ts'

export type {
  SidebarAccountOwnerProps, SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps,
  SidebarFooterActionOwnerProps, SidebarNavActionOwnerProps, SidebarRootComponentProps,
  SidebarRootInjected, SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from './contract/slots.ts'
export type { SidebarKey } from './locales.ts'

declare module '@unieai/cordis' {
  interface Events {
    /**
     * The sidebar sent the reader back to the conversation.
     *
     * Emitted on the ACT, not on the state it produces: starting a session
     * while a blank one is already current changes nothing observable, so a
     * surface covering the conversation cannot learn about it from the session
     * store. Anything rendered over the shell listens here to get out of the
     * way.
     */
    'sidebar/navigate': () => void
  }
}

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar shell controls copy. */
    sidebar: SidebarKey
  }
}

/** Dictionary namespace owned by this plugin (shell controls copy). */
const NS = 'sidebar'

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'locale']

/** Registers the sidebar shell and its service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }), 'ui-sidebar: dictionaries')

  const injectProps = (): SidebarRootInjected => ({
    // The shell's New Session button rides the runtime's shared action
    // (current Session Workspace, then recent Workspace).
    startSession: (workspaceId) => {
      ctx.workspaces.startSession(workspaceId)
      ctx.emit('sidebar/navigate')
    },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
  })
  ctx.effect(
    () => ctx.slots.register({
      name: 'sidebar',
      locale: NS,
      // The shell owns geometry; nav rows under New chat arrive through
      // `sidebar.nav.action`, ui-workspace registers the whole browsing
      // region (header, search, session list, workspace dialogs), ui-settings
      // registers the foot trigger + settings panel, and ui-unieai-account
      // registers the account occupant beside it.
      children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'sidebar.nav.action': { kind: 'list', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'sidebar.account': { kind: 'single', scope: 'root' },
      },
      inject: injectProps,
    }, SidebarRoot),
    'ui-sidebar: slot registration',
  )
}
