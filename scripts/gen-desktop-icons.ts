/**
 * Generate the desktop application's platform icons from the product artwork.
 *
 * WHY THE SHAPE IS BAKED IN. macOS does not round an app icon for you: the
 * rounded square IS the artwork, and Apple's grid puts it at 824×824 inside a
 * 1024×1024 canvas with a 185.4 px corner radius, so every app in the Dock
 * shares one silhouette. A full-bleed square shipped to macOS reads as the one
 * app that did not follow the convention.
 *
 * WHY WINDOWS AND LINUX GET A DIFFERENT FILE. They draw the icon as given.
 * Handing them the macOS artwork means shipping Apple's padding as empty
 * pixels, and the icon appears roughly a fifth smaller than everyone else's in
 * a taskbar. Those two get the artwork full-bleed.
 *
 * Run: `pnpm run gen-desktop-icons` (source: apps/web/public/icons).
 */

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')

/**
 * The maskable artwork, which is the full-bleed one: the plain icon is a glyph
 * on transparency, and compositing that onto an invented background would be
 * choosing a brand colour here rather than reading it.
 */
const SOURCE = join(root, 'apps/web/public/icons/icon-maskable-512.png')

/** One image in progress; only the operations this script performs. */
interface SharpImage {
  resize(width: number, height: number, options?: { fit?: 'cover' }): SharpImage
  composite(layers: readonly { input: Buffer; blend?: 'dest-in'; left?: number; top?: number }[]): SharpImage
  png(): SharpImage
  toBuffer(): Promise<Buffer>
  toFile(path: string): Promise<unknown>
}

/**
 * The slice of `sharp` used here.
 *
 * Declared rather than imported: sharp is a dependency of the desktop app, not
 * of the workspace root, so its own types are not reachable from a repository
 * script — and a script that pulled the package into the root only for types
 * would add a dependency to every install for the sake of one generator.
 */
/** A blank canvas this script composites onto. */
interface SharpCanvas {
  readonly create: {
    readonly width: number
    readonly height: number
    readonly channels: 4
    readonly background: { r: number; g: number; b: number; alpha: number }
  }
}

interface Sharp {
  (input: string | SharpCanvas): SharpImage
}

/** Apple's icon grid: the shape's size and corner radius on a 1024 canvas. */
const MAC_CANVAS = 1024
const MAC_SHAPE = 824
const MAC_RADIUS = 185.4

async function main(): Promise<void> {
  // sharp ships with the desktop app rather than the workspace root, so it is
  // resolved from there instead of imported.
  // Resolved from the desktop app, which is where sharp is a dependency; the
  // workspace root has none, so its types are not reachable from here and the
  // slice this script uses is declared instead of imported.
  const sharpPath = require.resolve('sharp', { paths: [join(root, 'apps/desktop')] })
  const sharp = require(sharpPath) as Sharp

  const out = join(root, 'apps/desktop/build')
  mkdirSync(out, { recursive: true })

  const inset = Math.round((MAC_CANVAS - MAC_SHAPE) / 2)
  const mask = Buffer.from(
    `<svg width="${String(MAC_SHAPE)}" height="${String(MAC_SHAPE)}">`
    + `<rect width="${String(MAC_SHAPE)}" height="${String(MAC_SHAPE)}" rx="${String(MAC_RADIUS)}" ry="${String(MAC_RADIUS)}" fill="#fff"/>`
    + '</svg>',
  )
  const rounded = await sharp(SOURCE)
    .resize(MAC_SHAPE, MAC_SHAPE, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  await sharp({
    create: { width: MAC_CANVAS, height: MAC_CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: rounded, left: inset, top: inset }])
    .png()
    .toFile(join(out, 'icon-mac.png'))

  // Full-bleed for the platforms that draw what they are given.
  await sharp(SOURCE).resize(512, 512, { fit: 'cover' }).png().toFile(join(out, 'icon.png'))

  console.log('gen-desktop-icons: wrote apps/desktop/build/icon-mac.png (1024, Apple grid) and icon.png (512, full bleed).')
}

await main()
