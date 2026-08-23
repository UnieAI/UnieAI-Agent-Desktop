/**
 * Notifications settings surface, browser half.
 *
 * What the desktop app can observe is a turn finishing in the local host: the
 * sessions list already carries a `running` bit per session, and its
 * running→idle edge is the completion this section acts on. Nothing here talks
 * to the host, and nothing here needs to — a completion the client can already
 * see does not need to be pushed to it.
 */
import type { SessionId } from '@unieai/uad-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
// Cross-plugin collaboration goes through services, never a value import.
import type {} from '@unieai/uad-client-ui-settings/client'
import { NotificationsSection } from './NotificationsSection.tsx'
import type { NotificationsSectionInjected } from './NotificationsSection.tsx'
import { SessionCompletionWatcher, browserCompletionEnvironment } from './completion-watcher.ts'
import { NotificationsSettingsController } from './notifications-controller.ts'
import { browserNotificationPort } from './notification-port.ts'
import {
  NOTIFY_SOUNDS, browserNotifySoundPlayer, browserNotifySoundStorage,
} from './notify-sounds.ts'
import { en, ja, zh, zhTW, type NotificationsLocaleKey } from './locales.ts'

export type { NotificationsSectionInjected, NotificationsSectionProps } from './NotificationsSection.tsx'
export type {
  CompletionWatcherEnvironment, SessionCompletion, SessionCompletionList, SessionCompletionRow,
} from './completion-watcher.ts'
export type {
  CompletionCopy, NotificationsControllerOptions, NotificationsSettingsState,
} from './notifications-controller.ts'
export type {
  NotificationAccess, NotificationPort, NotificationRequest,
} from './notification-port.ts'
export type { NotifySound, NotifySoundPlayer, NotifySoundStorage } from './notify-sounds.ts'
export type { NotificationsLocaleKey } from './locales.ts'

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Notifications settings page copy. */
    'settings.notifications': NotificationsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.notifications'

/** Nav position: a personal preference page, between General (0) and Models (10). */
const SECTION_ORDER = 5

/**
 * Required services (cordis fiber inject). `settings.section` is declared by
 * the settings shell, whose activation order relative to this one is NOT
 * constrained; the registration waits on the declaration through
 * `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Register the Notifications section and start watching for finished turns.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-settings-notifications: dictionaries',
  )

  const t = ctx.locale.bind(NS)
  const controller = new NotificationsSettingsController({
    port: browserNotificationPort(),
    player: browserNotifySoundPlayer(),
    storage: browserNotifySoundStorage(),
    copy: {
      heading: () => t('complete.heading'),
      body: (title: string) => t('complete.body', { title: title === '' ? t('complete.untitled') : title }),
    },
    openSession: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
    focusWindow: () => {
      /* v8 ignore next -- jsdom defines window; the guard covers node e2e boots */
      if (typeof window !== 'undefined') window.focus()
    },
  })

  // The list is the completion source; the watcher holds only the previous
  // running bits, so disposing the fiber leaves nothing behind.
  const watcher = new SessionCompletionWatcher(
    ctx.sessions.list,
    browserCompletionEnvironment(),
    (completion) => { controller.announce(completion) },
  )
  ctx.effect(() => watcher.start(), 'ui-settings-notifications: turn completions')

  // A permission revoked in the browser's site settings never reaches the
  // page, so the state is re-read whenever the window comes back on screen.
  ctx.effect(() => {
    /* v8 ignore next -- jsdom defines document; the guard covers node e2e boots */
    if (typeof document === 'undefined') return () => {}
    const onVisibility = (): void => { controller.refreshAccess() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, 'ui-settings-notifications: permission refresh')

  const injected = (): NotificationsSectionInjected => ({
    hooks: { notifications: controller },
    sounds: NOTIFY_SOUNDS,
    enable: () => { void controller.enable() },
    chooseSound: (id: string) => { controller.chooseSound(id) },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'notifications',
    order: SECTION_ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, NotificationsSection))
}
