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
  // The four entries share a module, which rolldown splits into a chunk. Its
  // default name carries a content hash, and a hashed filename cannot be named
  // in `files` — so the chunk was never published, and an installed tree died
  // on `ERR_MODULE_NOT_FOUND` importing it while every test here passed,
  // because tests resolve `src`. That is the failure this file's first comment
  // describes, one level down.
  //
  // A fixed name rather than one bundle per entry: the shared module exports
  // `RoutedFileSystem`, and duplicating a class across entries gives the two
  // rows two classes, which is an identity failure rather than a size one.
  outputOptions: { chunkFileNames: 'shared.js' },
})
