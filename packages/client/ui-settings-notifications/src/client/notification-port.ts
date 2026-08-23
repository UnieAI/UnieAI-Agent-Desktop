/**
 * The browser notification seam.
 *
 * The desktop app is a page the host serves on 127.0.0.1, which is a secure
 * context, so `Notification` is available and a notification raised while the
 * window is in the background reaches the OS notification centre. Web Push
 * (a service worker plus a VAPID-signed server sender) is a different
 * mechanism and this deployment has none — see the package README.
 */

/** What the browser will currently do with a notification request. */
export type NotificationAccess =
  /** No `Notification` in this runtime (node e2e boot, or an insecure origin). */
  | 'unsupported'
  /** Available, permission not decided — the Enable button can ask. */
  | 'default'
  /** Permission granted; notifications reach the OS. */
  | 'granted'
  /** Refused. Only the browser's own site settings can undo this. */
  | 'denied'

/** One notification this package raises. */
export interface NotificationRequest {
  /** Notification title line. */
  readonly title: string
  /** Notification body line. */
  readonly body: string
  /**
   * Coalescing key. Two completions of the same session replace each other
   * instead of stacking, so a long unattended run leaves one entry.
   */
  readonly tag: string
  /**
   * Invoked when the user activates the notification. The page focuses itself
   * and opens the session that finished.
   */
  readonly onActivate: () => void
}

/** The browser capability, narrowed to what this package uses. */
export interface NotificationPort {
  /**
   * Current permission state.
   * @returns the access level, without asking for anything.
   */
  access(): NotificationAccess
  /**
   * Ask the browser for permission. Callers must invoke this from a user
   * gesture: Chrome and Safari both refuse (and Chrome permanently denies) a
   * prompt raised on page load.
   * @returns the access level after the user answered.
   */
  request(): Promise<NotificationAccess>
  /**
   * Raise one notification. A no-op unless {@link access} is `granted`.
   * @param request - the notification to show.
   */
  show(request: NotificationRequest): void
}

/**
 * Read the browser's permission value.
 * @returns the access level for the ambient `Notification` constructor.
 */
function browserAccess(): NotificationAccess {
  if (typeof Notification === 'undefined') return 'unsupported'
  const permission = Notification.permission
  return permission === 'granted' || permission === 'denied' ? permission : 'default'
}

/**
 * Build the port backed by the browser's own Notification API.
 * @returns a port that reports `unsupported` wherever the API is absent.
 */
export function browserNotificationPort(): NotificationPort {
  return {
    access: browserAccess,
    async request(): Promise<NotificationAccess> {
      if (typeof Notification === 'undefined') return 'unsupported'
      try {
        await Notification.requestPermission()
      } catch {
        // Some browsers reject rather than resolve on a non-gesture call; the
        // permission value below is still the authority on what happened.
      }
      return browserAccess()
    },
    show({ title, body, tag, onActivate }: NotificationRequest): void {
      if (browserAccess() !== 'granted') return
      try {
        const notification = new Notification(title, { body, tag })
        notification.onclick = () => {
          onActivate()
          notification.close()
        }
      } catch {
        // A browser that requires a service-worker registration for
        // notifications throws here; there is nothing to fall back to.
      }
    },
  }
}
