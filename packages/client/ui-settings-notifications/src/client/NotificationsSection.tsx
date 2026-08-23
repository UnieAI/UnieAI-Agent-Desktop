/**
 * The Notifications settings page: what this device does when a task finishes
 * while you are not watching it.
 *
 * Two blocks, mirroring the UnieAI Copilot web product's notification
 * settings. The first block only ever renders a control when there is
 * something for it to do — once the browser has answered, the state is a
 * sentence, not a switch, because nothing on this page can change a granted or
 * blocked permission.
 */
import clsx from 'clsx'
import { IconCheckOutline16, IconPlayOutline16 } from '@unieai/uad-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import type { NotificationsSettingsState } from './notifications-controller.ts'
import type { NotifySound } from './notify-sounds.ts'
import css from './NotificationsSection.module.css'

/** Registration-side business face for the section. */
export interface NotificationsSectionInjected {
  hooks: {
    /** Permission state plus the selected cue. */
    notifications: HostObservable<NotificationsSettingsState>
  }
  /** The selectable cues, in picker order. */
  sounds: readonly NotifySound[]
  /** Ask the browser for notification permission (user gesture only). */
  enable: () => void
  /**
   * Select a cue and preview it.
   * @param id - catalog id.
   */
  chooseSound: (id: string) => void
}

/** Props the renderer binds for the section. */
export type NotificationsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.notifications'>
  & InjectFace<NotificationsSectionInjected>

/**
 * Render the Notifications page.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function NotificationsSection({
  t, useNotifications, sounds, enable, chooseSound,
}: NotificationsSectionProps) {
  const access = useNotifications(state => state.access)
  const requesting = useNotifications(state => state.requesting)
  const soundId = useNotifications(state => state.soundId)

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>

      <section className={css.block}>
        <div className={css.blockText}>
          <h3 className={css.blockTitle}>{t('desktop.title')}</h3>
          <p className={css.blockDesc}>{t('desktop.desc')}</p>
        </div>
        <div className={css.blockAction}>
          {access === 'default' ? (
            <button
              type="button"
              className={css.enable}
              disabled={requesting}
              onClick={enable}
            >
              {t('desktop.enable')}
            </button>
          ) : (
            <p className={css.note} data-access={access}>
              {access === 'granted' ? t('desktop.enabled')
                : access === 'denied' ? t('desktop.blocked')
                  : t('desktop.unsupported')}
            </p>
          )}
        </div>
      </section>

      <section className={clsx(css.block, css.blockStacked)}>
        <div className={css.blockText}>
          <h3 className={css.blockTitle}>{t('sound.title')}</h3>
          <p className={css.blockDesc}>{t('sound.desc')}</p>
        </div>
        <div className={css.sounds} role="radiogroup" aria-label={t('sound.pick')}>
          {sounds.map((sound) => {
            const active = sound.id === soundId
            return (
              <button
                key={sound.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={css.sound}
                data-active={active ? 'true' : undefined}
                onClick={() => { chooseSound(sound.id) }}
              >
                <span className={css.soundLabel}>
                  <IconPlayOutline16 className={css.soundGlyph} size={14} />
                  {sound.label}
                </span>
                {active ? <IconCheckOutline16 className={css.soundCheck} size={14} /> : null}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
