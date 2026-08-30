import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  // The UnieAI manifest, not the upstream harness's: the rebrand renamed the
  // app and replaced the single SVG mark with the PNG set a launcher can use
  // at both sizes, plus a maskable one for Android's icon mask.
  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'UnieAI Agent',
    short_name: 'UnieAI',
    description: 'A polished AI workspace for research, documents, code, and agent-driven tasks.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['productivity', 'developer'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
})

it('ships every icon the manifest and the markup name', async () => {
  const manifest = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8')) as {
    icons: { src: string }[]
  }
  // A manifest naming an icon the build does not emit installs an app with a
  // blank tile, and nothing else in the build would notice.
  for (const icon of manifest.icons) {
    await expect(access(join(DIST_ROOT, icon.src.replace(/^\//u, '')))).resolves.toBeUndefined()
  }
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  for (const href of [...index.matchAll(/<link[^>]+href="(\/(?:favicon\.ico|icons\/[^"]+))"/gu)].map(m => m[1])) {
    await expect(access(join(DIST_ROOT, (href as string).replace(/^\//u, '')))).resolves.toBeUndefined()
  }
})
