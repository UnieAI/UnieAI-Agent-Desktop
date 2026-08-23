import { clientLibrary } from '../../client/tsdown.client.ts'

export default clientLibrary(
  '@unieai/uad-client-test-runtime',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
