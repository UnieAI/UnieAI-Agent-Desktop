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
