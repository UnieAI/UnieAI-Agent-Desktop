// The two rules that decide whether somebody is shown a tour they have already
// dismissed, and whether the last step finishes instead of walking off the end.

import { describe, expect, it } from 'vitest'
import { TOUR, positionOf } from '../src/client/tour.ts'

describe('where the tour is', () => {
  it('reports no previous step at the start and finishing at the end', () => {
    expect(positionOf(0).hasPrevious).toBe(false)
    expect(positionOf(0).isLast).toBe(false)
    expect(positionOf(TOUR.length - 1).isLast).toBe(true)
    expect(positionOf(TOUR.length - 1).hasPrevious).toBe(true)
  })

  it('clamps rather than reading past either end, because an index is arithmetic and a step is not', () => {
    expect(positionOf(-5).index).toBe(0)
    expect(positionOf(99).index).toBe(TOUR.length - 1)
    expect(positionOf(99).isLast).toBe(true)
  })

  it('finishes a one-step tour immediately, with nothing to go back to', () => {
    expect(positionOf(0, 1)).toEqual({ index: 0, hasPrevious: false, isLast: true })
  })

  it('treats an empty sequence as one that is already over', () => {
    expect(positionOf(0, 0).isLast).toBe(true)
  })
})

describe('the tour itself', () => {
  it('is the four things a person does in the first minute, in that order', () => {
    expect(TOUR.map(step => step.scene)).toEqual(['folder', 'ask', 'review', 'machine'])
  })

  it('names one scene each, so no step can silently draw another step’s picture', () => {
    expect(new Set(TOUR.map(step => step.scene)).size).toBe(TOUR.length)
  })
})
