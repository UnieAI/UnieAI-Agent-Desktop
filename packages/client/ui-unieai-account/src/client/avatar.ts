/**
 * What the desktop does to a picked image before it becomes an avatar, in the
 * same steps and with the same values the UnieAI web product's own profile
 * form uses.
 *
 * Two of those steps matter beyond looking the same:
 *
 *  - **The accepted lists are the product's.** Its `PATCH` refuses an image
 *    whose MIME type and extension are both unknown to it, so a wider list
 *    here would only produce a picker that accepts files the save rejects.
 *  - **Everything but an animated GIF is cropped to a centred 512px square.**
 *    The avatar travels and is stored as a base64 data URL, so an uncropped
 *    phone photo would put megabytes into the account row and into every later
 *    profile read on BOTH surfaces. A GIF is passed through instead, because
 *    a canvas re-encode would keep only its first frame.
 */
import type { UnieAiAvatarUpload } from '../account-contract.ts'

/** Extensions the product accepts, in its own order. */
export const ACCEPTED_EXTENSIONS: readonly string[] = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tif', '.tiff',
]

/** MIME types the product accepts, in its own order. */
export const ACCEPTED_MIME_TYPES: readonly string[] = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
]

/**
 * The accepted formats, as the file-picker area prints them. There is one
 * printing of this list, in the dialog that does the picking: the caption that
 * used to sit under the avatar belonged to a profile card the Account page no
 * longer has.
 */
export const FORMATS_HINT = 'jpg / png / gif / webp / heic / tif / tiff'

/** Side of the stored square, in pixels — the reference's own 512. */
const OUTPUT_SIZE = 512

/** Encoding of the stored square; PNG, as the reference encodes it. */
const OUTPUT_MIME_TYPE = 'image/png'

/**
 * The extension a picked file carries, lowercased and dotted.
 * @param fileName - the file's name.
 * @returns the extension including its dot, or an empty string for a name with
 * none.
 */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * Whether the product would accept this file at all.
 *
 * Either identification suffices, exactly as it does in the product's own
 * validation: a browser that reports no MIME type for a `.heic` pick must not
 * make that pick unusable.
 * @param fileName - the picked file's name.
 * @param fileType - the MIME type the browser reported, possibly empty.
 * @returns whether the pick is one of the accepted formats.
 */
export function isAcceptedImage(fileName: string, fileType: string): boolean {
  return ACCEPTED_MIME_TYPES.includes(fileType.toLowerCase())
    || ACCEPTED_EXTENSIONS.includes(extensionOf(fileName))
}

/**
 * Describe a finished data URL as the upload the supplier is given.
 *
 * Both fields are read back out of the data URL rather than carried over from
 * the picked file, because the crop re-encodes: the stored image's own type is
 * the only one that can agree with its bytes, and the product cross-checks
 * exactly that.
 * @param dataUrl - the image to upload.
 * @returns the upload, whose MIME type and extension are empty when the data
 * URL declares no type — the supplier then falls back to its other check.
 */
export function describeUpload(dataUrl: string): UnieAiAvatarUpload {
  const matched = /^data:([^;]+);base64,/i.exec(dataUrl)
  const mimeType = matched?.[1]?.toLowerCase() ?? ''
  const subtype = mimeType.split('/')[1] ?? ''
  return { dataUrl, mimeType, extension: subtype === '' ? '' : `.${subtype}` }
}

/**
 * Decode one image so its natural dimensions can be measured.
 * @param src - a data URL.
 * @returns the decoded image.
 */
function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => { resolve(image) }
    image.onerror = () => { reject(new Error('the image could not be decoded')) }
    image.src = src
  })
}

/**
 * Crop one image to a centred square and re-encode it as PNG.
 *
 * The reference paints the canvas white before drawing; that fill is
 * unreachable and is not reproduced, because the source rectangle is the
 * largest centred square of the image and it is drawn over the whole canvas,
 * so no pixel is left unpainted.
 * @param src - the picked image as a data URL.
 * @returns the cropped square as a PNG data URL.
 * @throws when the image cannot be decoded, carries no pixels, or the document
 * grants no 2D drawing context — each of which leaves nothing to store.
 */
export async function centerCropSquare(src: string): Promise<string> {
  const image = await decode(src)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const side = Math.min(width, height)
  if (side === 0) throw new Error('the image has no pixels')

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('this document grants no 2D drawing context')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  return canvas.toDataURL(OUTPUT_MIME_TYPE)
}
