// @vitest-environment jsdom
/**
 * The marks: the two vendors whose logos this fork draws get their drawings,
 * and everything else gets a monogram tile in a colour rather than a
 * redrawing of a logo from memory.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ConnectorMark } from '../src/client/ConnectorMark.tsx'

afterEach(cleanup)

describe('ConnectorMark', () => {
  it('draws Google and Microsoft as their vendors publish them', () => {
    const { container } = render(<><ConnectorMark id="google" label="Google" /><ConnectorMark id="microsoft" label="Microsoft" /></>)
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(container.querySelectorAll('path')).toHaveLength(4)
    expect(container.querySelectorAll('rect')).toHaveLength(4)
  })

  it('gives a connector this fork ships no drawing of a tile in its own colour', () => {
    const { container } = render(<ConnectorMark id="notion" label="Notion" />)
    const tile = container.querySelector('[data-tile="true"]') as HTMLElement
    expect(tile.textContent).toBe('N')
    expect(tile.style.background).toBe('rgb(17, 17, 17)')
  })

  it('gives a connector nobody declared a colour for the neutral tile', () => {
    const { container } = render(<ConnectorMark id="whatever" label="Whatever" />)
    const tile = container.querySelector('[data-tile="true"]') as HTMLElement
    expect(tile.textContent).toBe('W')
    expect(tile.style.background).toBe('rgb(107, 114, 128)')
  })

  it('falls back to the id when a connector was registered with no label', () => {
    const { container } = render(<ConnectorMark id="acme" label="" />)
    expect((container.querySelector('[data-tile="true"]') as HTMLElement).textContent).toBe('A')
  })
})
