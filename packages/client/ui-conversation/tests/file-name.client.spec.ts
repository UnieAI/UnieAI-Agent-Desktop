/**
 * The one helper the artifact list left behind. What that list asserted — which
 * calls count as producing a file — is now review.client.spec.ts's subject,
 * because the Review tab answers the same question with the change in each
 * file rather than a bare name.
 */

import { describe, expect, it } from 'vitest'
import { fileName } from '../src/client/skeleton/artifacts.ts'

describe('the name a row leads with', () => {
  it('is the last segment, on either separator', () => {
    expect(fileName('src/deep/a.ts')).toBe('a.ts')
    expect(fileName('C:\\src\\a.ts')).toBe('a.ts')
  })

  it('falls back to the whole path when there is no segment', () => {
    expect(fileName('a.ts')).toBe('a.ts')
    expect(fileName('/')).toBe('/')
  })
})
