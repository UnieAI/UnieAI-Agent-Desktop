/** What each vocabulary calls the same package, and that the two agree. */

import { describe, expect, it } from 'vitest'
import { legacyNameFor, productNameFor } from '../src/index.ts'

describe('naming the same package in both vocabularies', () => {
  it('maps the prefixed harness packages', () => {
    expect(legacyNameFor('@unieai/uad-client-runtime')).toBe('@deepseek-ai/dsh-client-runtime')
    expect(productNameFor('@deepseek-ai/dsh-client-runtime')).toBe('@unieai/uad-client-runtime')
  })

  it('maps the bare product package', () => {
    expect(legacyNameFor('@unieai/rabi')).toBe('@deepseek-ai/dsh')
    expect(productNameFor('@deepseek-ai/dsh')).toBe('@unieai/rabi')
  })

  it('maps vendored framework packages, which carry no prefix', () => {
    expect(legacyNameFor('@unieai/cordis')).toBe('@deepseek-ai/cordis')
    expect(productNameFor('@deepseek-ai/cordis')).toBe('@unieai/cordis')
    expect(productNameFor('@deepseek-ai/cordis-plugin-loader')).toBe('@unieai/cordis-plugin-loader')
  })

  it('leaves a package from any other scope alone', () => {
    // A plugin's own dependencies pass through both directions; rewriting one
    // would name a package its author never published.
    expect(legacyNameFor('@modelcontextprotocol/sdk')).toBeUndefined()
    expect(productNameFor('@modelcontextprotocol/sdk')).toBeUndefined()
    expect(legacyNameFor('react')).toBeUndefined()
    expect(productNameFor('react')).toBeUndefined()
  })

  it('round-trips, so the two directions cannot disagree', () => {
    for (const name of [
      '@unieai/rabi', '@unieai/uad-tools', '@unieai/uad-client-ui-slots',
      '@unieai/cordis', '@unieai/schemastery', '@unieai/cordis-plugin-hmr',
    ]) {
      expect(productNameFor(legacyNameFor(name) ?? '')).toBe(name)
    }
  })
})
