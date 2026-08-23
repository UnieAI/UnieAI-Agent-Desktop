// @vitest-environment jsdom
/**
 * The change-avatar dialog, driven end to end from a picked file.
 *
 * The dialog is the only place the desktop decides what an avatar becomes, so
 * the cases that matter are the branches of that decision: a format the
 * product would refuse never reaches a preview, a still image is cropped
 * before it is handed over, and an animated GIF is handed over whole because
 * a canvas re-encode would keep one frame of it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import type { UnieAiAvatarUpload } from '../src/account-contract.ts'
import { AvatarEditorDialog, type AvatarEditorDialogProps } from '../src/client/AvatarEditorDialog.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh) as AvatarEditorDialogProps['t']

/** A canvas whose 2D context draws nothing but reports a recognisable PNG. */
function stubCanvasAndImage(): void {
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
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage: () => {},
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation((type?: string) => `data:${type ?? ''};base64,CROPPED`)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup() {
  const picked: { upload: UnieAiAvatarUpload; animated: boolean }[] = []
  const failures: string[] = []
  const onClose = vi.fn()
  const props = (saving: boolean) => (
    <AvatarEditorDialog
      open
      saving={saving}
      t={t}
      onClose={onClose}
      onPicked={(upload, animated) => { picked.push({ upload, animated }) }}
      onFailed={(message) => { failures.push(message) }}
    />
  )
  const view = render(props(false))
  const freeze = (): void => { view.rerender(props(true)) }
  const picker = screen.getByLabelText(zh['profile.selectAvatar']) as HTMLInputElement
  const choose = (file: File): void => {
    Object.defineProperty(picker, 'files', { value: [file], configurable: true })
    fireEvent.change(picker)
  }
  return { picked, failures, onClose, choose, freeze }
}

describe('the change-avatar dialog', () => {
  it('refuses a format the product would refuse, before any preview', async () => {
    const bench = setup()
    bench.choose(new File(['%PDF'], 'resume.pdf', { type: 'application/pdf' }))

    await waitFor(() => { expect(bench.failures).toEqual([zh['profile.unsupportedImage']]) })
    expect(screen.queryByRole('button', { name: zh['profile.confirm'] })).toBeNull()
  })

  it('crops a still image and hands over the re-encoded square', async () => {
    stubCanvasAndImage()
    const bench = setup()
    bench.choose(new File(['binary'], 'holiday.jpg', { type: 'image/jpeg' }))

    fireEvent.click(await screen.findByRole('button', { name: zh['profile.confirm'] }))

    await waitFor(() => { expect(bench.picked).toHaveLength(1) })
    expect(bench.picked[0]).toEqual({
      upload: { dataUrl: 'data:image/png;base64,CROPPED', mimeType: 'image/png', extension: '.png' },
      animated: false,
    })
  })

  it('hands an animated GIF over whole, so it keeps more than one frame', async () => {
    const bench = setup()
    bench.choose(new File(['GIF89a'], 'wave.gif', { type: 'image/gif' }))

    fireEvent.click(await screen.findByRole('button', { name: zh['profile.confirm'] }))

    await waitFor(() => { expect(bench.picked).toHaveLength(1) })
    expect(bench.picked[0]?.animated).toBe(true)
    expect(bench.picked[0]?.upload.mimeType).toBe('image/gif')
    expect(bench.picked[0]?.upload.dataUrl.startsWith('data:image/gif;base64,')).toBe(true)
  })

  it('reports a crop that could not be produced instead of storing the original', async () => {
    class DeadImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => { this.onerror?.() }) }
    }
    vi.stubGlobal('Image', DeadImage)
    const bench = setup()
    bench.choose(new File(['binary'], 'holiday.jpg', { type: 'image/jpeg' }))

    fireEvent.click(await screen.findByRole('button', { name: zh['profile.confirm'] }))

    await waitFor(() => { expect(bench.failures).toEqual([zh['profile.saveAvatarFailed']]) })
    expect(bench.picked).toEqual([])
  })

  it('discards the pending pick and returns to the picker', async () => {
    const bench = setup()
    bench.choose(new File(['GIF89a'], 'wave.gif', { type: 'image/gif' }))
    fireEvent.click(await screen.findByRole('button', { name: zh['profile.cancel'] }))

    await waitFor(() => { expect(screen.getByLabelText(zh['profile.selectAvatar'])).toBeTruthy() })
    expect(bench.picked).toEqual([])
  })

  it('does nothing when the picker is dismissed without a file', async () => {
    const bench = setup()
    const picker = screen.getByLabelText(zh['profile.selectAvatar'])
    Object.defineProperty(picker, 'files', { value: [], configurable: true })
    fireEvent.change(picker)

    await waitFor(() => { expect(bench.failures).toEqual([]) })
    expect(bench.picked).toEqual([])
  })

  it('reports a file the browser would not read, rather than a blank avatar', async () => {
    class DeadReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsDataURL(): void { queueMicrotask(() => { this.onerror?.() }) }
    }
    vi.stubGlobal('FileReader', DeadReader)
    const bench = setup()
    bench.choose(new File(['binary'], 'holiday.jpg', { type: 'image/jpeg' }))

    await waitFor(() => { expect(bench.failures).toEqual([zh['profile.readImageFailed']]) })
  })

  it('reports a read that produced nothing, rather than previewing nothing', async () => {
    class EmptyReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsDataURL(): void { queueMicrotask(() => { this.onload?.() }) }
    }
    vi.stubGlobal('FileReader', EmptyReader)
    const bench = setup()
    bench.choose(new File(['binary'], 'holiday.jpg', { type: 'image/jpeg' }))

    await waitFor(() => { expect(bench.failures).toEqual([zh['profile.readImageFailed']]) })
    expect(screen.queryByRole('button', { name: zh['profile.confirm'] })).toBeNull()
  })

  it('reports the save in flight on the confirm button, and freezes it', async () => {
    const bench = setup()
    bench.choose(new File(['GIF89a'], 'wave.gif', { type: 'image/gif' }))
    await screen.findByRole('button', { name: zh['profile.confirm'] })

    bench.freeze()
    const confirming = screen.getByRole('button', { name: zh['profile.saving'] })
    expect(confirming.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: zh['profile.cancel'] }).hasAttribute('disabled')).toBe(true)
  })

  it('opens the file picker from the button beside it', () => {
    setup()
    const picker = screen.getByLabelText(zh['profile.selectAvatar'])
    const click = vi.spyOn(picker, 'click')
    fireEvent.click(screen.getByRole('button', { name: zh['profile.selectAvatar'] }))
    expect(click).toHaveBeenCalledTimes(1)
  })
})
