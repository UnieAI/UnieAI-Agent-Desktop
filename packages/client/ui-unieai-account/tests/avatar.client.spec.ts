// @vitest-environment jsdom
/**
 * What the desktop does to a picked image before it becomes an avatar.
 *
 * The two rules worth pinning are the ones a drifting copy would break: the
 * accepted formats are the product's (so the picker never accepts a file the
 * save refuses), and everything but an animated GIF is reduced to a centred
 * 512px square (so the stored data URL stays kilobytes rather than megabytes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES, centerCropSquare, describeUpload, extensionOf,
  isAcceptedImage,
} from '../src/client/avatar.ts'

/** One decode outcome the stubbed `Image` will produce. */
interface DecodeOutcome {
  /** Natural size of the decoded image, or undefined to fail the decode. */
  size?: { width: number; height: number }
}

/** Install an `Image` that resolves (or fails) without a network or a codec. */
function stubImage(outcome: DecodeOutcome): void {
  class StubImage {
    naturalWidth = outcome.size?.width ?? 0
    naturalHeight = outcome.size?.height ?? 0
    width = 0
    height = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) {
      queueMicrotask(() => {
        if (outcome.size === undefined) this.onerror?.()
        else this.onload?.()
      })
    }
  }
  vi.stubGlobal('Image', StubImage)
}

/** Every argument the crop passed to `drawImage`, for one run. */
type DrawCall = number[]

/**
 * Give jsdom's canvas a 2D context that records what was drawn on it. jsdom
 * has no rasterizer, so the prototype is stubbed rather than the element.
 */
function stubCanvas(options: { context: boolean }): { draws: DrawCall[] } {
  const draws: DrawCall[] = []
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage: (_image: unknown, ...rest: number[]) => { draws.push(rest) },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(options.context ? (context as unknown as CanvasRenderingContext2D) : null)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation((type?: string) => `data:${type ?? ''};base64,CROPPED`)
  return { draws }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('accepted formats', () => {
  it('lists exactly what the web product accepts', () => {
    expect([...ACCEPTED_EXTENSIONS]).toEqual([
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tif', '.tiff',
    ])
    expect([...ACCEPTED_MIME_TYPES]).toEqual([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
    ])
  })

  it('accepts a pick the browser could not type, on its extension alone', () => {
    expect(isAcceptedImage('holiday.HEIC', '')).toBe(true)
  })

  it('accepts a pick with no usable name, on its MIME type alone', () => {
    expect(isAcceptedImage('clipboard', 'image/PNG')).toBe(true)
  })

  it('refuses a format neither identification recognises', () => {
    expect(isAcceptedImage('resume.pdf', 'application/pdf')).toBe(false)
  })

  it('reads an extension only where a name has one', () => {
    expect(extensionOf('photo.tar.GZ')).toBe('.gz')
    expect(extensionOf('photo')).toBe('')
  })
})

describe('describing an upload', () => {
  it('reads the type back out of the data URL, not off the picked file', () => {
    expect(describeUpload('data:image/PNG;base64,AAA')).toEqual({
      dataUrl: 'data:image/PNG;base64,AAA',
      mimeType: 'image/png',
      extension: '.png',
    })
  })

  it('leaves both fields empty when the data URL declares no type', () => {
    expect(describeUpload('not-a-data-url')).toEqual({
      dataUrl: 'not-a-data-url',
      mimeType: '',
      extension: '',
    })
  })
})

describe('centre-cropping', () => {
  it('keeps the middle square of a wide image and re-encodes it as PNG', async () => {
    stubImage({ size: { width: 1000, height: 400 } })
    const canvas = stubCanvas({ context: true })

    await expect(centerCropSquare('data:image/jpeg;base64,AAA'))
      .resolves.toBe('data:image/png;base64,CROPPED')
    // Source: a 400px square starting 300px in. Destination: the whole 512
    // canvas, which is why no background fill can ever show through.
    expect(canvas.draws).toEqual([[300, 0, 400, 400, 0, 0, 512, 512]])
  })

  it('keeps the middle square of a tall image', async () => {
    stubImage({ size: { width: 400, height: 1000 } })
    const canvas = stubCanvas({ context: true })

    await centerCropSquare('data:image/jpeg;base64,AAA')

    expect(canvas.draws).toEqual([[0, 300, 400, 400, 0, 0, 512, 512]])
  })

  it('refuses an image that will not decode', async () => {
    stubImage({})
    stubCanvas({ context: true })

    await expect(centerCropSquare('data:image/jpeg;base64,AAA')).rejects.toThrow(/decoded/)
  })

  it('refuses an image that carries no pixels', async () => {
    stubImage({ size: { width: 0, height: 0 } })
    stubCanvas({ context: true })

    await expect(centerCropSquare('data:image/jpeg;base64,AAA')).rejects.toThrow(/no pixels/)
  })

  it('refuses a document that grants no drawing context', async () => {
    stubImage({ size: { width: 10, height: 10 } })
    stubCanvas({ context: false })

    await expect(centerCropSquare('data:image/jpeg;base64,AAA')).rejects.toThrow(/2D drawing context/)
  })
})
