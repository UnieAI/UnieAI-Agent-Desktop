// @vitest-environment jsdom
/**
 * The plugin directory and the skills destination as the reader meets them.
 *
 * The postures that carry the design: the surface's four no-catalogue answers
 * are stated rather than shown as an empty list, the sections that DO appear
 * are the ones the catalogue can fill (search, what this account installed,
 * the filters it can answer, the categories the manifests declared), an
 * installed row folds its one remaining action behind the overflow, and the
 * skills destination says outright that this build has no catalogue to list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@unieai/uad-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import { DirectoryArea } from '../src/client/DirectoryArea.tsx'
import type { DirectoryAreaComponentProps } from '../src/client/DirectoryArea.tsx'
import type { SkillCatalogEntry } from '@unieai/uad-api-remotes/client'
import { SkillsArea } from '../src/client/SkillsArea.tsx'
import type { SkillsAreaComponentProps } from '../src/client/SkillsArea.tsx'
import type { DirectoryRow, DirectoryState } from '../src/client/directory-source.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as DirectoryAreaComponentProps['t']

/** One catalogue row with every field a test does not care about filled in. */
function row(overrides: Partial<DirectoryRow> & { slug: string }): DirectoryRow {
  return {
    name: overrides.slug,
    description: '',
    category: '',
    author: '',
    iconUrl: null,
    skillCount: 0,
    tryAsking: [],
    installed: false,
    enabled: false,
    ...overrides,
  }
}

function renderDirectory(state: DirectoryState) {
  const store = createSnapshotStore<DirectoryState>(state)
  const refresh = vi.fn()
  const install = vi.fn(() => Promise.resolve())
  const remove = vi.fn(() => Promise.resolve())
  render(<DirectoryArea {...({
    t, useDirectory: bindSnapshotSelector(store), refresh, install, remove,
  } as unknown as DirectoryAreaComponentProps)} />)
  return { refresh, install, remove }
}

const READY = (plugins: readonly DirectoryRow[], canInstall = true): DirectoryState =>
  ({ status: 'ready', plugins, canInstall })

describe('the directory, before a catalogue exists', () => {
  it('says it is still reading rather than showing an empty catalogue', () => {
    renderDirectory({ status: 'loading' })
    expect(screen.getByText(zh['directory.loading'])).toBeTruthy()
    expect(screen.queryByPlaceholderText(zh['directory.searchPlaceholder'])).toBeNull()
  })

  it('explains a build with no directory route, and offers no retry for it', () => {
    // The gate this desktop ships serves no `/auth/plugins`, so this is the
    // state a reader actually meets. Retrying a route that does not exist is
    // not a gesture worth drawing.
    const bench = renderDirectory({ status: 'unsupported' })
    expect(screen.getByText(zh['directory.unsupported'])).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(bench.refresh).not.toHaveBeenCalled()
  })

  it('explains a signed-out desktop instead of an empty account', () => {
    renderDirectory({ status: 'signed-out' })
    expect(screen.getByText(zh['directory.signedOut'])).toBeTruthy()
  })

  it('offers a retry, not a blank list, when the host will not answer', () => {
    const bench = renderDirectory({ status: 'failed' })
    fireEvent.click(screen.getByRole('button', { name: zh['directory.retry'] }))
    expect(bench.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('the directory, with a catalogue', () => {
  it('leads with the search field, because a directory is searched before it is browsed', () => {
    renderDirectory(READY([row({ slug: 'alpha' })]))
    expect(screen.getByPlaceholderText(zh['directory.searchPlaceholder'])).toBeTruthy()
  })

  it('searches the name and the sentence, because a reader remembers either', () => {
    renderDirectory(READY([
      row({ slug: 'alpha', name: 'Alpha', description: 'reads earnings reports' }),
      row({ slug: 'beta', name: 'Beta', description: 'draws charts' }),
    ]))
    fireEvent.change(screen.getByPlaceholderText(zh['directory.searchPlaceholder']), {
      target: { value: 'earnings' },
    })
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.queryByText('Beta')).toBeNull()
  })

  it('shows the installed strip only when something is installed', () => {
    renderDirectory(READY([row({ slug: 'alpha' })]))
    expect(screen.queryByRole('heading', { name: zh['directory.installedTitle'] })).toBeNull()

    cleanup()
    renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha', installed: true })]))
    expect(screen.getByRole('heading', { name: zh['directory.installedTitle'] })).toBeTruthy()
  })

  it('offers only the filters the catalogue can answer', () => {
    // The reference draws a public/personal pair here. No field on the wire
    // distinguishes them, so what stands in that position is what the
    // catalogue reports: everything, what this account installed, and the
    // publishers actually present.
    renderDirectory(READY([row({ slug: 'alpha', author: 'UnieAI' })]))
    const filters = screen.getByRole('group', { name: zh['directory.filterLabel'] })
    expect([...filters.querySelectorAll('button')].map(button => button.textContent))
      .toEqual([zh['directory.filterAll'], zh['directory.filterInstalled'], 'UnieAI'])
  })

  it('heads each category with the manifest’s own word, and the remainder with ours', () => {
    // Nothing here invents a "Featured" or a "Productivity" run: a heading
    // appears for a value the catalogue reported, and for nothing else.
    renderDirectory(READY([
      row({ slug: 'alpha', name: 'Alpha', category: 'research' }),
      row({ slug: 'beta', name: 'Beta' }),
    ]))
    expect(screen.getByRole('heading', { name: 'research' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: zh['directory.groupOther'] })).toBeTruthy()
  })

  it('asks a not-installed row for a decision by its verb', async () => {
    const bench = renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha' })]))
    const install = screen.getByRole('button', { name: `${zh['directory.install']}: Alpha` })
    expect(install.textContent).toBe(zh['directory.install'])
    fireEvent.click(install)
    await vi.waitFor(() => { expect(bench.install).toHaveBeenCalledWith('alpha') })
  })

  it('takes the install control away when the plan does not include installing', () => {
    renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha' })], false))
    expect(screen.getByRole('button', { name: `${zh['directory.install']}: Alpha` })
      .hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(zh['directory.planNote'])).toBeTruthy()
  })

  it('folds an installed row’s one remaining action behind the overflow', async () => {
    const bench = renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha', installed: true })]))
    // Removal standing open on every row a reader already chose is an
    // invitation to undo them.
    expect(screen.queryByRole('menuitem', { name: zh['directory.remove'] })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `${zh['directory.overflow']}: Alpha` }))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['directory.remove'] }))
    await vi.waitFor(() => { expect(bench.remove).toHaveBeenCalledWith('alpha') })
    expect(screen.queryByRole('menuitem', { name: zh['directory.remove'] })).toBeNull()
  })

  it('closes an open overflow on Escape', () => {
    renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha', installed: true })]))
    const more = screen.getByRole('button', { name: `${zh['directory.overflow']}: Alpha` })
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(more, { key: 'Escape' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
  })

  it('says an empty catalogue is empty, and a filtered-out one is filtered out', () => {
    renderDirectory(READY([]))
    expect(screen.getByText(zh['directory.empty'])).toBeTruthy()

    cleanup()
    renderDirectory(READY([row({ slug: 'alpha', name: 'Alpha' })]))
    fireEvent.change(screen.getByPlaceholderText(zh['directory.searchPlaceholder']), {
      target: { value: 'nothing matches this' },
    })
    expect(screen.getByText(zh['directory.noMatch'])).toBeTruthy()
  })
})

/** A catalogue view over a fixed answer. */
function skillsView(skills: SkillCatalogEntry[]) {
  return {
    getSnapshot: () => ({ skills, busy: false, loaded: true, error: '' }),
    subscribe: () => () => undefined,
  }
}

/** The props the framework composes, with the hook it derives from `hooks`. */
function skillsProps(overrides: Record<string, unknown>): SkillsAreaComponentProps {
  const view = skillsView((overrides.skills as SkillCatalogEntry[] | undefined) ?? [])
  return {
    t,
    available: overrides.available !== false,
    refresh: overrides.refresh ?? (() => undefined),
    useSkills: (select: (snapshot: ReturnType<typeof view.getSnapshot>) => unknown) => select(view.getSnapshot()),
    ...overrides.openPath === undefined ? {} : { openPath: overrides.openPath },
  } as unknown as SkillsAreaComponentProps
}

describe('the skills destination', () => {
  it('says this build has no catalogue when nothing can answer', () => {
    // A composition with no connection cannot read the route; drawing a
    // refresh control over nothing would promise a catalogue.
    render(<SkillsArea {...skillsProps({ available: false })} />)
    expect(screen.getByText(zh['skills.unsupported'])).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('groups what it serves by where each skill lives', () => {
    render(<SkillsArea {...skillsProps({ skills: [
      { name: 'mine', description: 'one I wrote', source: 'user-dsh', provider: 'filesystem', path: '/home/dev/.dsh/skills/mine/SKILL.md', modelInvocable: true, userInvocable: true },
      { name: 'shipped', description: 'one this build ships', source: 'bundled', provider: 'filesystem', path: '/app/skills/shipped/SKILL.md', modelInvocable: true, userInvocable: true },
    ] })} />)
    expect(screen.getByText(zh['skills.group.personal'])).toBeTruthy()
    expect(screen.getByText(zh['skills.group.bundled'])).toBeTruthy()
    expect(screen.getByText('mine')).toBeTruthy()
    // The file is on screen, so "which of these two is being used" is read,
    // not inferred.
    expect(screen.getByText('/home/dev/.dsh/skills/mine/SKILL.md')).toBeTruthy()
  })

  it('marks a skill the model cannot invoke', () => {
    render(<SkillsArea {...skillsProps({ skills: [
      { name: 'user-only', description: 'a person invokes this one', source: 'user-dsh', provider: 'filesystem', modelInvocable: false, userInvocable: true },
    ] })} />)
    expect(screen.getByText(zh['skills.userOnly'])).toBeTruthy()
  })

  it('hands a skill\'s file to the editor when the host can open one', () => {
    const openPath = vi.fn()
    render(<SkillsArea {...skillsProps({ openPath, skills: [
      { name: 'mine', description: 'one I wrote', source: 'user-dsh', provider: 'filesystem', path: '/skills/mine/SKILL.md', modelInvocable: true, userInvocable: true },
    ] })} />)
    fireEvent.click(screen.getByText(zh['skills.open']))
    expect(openPath).toHaveBeenCalledWith('/skills/mine/SKILL.md')
  })
})
