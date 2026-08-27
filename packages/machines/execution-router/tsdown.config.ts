import { defineConfig } from 'tsdown'

// The two routed providers mount as two rows, so each is its own entry. The
// workspace config bundles only `{index,invariant,startup}`, so a subpath
// outside that set has no output at all unless it is named here — and a
// missing bundle is invisible in this repository until an installed tree
// runs, because tests resolve `src`.
export default defineConfig({
  entry: {
    index: 'lib/types/index.js',
    invariant: 'lib/types/invariant.js',
    fs: 'lib/types/fs.js',
    subprocess: 'lib/types/subprocess.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
