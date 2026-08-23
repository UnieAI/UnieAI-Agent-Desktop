// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { PluginsNavRowComponentProps } from '../src/client/shell-contract.ts'
import { PluginsNavRow } from '../src/client/PluginsNavRow.tsx'
import { SettingsPanelController } from '../src/client/settings-panel-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t: PluginsNavRowComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key
const unusedHook = (() => { throw new Error('unused by PluginsNavRow') }) as never

function mount({ wide = true, sections = [{ id: 'general', order: 0, label: 'General' }, { id: 'plugins', order: 30, label: 'Plugins' }] } = {}) {
  const panel = new SettingsPanelController()
  const props: PluginsNavRowComponentProps = {
    wide,
    t,
    useSessions: unusedHook,
    useWorkspaces: unusedHook,
    useSections: select => select(sections),
    useOnboardingSteps: unusedHook,
    usePanel: bindSnapshotSelector(panel.store),
    openPanel: (sectionId, anchorId) => { panel.open(sectionId, anchorId) },
    selectSection: (sectionId) => { panel.select(sectionId) },
    closePanel: () => { panel.close() },
  }
  const view = render(<PluginsNavRow {...props} />)
  return { view, panel }
}

describe('PluginsNavRow', () => {
  it('opens the settings panel at the plugins section', () => {
    const { panel } = mount()
    expect(panel.store.getSnapshot()).toEqual({ open: false, sectionId: null, anchorId: null })
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
    expect(panel.store.getSnapshot()).toEqual({ open: true, sectionId: 'plugins', anchorId: null })
  })

  it('drops its label on the rail and keeps the name in a tooltip title', () => {
    mount({ wide: false })
    const row = screen.getByRole('button', { name: 'Plugins' })
    expect(row.textContent).toBe('')
    expect(row.getAttribute('title')).toBe('Plugins')
  })

  it('renders nothing when no plugins section is registered', () => {
    const { view } = mount({ sections: [{ id: 'general', order: 0, label: 'General' }] })
    expect(view.container.firstChild).toBeNull()
  })
})

describe('SettingsPanelController', () => {
  it('opens at a section and anchor, and a hand selection drops the anchor', () => {
    const panel = new SettingsPanelController()
    panel.open()
    expect(panel.store.getSnapshot()).toEqual({ open: true, sectionId: null, anchorId: null })
    panel.open('unieai-account', 'usage')
    expect(panel.store.getSnapshot()).toEqual({ open: true, sectionId: 'unieai-account', anchorId: 'usage' })
    // Navigating by hand supersedes the request that carried the anchor.
    panel.select('models')
    expect(panel.store.getSnapshot()).toEqual({ open: true, sectionId: 'models', anchorId: null })
    panel.close()
    expect(panel.store.getSnapshot()).toEqual({ open: false, sectionId: null, anchorId: null })
  })
})
