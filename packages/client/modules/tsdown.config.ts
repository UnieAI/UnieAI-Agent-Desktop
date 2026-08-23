import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@unieai/uad-client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
