// @vitest-environment jsdom
/**
 * The Account page's identity header as the user meets it: it PRINTS the
 * stored name and photo, and it is also where both are changed — press the
 * pencil beside the name, or press the mark itself, and the same one form
 * opens with the one Save that stores it.
 *
 * Two properties are pinned hardest. The first is what the header does NOT
 * hold: no copy of the stored profile, so the field and the mark fall back to
 * the account it was handed and a save that lands anywhere is adopted the
 * moment that account moves. The second is that the name has ONE home — the
 * read line and the edit field are never on the screen together, because that
 * is exactly the two-copies-of-one-fact this header was built to end.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { UnieAiAccountIdentity, UnieAiProfilePatch } from '../src/account-contract.ts'
import { ProfileHeader, type ProfileHeaderProps } from '../src/client/ProfileHeader.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as ProfileHeaderProps['t']

const IDENTITY: UnieAiAccountIdentity = {
  displayName: '林小明',
  email: 'ming@example.com',
}

function setup(identity: UnieAiAccountIdentity = IDENTITY, saved = true) {
  const patches: UnieAiProfilePatch[] = []
  const saveProfile = vi.fn(async (patch: UnieAiProfilePatch) => {
    patches.push(patch)
    return await Promise.resolve(saved ? { status: 'saved' as const } : { status: 'failed' as const })
  })
  const view = render(
    <ProfileHeader identity={identity} planLabel="Pro" t={t} saveProfile={saveProfile} />,
  )
  const field = (): HTMLInputElement => screen.getByLabelText(zh['profile.displayName']) as HTMLInputElement
  const openEditor = (): void => {
    fireEvent.click(screen.getByRole('button', { name: zh['profile.editName'] }))
  }
  return { patches, saveProfile, view, field, openEditor }
}

describe('the identity header', () => {
  it('prints the stored name and the plan, with no field standing open', () => {
    setup()
    expect(screen.getByText('林小明')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    // The editor is not the resting state: no field, and nothing to save.
    expect(screen.queryByLabelText(zh['profile.displayName'])).toBeNull()
    expect(screen.queryByRole('button', { name: zh['profile.save'] })).toBeNull()
  })

  it('shows the name once — as a line, or as the field, never both', () => {
    const bench = setup()
    bench.openEditor()
    expect(bench.field().value).toBe('林小明')
    // The printed line is gone while the field holds the same name.
    const printed = [...bench.view.container.querySelectorAll('*')]
      .filter(node => node.childElementCount === 0 && node.textContent === '林小明')
    expect(printed).toHaveLength(0)
  })

  it('draws the stored photo when the account has one, and a glyph when it does not', () => {
    setup()
    expect(document.querySelector('img')).toBeNull()
    cleanup()
    setup({ ...IDENTITY, avatarUrl: 'data:image/png;base64,STORED' })
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,STORED')
  })

  it('saves the trimmed name and no avatar it never picked', async () => {
    const bench = setup()
    bench.openEditor()
    fireEvent.change(bench.field(), { target: { value: '  林大明  ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))

    await waitFor(() => { expect(bench.patches).toHaveLength(1) })
    expect(bench.patches[0]).toEqual({ displayName: '林大明' })
    expect(await screen.findByText(zh['profile.updated'])).toBeTruthy()
  })

  it('closes back to the stored name once the account carries it, rather than keeping both', async () => {
    const bench = setup()
    bench.openEditor()
    fireEvent.change(bench.field(), { target: { value: '林大明' } })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))

    await waitFor(() => { expect(bench.patches).toHaveLength(1) })
    // The stubbed supplier never republishes, so the header falling back to
    // the account it was handed is exactly what proves the draft was dropped.
    await waitFor(() => { expect(screen.queryByLabelText(zh['profile.displayName'])).toBeNull() })
    expect(screen.getByText('林小明')).toBeTruthy()
  })

  it('drops the edit and reopens on the stored name when the edit is cancelled', () => {
    const bench = setup()
    bench.openEditor()
    fireEvent.change(bench.field(), { target: { value: '林大明' } })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.cancel'] }))

    expect(screen.getByText('林小明')).toBeTruthy()
    bench.openEditor()
    expect(bench.field().value).toBe('林小明')
    expect(bench.saveProfile).not.toHaveBeenCalled()
  })

  it('keeps the edit open and says so when the supplier refuses it', async () => {
    const bench = setup(IDENTITY, false)
    bench.openEditor()
    fireEvent.change(bench.field(), { target: { value: '林大明' } })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))

    expect(await screen.findByText(zh['profile.updateFailed'])).toBeTruthy()
    expect(bench.field().value).toBe('林大明')
  })

  it('refuses to save a blank name, and says which field is missing', async () => {
    const bench = setup()
    bench.openEditor()
    fireEvent.change(bench.field(), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: zh['profile.save'] }).hasAttribute('disabled')).toBe(true)

    fireEvent.submit(bench.field().closest('form') as HTMLFormElement)

    expect(await screen.findByText(zh['profile.displayNameRequired'])).toBeTruthy()
    expect(bench.saveProfile).not.toHaveBeenCalled()
  })

  it('submits from the field itself, the way a one-field form does', async () => {
    const bench = setup()
    bench.openEditor()
    fireEvent.submit(bench.field().closest('form') as HTMLFormElement)
    await waitFor(() => { expect(bench.patches).toEqual([{ displayName: '林小明' }]) })
  })

  it('opens the change-avatar dialog from the mark itself', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.changeAvatar'] }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('closes the change-avatar dialog without staging anything', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.changeAvatar'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['profile.close'] }))

    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(document.querySelector('img')).toBeNull()
    // And nothing was staged, so no Save is left standing over the header.
    expect(screen.queryByRole('button', { name: zh['profile.save'] })).toBeNull()
  })

  it('lets a notice expire instead of standing on the screen', async () => {
    vi.useFakeTimers()
    const bench = setup()
    bench.openEditor()
    fireEvent.submit(bench.field().closest('form') as HTMLFormElement)
    await vi.waitFor(() => { expect(screen.getByText(zh['profile.updated'])).toBeTruthy() })

    await vi.advanceTimersByTimeAsync(5000)
    expect(screen.queryByText(zh['profile.updated'])).toBeNull()
    vi.useRealTimers()
  })

  it('crops a still picture before staging it, and says Save is still needed', async () => {
    class StubImage {
      naturalWidth = 800
      naturalHeight = 600
      width = 0
      height = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => { this.onload?.() }) }
    }
    vi.stubGlobal('Image', StubImage)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((type?: string) => `data:${type ?? ''};base64,CROPPED`)

    const bench = setup()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.changeAvatar'] }))
    const picker = screen.getByLabelText(zh['profile.selectAvatar'])
    Object.defineProperty(picker, 'files', {
      value: [new File(['binary'], 'holiday.jpg', { type: 'image/jpeg' })],
      configurable: true,
    })
    fireEvent.change(picker)
    fireEvent.click(await screen.findByRole('button', { name: zh['profile.confirm'] }))

    expect(await screen.findByText(zh['profile.avatarUpdated'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))
    await waitFor(() => { expect(bench.patches).toHaveLength(1) })
    expect(bench.patches[0]?.avatar).toEqual({
      dataUrl: 'data:image/png;base64,CROPPED',
      mimeType: 'image/png',
      extension: '.png',
    })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stages a picked avatar beside the field that Save belongs to, then sends it', async () => {
    const bench = setup()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.changeAvatar'] }))

    const picker = screen.getByLabelText(zh['profile.selectAvatar'])
    Object.defineProperty(picker, 'files', {
      value: [new File(['GIF89a'], 'wave.gif', { type: 'image/gif' })],
      configurable: true,
    })
    fireEvent.change(picker)
    fireEvent.click(await screen.findByRole('button', { name: zh['profile.confirm'] }))

    // The reference says the same thing: the photo is staged, and Save stores it.
    expect(await screen.findByText(zh['profile.avatarUpdatedGif'])).toBeTruthy()
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    // Staging opens the editor, so Save is attached to a visible field rather
    // than floating over a header with nothing under it.
    expect(bench.field().value).toBe('林小明')
    const staged = document.querySelector('img')?.getAttribute('src') ?? ''
    expect(staged.startsWith('data:image/gif;base64,')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))
    await waitFor(() => { expect(bench.patches).toHaveLength(1) })
    expect(bench.patches[0]).toEqual({
      displayName: '林小明',
      avatar: { dataUrl: staged, mimeType: 'image/gif', extension: '.gif' },
    })
  })

  it('falls back to a monogram, and drops the plan line the supplier left empty', () => {
    setup()
    expect(screen.getByText('林')).toBeTruthy()
    cleanup()

    const blank = render(
      <ProfileHeader
        identity={{ displayName: '', email: '' }}
        planLabel=""
        t={t}
        saveProfile={vi.fn(async () => ({ status: 'saved' as const }))}
      />,
    )
    // Neither field can produce a monogram, and none is invented.
    expect(blank.container.querySelector('img')).toBeNull()
    expect(screen.queryByText('Pro')).toBeNull()
  })
})
