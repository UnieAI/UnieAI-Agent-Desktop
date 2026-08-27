// @vitest-environment jsdom
/**
 * That the tree actually arrives.
 *
 * The bug this pins: the loader's effect depended on the state it wrote, so
 * `setLevels({status:'loading'})` re-ran the effect, whose cleanup aborted the
 * request it had just made. Every level then sat on "loading" forever, and
 * nothing threw — the abort handler returned quietly. A render test is the
 * only thing that catches a hang.
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorkspaceListing } from '@unieai/uad-client-runtime/client'
import { WorkspaceTree } from '../src/client/skeleton/WorkspaceTree.tsx'

afterEach(cleanup)

const t = ((key: string) => key) as never

/** A listing backend over a fixed tree of absolute paths. */
const backendOf = (tree: Record<string, WorkspaceListing['entries']>) =>
  vi.fn((root: string, path?: string): Promise<WorkspaceListing> => {
    const at = path ?? root
    const entries = tree[at]
    return entries === undefined
      ? Promise.reject(new Error(`no such level ${at}`))
      : Promise.resolve({ root, path: at, entries, truncated: false })
  })

describe('the workspace tree', () => {
  it('resolves the root level instead of sitting on loading', async () => {
    const list = backendOf({
      '/w': [
        { name: 'src', path: '/w/src', kind: 'directory' },
        { name: 'a.ts', path: '/w/a.ts', kind: 'file' },
      ],
    })
    render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} />)
    await waitFor(() => { expect(screen.getByText('src')).toBeTruthy() })
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.queryByText('files.loading')).toBeNull()
    // One request for one level; the effect must not re-fire per state write.
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('lists a child level only when it is opened', async () => {
    const list = backendOf({
      '/w': [{ name: 'src', path: '/w/src', kind: 'directory' }],
      '/w/src': [{ name: 'deep.ts', path: '/w/src/deep.ts', kind: 'file' }],
    })
    render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} />)
    await waitFor(() => { expect(screen.getByText('src')).toBeTruthy() })
    expect(list).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => { expect(screen.getByText('deep.ts')).toBeTruthy() })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('hands a file to the opener rather than expanding it', async () => {
    const onOpen = vi.fn()
    const list = backendOf({ '/w': [{ name: 'a.ts', path: '/w/a.ts', kind: 'file' }] })
    render(<WorkspaceTree root="/w" list={list} onOpen={onOpen} t={t} />)
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })
    fireEvent.click(screen.getByText('a.ts'))
    expect(onOpen).toHaveBeenCalledWith('/w/a.ts')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('reports an unreadable level and retries it on reopen', async () => {
    const list = backendOf({ '/w': [{ name: 'src', path: '/w/src', kind: 'directory' }] })
    render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} />)
    await waitFor(() => { expect(screen.getByText('src')).toBeTruthy() })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => { expect(screen.getByText('files.unreadable')).toBeTruthy() })
    // Collapse and reopen: a failed level is not remembered as answered.
    fireEvent.click(screen.getByText('src'))
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(3) })
  })
})

describe('under a double-invoked mount', () => {
  it('still resolves the root level', async () => {
    // React runs an effect twice on mount in development. A single
    // component-lifetime AbortController would be aborted by the first
    // cleanup, and every request after it carried a dead signal — the tree
    // then sat empty forever with no error anywhere.
    const list = backendOf({ '/w': [{ name: 'a.ts', path: '/w/a.ts', kind: 'file' }] })
    render(
      <StrictMode>
        <WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} />
      </StrictMode>,
    )
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })
    expect(screen.queryByText('files.loading')).toBeNull()
  })
})

describe('re-reading a level', () => {
  it('shows a file that appeared after the level was first read', async () => {
    // The bug this pins: a level was requested once and never again, so a
    // file the agent wrote never appeared — the tree was frozen for the
    // life of the session, and nothing said so.
    let listing: WorkspaceListing['entries'] = [{ name: 'a.ts', path: '/w/a.ts', kind: 'file' }]
    const list = vi.fn((root: string, path?: string): Promise<WorkspaceListing> =>
      Promise.resolve({ root, path: path ?? root, entries: listing, truncated: false }))

    const view = render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={0} />)
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })

    listing = [
      { name: 'a.ts', path: '/w/a.ts', kind: 'file' },
      { name: 'written-by-the-agent.ts', path: '/w/written-by-the-agent.ts', kind: 'file' },
    ]
    view.rerender(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={1} />)
    await waitFor(() => { expect(screen.getByText('written-by-the-agent.ts')).toBeTruthy() })
  })

  it('keeps the rows on screen while it re-reads, rather than blanking', async () => {
    // Blanking on every settled tool call would make the tree flicker at
    // exactly the moment someone is reading it.
    let release: (listing: WorkspaceListing) => void = () => {}
    const list = vi.fn((root: string, path?: string): Promise<WorkspaceListing> => {
      const at = path ?? root
      if (list.mock.calls.length === 1) {
        return Promise.resolve({ root, path: at, entries: [{ name: 'a.ts', path: '/w/a.ts', kind: 'file' }], truncated: false })
      }
      return new Promise<WorkspaceListing>((resolve) => { release = resolve })
    })

    const view = render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={0} />)
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })

    view.rerender(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={1} />)
    // The second read is in flight and the old rows are still there.
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(screen.getByText('a.ts')).toBeTruthy()

    release({ root: '/w', path: '/w', entries: [{ name: 'b.ts', path: '/w/b.ts', kind: 'file' }], truncated: false })
    await waitFor(() => { expect(screen.getByText('b.ts')).toBeTruthy() })
  })

  it('does not re-read while the revision stands still', async () => {
    const list = backendOf({ '/w': [{ name: 'a.ts', path: '/w/a.ts', kind: 'file' }] })
    const view = render(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={3} />)
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })
    const reads = list.mock.calls.length

    view.rerender(<WorkspaceTree root="/w" list={list} onOpen={() => {}} t={t} revision={3} filter="a" />)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(list.mock.calls.length).toBe(reads)
  })
})
