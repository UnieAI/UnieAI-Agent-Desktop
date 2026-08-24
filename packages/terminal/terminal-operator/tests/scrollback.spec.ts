/** The bounded replay buffer behind a reopened terminal panel. */
import { describe, expect, it } from 'vitest'
import { Scrollback } from '../src/scrollback.ts'

describe('Scrollback', () => {
  it('retains everything under the bound, in delivery order', () => {
    const buffer = new Scrollback(64)
    buffer.push('one ')
    buffer.push('two ')
    buffer.push('three')
    expect(buffer.read()).toBe('one two three')
  })

  it('ignores an empty chunk rather than storing it', () => {
    const buffer = new Scrollback(64)
    buffer.push('')
    expect(buffer.read()).toBe('')
  })

  it('evicts from the front so the newest output survives', () => {
    const buffer = new Scrollback(9)
    buffer.push('aaaaa')
    buffer.push('bbbbb')
    buffer.push('ccccc')
    expect(buffer.read()).toBe('ccccc')
  })

  it('keeps one chunk even when that chunk alone exceeds the bound', () => {
    // Otherwise a single large write — one `cat` of a big file — would leave
    // a reopened panel with nothing at all, which reads as a dead terminal.
    const buffer = new Scrollback(4)
    buffer.push('a much longer chunk than the bound')
    expect(buffer.read()).toBe('a much longer chunk than the bound')
  })

  it('measures the bound in UTF-8 bytes, not code units', () => {
    const buffer = new Scrollback(9)
    buffer.push('中文字')
    buffer.push('!')
    expect(buffer.read()).toBe('!')
  })

  it('forgets everything on clear', () => {
    const buffer = new Scrollback(64)
    buffer.push('gone')
    buffer.clear()
    expect(buffer.read()).toBe('')
  })
})
