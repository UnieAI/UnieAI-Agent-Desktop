import { defineConfig } from 'tsdown'

// The `chromium` face builds as its own entry, the same shape as
// sandbox-windows-acl's runner. The workspace config bundles only
// `{index,invariant,startup}`, so a subpath outside that set has no output at
// all unless it is named here — and a missing bundle is invisible in this
// repository until an installed tree runs, because tests resolve `src`.
export default defineConfig({
  entry: { index: 'lib/types/index.js', invariant: 'lib/types/invariant.js', chromium: 'lib/types/chromium.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
