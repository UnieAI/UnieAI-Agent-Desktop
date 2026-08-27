// @vitest-environment jsdom
/**
 * The workspace file surface: what opens, what can be typed into, and what a
 * save does with the version the read returned.
 *
 * Editing here writes to a file an agent may also be writing, so the guarded
 * save and its refusal are the two things this file pins hardest.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { makeTranslate } from '@unieai/uad-client-test-runtime'
import type { WorkspaceFile, WorkspaceListing } from '@unieai/uad-client-runtime/client'
import { zh } from '../src/client/locales.ts'
import { FileBrowser } from '../src/client/skeleton/FileBrowser.tsx'
import { grammarFor } from '../src/client/skeleton/CodeEditor.tsx'

afterEach(cleanup)

const t = makeTranslate(zh) as never

const ROOT = '/w'

const listing = (): Promise<WorkspaceListing> =>
  Promise.resolve({ root: ROOT, path: ROOT, entries: [], truncated: false })

/** A file the Host served in full, with the version a guarded save needs. */
const served = (over?: Partial<WorkspaceFile>): WorkspaceFile => ({
  root: ROOT, path: `${ROOT}/a.ts`, size: 12, text: 'const a = 1\n', version: 'v1', ...over,
})

interface Mounted {
  container: HTMLElement
  write: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
}

/**
 * Render the browser over one served file.
 * @param file - what the read answers with.
 * @param options - `write` refused (`writable: false`) leaves the surface read-only.
 * @returns the container plus the two Host fakes.
 */
function mount(file: WorkspaceFile, options?: { writable?: boolean; save?: () => Promise<string> }): Mounted {
  const read = vi.fn(() => Promise.resolve(file))
  const write = vi.fn(options?.save ?? (() => Promise.resolve('v2')))
  const view = render(
    <FileBrowser
      root={ROOT} path={file.path} list={listing} read={read as never}
      {...options?.writable === false ? {} : { write }}
      onOpen={() => {}} onOpenExternally={() => {}} canOpenExternally
      t={t}
    />,
  )
  return { container: view.container, write, read }
}

/** The live editor behind the rendered element, for driving edits as CodeMirror sees them. */
function editorOf(container: HTMLElement): EditorView {
  const element = container.querySelector('[data-code-editor]')
  if (element === null) throw new Error('no editor rendered')
  const view = EditorView.findFromDOM(element as HTMLElement)
  if (view === null) throw new Error('editor element carries no view')
  return view
}

describe('FileBrowser', () => {
  it('opens a file straight into an editor, with no mode to enter first', async () => {
    const { container } = mount(served())
    await waitFor(() => { expect(container.querySelector('[data-code-editor]')).not.toBeNull() })
    expect(editorOf(container).state.doc.toString()).toBe('const a = 1\n')
    // The old surface asked for an Edit gesture before it would accept typing.
    expect([...container.querySelectorAll('button')].map(button => button.textContent))
      .not.toContain(zh['files.edit' as keyof typeof zh])
  })

  it('saves what was typed, guarded by the version the read returned', async () => {
    const { container, write } = mount(served())
    await waitFor(() => { expect(container.querySelector('[data-code-editor]')).not.toBeNull() })
    editorOf(container).dispatch({ changes: { from: 0, insert: '// note\n' } })

    const save = () => [...container.querySelectorAll('button')]
      .find(button => button.textContent === zh['files.save'])
    await waitFor(() => { expect(save()?.hasAttribute('disabled')).toBe(false) })
    fireEvent.click(save() as HTMLButtonElement)

    await waitFor(() => { expect(write).toHaveBeenCalledTimes(1) })
    expect(write.mock.calls[0]).toEqual([ROOT, `${ROOT}/a.ts`, '// note\nconst a = 1\n', 'v1'])
  })

  it('leaves Save unavailable until something is actually different', async () => {
    const { container } = mount(served())
    await waitFor(() => { expect(container.querySelector('[data-code-editor]')).not.toBeNull() })
    const save = () => [...container.querySelectorAll('button')]
      .find(button => button.textContent === zh['files.save'])
    expect(save()?.hasAttribute('disabled')).toBe(true)

    const view = editorOf(container)
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    await waitFor(() => { expect(save()?.hasAttribute('disabled')).toBe(false) })
    // Typed and then undone is not a change: the buffer matches the read again.
    view.dispatch({ changes: { from: 0, to: 1, insert: '' } })
    await waitFor(() => { expect(save()?.hasAttribute('disabled')).toBe(true) })
  })

  it('takes Cmd/Ctrl+S as the save gesture', async () => {
    const { container, write } = mount(served())
    await waitFor(() => { expect(container.querySelector('[data-code-editor]')).not.toBeNull() })
    editorOf(container).dispatch({ changes: { from: 0, insert: 'x' } })

    const content = container.querySelector('.cm-content')
    fireEvent.keyDown(content as Element, { key: 's', ctrlKey: true })
    await waitFor(() => { expect(write).toHaveBeenCalledTimes(1) })
  })

  it('refuses a save the file moved under, and offers the re-read', async () => {
    const { container, read } = mount(served(), {
      save: () => Promise.reject(new Error('workspace-file-stale: someone else wrote it')),
    })
    await waitFor(() => { expect(container.querySelector('[data-code-editor]')).not.toBeNull() })
    editorOf(container).dispatch({ changes: { from: 0, insert: 'mine' } })
    const save = () => [...container.querySelectorAll('button')]
      .find(button => button.textContent === zh['files.save'])
    await waitFor(() => { expect(save()?.hasAttribute('disabled')).toBe(false) })
    fireEvent.click(save() as HTMLButtonElement)

    // The person is told the file moved rather than being shown a success.
    await waitFor(() => { expect(container.textContent).toContain(zh['files.stale']) })
    const reread = [...container.querySelectorAll('button')]
      .find(button => button.textContent === zh['files.reread'])
    expect(reread).toBeTruthy()

    fireEvent.click(reread as HTMLButtonElement)
    await waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
  })

  it('gives a withheld file no editor at all', async () => {
    const { container } = mount({ root: ROOT, path: `${ROOT}/a.bin`, size: 900, reason: 'binary' })
    await waitFor(() => { expect(container.textContent).toContain(zh['files.binary']) })
    // A blank editor over a file with content is a way to empty it by accident.
    expect(container.querySelector('[data-code-editor]')).toBeNull()
  })

  it('shows a file it cannot write as a reading view', async () => {
    const { container } = mount(served(), { writable: false })
    await waitFor(() => { expect(container.textContent).toContain('const a = 1') })
    expect(container.querySelector('[data-code-editor]')).toBeNull()
  })
})

describe('grammarFor', () => {
  it('parses an alias under the language it is a spelling of', () => {
    expect(grammarFor('mts')).toBeTruthy()
    expect(grammarFor('cc')).toBeTruthy()
    expect(grammarFor('ts')).toBeTruthy()
  })

  it('leaves an unknown extension plain rather than guessing', () => {
    // Plain text is still fully editable; only the colours are missing.
    expect(grammarFor('sillyext')).toBeUndefined()
    expect(grammarFor(undefined)).toBeUndefined()
  })
})
