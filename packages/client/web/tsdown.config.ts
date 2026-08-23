import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@unieai/uad-client-web',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
