import { defineConfig } from 'tsdown'

// `index` and `invariant` share the module holding the grant reader, which
// rolldown splits into a chunk. Its default name carries a content hash, and a
// hashed filename cannot be named in `files` — so the chunk goes unpublished
// and an installed tree dies on `ERR_MODULE_NOT_FOUND` while every test here
// passes, because tests resolve `src`. A fixed name is what makes it
// nameable; the alternative, one bundle per entry, would give the two entries
// two copies of the reader that decides whether a stored grant is this
// package's, which is an identity failure rather than a size one.
export default defineConfig({
  entry: {
    index: 'lib/types/index.js',
    invariant: 'lib/types/invariant.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  outputOptions: { chunkFileNames: 'shared.js' },
})
