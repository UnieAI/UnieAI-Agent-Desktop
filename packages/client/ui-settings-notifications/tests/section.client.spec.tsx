// @vitest-environment jsdom
/**
 * The section as rendered: the Enable button exists only while the browser has
 * something left to decide, each settled permission reads as a sentence, and
 * the picker marks exactly one cue and reports every click.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NotificationsSection } from '../src/client/NotificationsSection.tsx'
import type { NotificationsSectionProps } from '../src/client/NotificationsSection.tsx'
import type { NotificationsSettingsState } from '../src/client/notifications-controller.ts'
import { NOTIFY_SOUNDS } from '../src/client/notify-sounds.ts'
import { en, type NotificationsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: NotificationsLocaleKey) => en[key]) as NotificationsSectionProps['t']

/** Section props over a fixed state snapshot. */
function props(
  state: Partial<NotificationsSettingsState>,
  overrides: Partial<NotificationsSectionProps> = {},
): NotificationsSectionProps {
  const snapshot: NotificationsSettingsState = {
    access: 'default', soundId: 'handoff', requesting: false, ...state,
  }
  return {
    t,
    useNotifications: (selector: (value: NotificationsSettingsState) => unknown) => selector(snapshot),
    sounds: NOTIFY_SOUNDS,
    enable: () => {},
    chooseSound: () => {},
    close: () => {},
    ...overrides,
  } as NotificationsSectionProps
}

describe('NotificationsSection', () => {
  it('offers the Enable button only while the permission is undecided', () => {
    const enable = vi.fn()
    render(<NotificationsSection {...props({ access: 'default' }, { enable })} />)

    const button = screen.getByRole('button', { name: en['desktop.enable'] })
    fireEvent.click(button)
    expect(enable).toHaveBeenCalledOnce()
    expect(screen.queryByText(en['desktop.enabled'])).toBeNull()
  })

  it('disables the button while the prompt is open, so no second one is raised', () => {
    const enable = vi.fn()
    render(<NotificationsSection {...props({ access: 'default', requesting: true }, { enable })} />)

    const button = screen.getByRole('button', { name: en['desktop.enable'] }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(enable).not.toHaveBeenCalled()
  })

  it('states each settled permission instead of offering a control that cannot act', () => {
    for (const [access, copy] of [
      ['granted', en['desktop.enabled']],
      ['denied', en['desktop.blocked']],
      ['unsupported', en['desktop.unsupported']],
    ] as const) {
      const view = render(<NotificationsSection {...props({ access })} />)
      expect(screen.getByText(copy)).toBeTruthy()
      expect(screen.queryByRole('button', { name: en['desktop.enable'] })).toBeNull()
      view.unmount()
    }
  })

  it('renders the whole catalog as one picker with the stored cue checked', () => {
    render(<NotificationsSection {...props({ soundId: 'portal' })} />)

    const group = screen.getByRole('radiogroup', { name: en['sound.pick'] })
    expect(group).toBeTruthy()
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(NOTIFY_SOUNDS.length)
    const checked = options.filter(option => option.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]?.textContent).toContain('Portal')
  })

  it('reports the cue the user clicked', () => {
    const chooseSound = vi.fn()
    render(<NotificationsSection {...props({}, { chooseSound })} />)

    fireEvent.click(screen.getByRole('radio', { name: /Milestone/ }))
    expect(chooseSound).toHaveBeenCalledWith('milestone')
  })

  it('titles both blocks from the dictionary', () => {
    render(<NotificationsSection {...props({})} />)
    expect(screen.getByRole('heading', { level: 2, name: en.title })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: en['desktop.title'] })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: en['sound.title'] })).toBeTruthy()
    expect(screen.getByText(en['desktop.desc'])).toBeTruthy()
    expect(screen.getByText(en['sound.desc'])).toBeTruthy()
  })
})
